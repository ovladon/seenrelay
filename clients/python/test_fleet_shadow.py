import asyncio
import unittest

from seenrelay_fleet import (
    InMemoryFleetShadowStore,
    SeenRelayFleetShadowMeter,
    wrap_fleet_shadow_call,
)


POLICY = {
    "side_effect_class": "read_only",
    "exact_single_answer_shareable": True,
}


class FleetShadowTests(unittest.IsolatedAsyncioTestCase):
    async def test_identical_inflight_calls_are_measured_but_both_execute(self):
        store = InMemoryFleetShadowStore()
        first = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        second = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        executions = 0

        async def authoritative(value):
            nonlocal executions
            executions += 1
            await asyncio.sleep(0.02)
            return {"value": value}

        a = wrap_fleet_shadow_call(
            first,
            authoritative,
            policy=POLICY,
            cost={"marginal_cost_usd": 0.25, "provenance": "test_observed"},
        )
        b = wrap_fleet_shadow_call(
            second,
            authoritative,
            policy=POLICY,
            cost={"marginal_cost_usd": 0.25, "provenance": "test_observed"},
        )

        values = await asyncio.gather(a(7), b(7))
        self.assertEqual(values, [{"value": 7}, {"value": 7}])
        self.assertEqual(executions, 2)

        reports = [first.get_report(), second.get_report()]
        self.assertEqual(sum(r["shadowLeaderStarts"] for r in reports), 1)
        self.assertEqual(sum(r["callsWithIdenticalInflightPredecessor"] for r in reports), 1)
        self.assertEqual(sum(r["authoritativeExecutions"] for r in reports), 2)
        self.assertAlmostEqual(
            sum(r["overlappedFollowerObservedCostUsd"] for r in reports),
            0.25,
        )
        self.assertTrue(all(r["authoritativeSuppressionEnabled"] is False for r in reports))

    async def test_different_arguments_are_not_exact_overlap(self):
        store = InMemoryFleetShadowStore()
        first = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        second = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")

        async def authoritative(value):
            await asyncio.sleep(0.01)
            return value

        a = wrap_fleet_shadow_call(first, authoritative, policy=POLICY)
        b = wrap_fleet_shadow_call(second, authoritative, policy=POLICY)
        await asyncio.gather(a(1), b(2))

        reports = [first.get_report(), second.get_report()]
        self.assertEqual(sum(r["shadowLeaderStarts"] for r in reports), 2)
        self.assertEqual(sum(r["callsWithIdenticalInflightPredecessor"] for r in reports), 0)

    async def test_coordinate_builder_failure_is_fail_open_and_unclassified(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        executions = 0

        async def authoritative(value):
            nonlocal executions
            executions += 1
            return value

        def broken_coordinate(*_args, **_kwargs):
            raise RuntimeError("coordinate bug")

        wrapped = wrap_fleet_shadow_call(
            meter,
            authoritative,
            policy=POLICY,
            coordinate_from_args=broken_coordinate,
        )
        self.assertEqual(await wrapped(3), 3)
        report = meter.get_report()
        self.assertEqual(executions, 1)
        self.assertEqual(report["coordinateFailures"], 1)
        self.assertEqual(report["unclassifiedEligibleCalls"], 1)
        self.assertEqual(report["authoritativeExecutions"], 1)

    async def test_store_failure_is_fail_open_and_unclassified(self):
        class BrokenStore:
            async def try_claim(self, **_kwargs):
                raise RuntimeError("store down")
            async def fail(self, **_kwargs):
                return True

        meter = SeenRelayFleetShadowMeter(store=BrokenStore(), scope_key="tenant-shadow-a")
        executions = 0

        async def authoritative():
            nonlocal executions
            executions += 1
            return "source"

        value = await meter.measure(
            coordinate={"id": 1},
            policy=POLICY,
            execute=authoritative,
        )
        self.assertEqual(value, "source")
        report = meter.get_report()
        self.assertEqual(executions, 1)
        self.assertEqual(report["storeFailures"], 1)
        self.assertEqual(report["unclassifiedEligibleCalls"], 1)

    async def test_mutation_policy_is_not_overlap_candidate(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        value = await meter.measure(
            coordinate={"id": 1},
            policy={"side_effect_class": "mutation", "exact_single_answer_shareable": True},
            execute=lambda: "done",
        )
        self.assertEqual(value, "done")
        report = meter.get_report()
        self.assertEqual(report["policyIneligibleCalls"], 1)
        self.assertEqual(report["eligibleCalls"], 0)
        self.assertEqual(report["authoritativeExecutions"], 1)

    async def test_independent_sampling_is_not_overlap_candidate(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        await meter.measure(
            coordinate={"sample": "x"},
            policy={
                **POLICY,
                "independent_samples_required": True,
            },
            execute=lambda: 1,
        )
        report = meter.get_report()
        self.assertEqual(report["policyIneligibleCalls"], 1)
        self.assertEqual(report["shadowLeaderStarts"], 0)

    async def test_zero_cost_native_exact_cache_dominates(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        await meter.measure(
            coordinate={"id": 1},
            policy={
                **POLICY,
                "native_control": {
                    "exact_response_cache": True,
                    "cache_hit_marginal_cost_zero": True,
                },
            },
            execute=lambda: 1,
        )
        report = meter.get_report()
        self.assertEqual(report["nativeControlDominatedCalls"], 1)
        self.assertEqual(report["eligibleCalls"], 0)

    async def test_cost_resolver_failure_does_not_invent_savings(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")

        async def broken_cost(_value):
            raise RuntimeError("billing unavailable")

        self.assertEqual(
            await meter.measure(
                coordinate={"id": 1},
                policy=POLICY,
                execute=lambda: "value",
                cost={
                    "resolve_marginal_cost_usd": broken_cost,
                    "provenance": "billing_api",
                },
            ),
            "value",
        )
        report = meter.get_report()
        self.assertEqual(report["costResolutionFailures"], 1)
        self.assertEqual(report["uncostedExecutions"], 1)
        self.assertEqual(report["observedCostUsd"], 0)

    async def test_authoritative_failure_is_never_hidden(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")

        async def authoritative():
            raise ValueError("source failed")

        with self.assertRaisesRegex(ValueError, "source failed"):
            await meter.measure(
                coordinate={"id": 1},
                policy=POLICY,
                execute=authoritative,
            )
        report = meter.get_report()
        self.assertEqual(report["failedExecutions"], 1)
        self.assertEqual(report["successfulExecutions"], 0)

    async def test_camel_case_policy_matches_javascript_contract(self):
        store = InMemoryFleetShadowStore()
        meter = SeenRelayFleetShadowMeter(store=store, scope_key="tenant-shadow-a")
        await meter.measure(
            coordinate={"id": 1},
            policy={
                "sideEffectClass": "read_only",
                "exactSingleAnswerShareable": True,
                "independentSamplesRequired": False,
            },
            execute=lambda: 1,
        )
        self.assertEqual(meter.get_report()["eligibleCalls"], 1)


if __name__ == "__main__":
    unittest.main()
