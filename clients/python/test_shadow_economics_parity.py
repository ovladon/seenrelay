import unittest
from types import SimpleNamespace

from seenrelay import ReuseDecision
from seenrelay_economics import evaluate_hostile_benchmark
from seenrelay_shadow import SeenRelayShadowProof


CONTROLS = {
    "local_cache": {"available": False, "measured": False},
    "source_native_conditional": {"available": False, "measured": False},
    "provider_native_cache": {"available": False, "measured": False},
}


class BenchmarkFakeClient:
    def __init__(self, entries):
        self.entries = list(entries)
        self.reset_telemetry()

    def reset_telemetry(self):
        self.telemetry = SimpleNamespace(
            check_network_requests=0,
            check_network_latency_ms_total=0.0,
            check_network_latency_ms_average=0.0,
            observe_network_requests=0,
            observe_network_latency_ms_total=0.0,
            observe_network_latency_ms_average=0.0,
        )

    def get_telemetry(self):
        return SimpleNamespace(**vars(self.telemetry))

    def guard_detailed(self, *, fact, known_value, validate, reuse=None, max_age_seconds=None, observation=None):
        if reuse is not None:
            raise AssertionError("Shadow Proof must force reuse=None")
        entry = self.entries.pop(0)
        check_requests = entry.get("check_requests", 1)
        self.telemetry.check_network_requests += check_requests
        self.telemetry.check_network_latency_ms_total += entry.get("check_ms", 2.0)
        if self.telemetry.check_network_requests:
            self.telemetry.check_network_latency_ms_average = (
                self.telemetry.check_network_latency_ms_total / self.telemetry.check_network_requests
            )
        check = entry.get("check")
        value = validate(SimpleNamespace(check=check, conditional_headers={}))
        observe_requests = entry.get("observe_requests", 1)
        self.telemetry.observe_network_requests += observe_requests
        self.telemetry.observe_network_latency_ms_total += entry.get("observe_ms", 3.0)
        if self.telemetry.observe_network_requests:
            self.telemetry.observe_network_latency_ms_average = (
                self.telemetry.observe_network_latency_ms_total / self.telemetry.observe_network_requests
            )
        return SimpleNamespace(value=entry.get("value", value), check=check)


class PythonShadowBenchmarkParityTests(unittest.TestCase):
    def test_safe_benchmark_export_is_sanitized_and_schema_v2(self):
        proof = SeenRelayShadowProof(BenchmarkFakeClient([
            {"check": {"status": "SAME_OBSERVED"}, "value": {"x": 1}}
        ]))
        result = proof.guard(
            fact={"source_url": "https://secret.invalid/item", "predicate": "item.value"},
            known_value={"x": 1},
            validate=lambda _ctx: {"x": 1},
            benchmark={
                "reuse": lambda _check, value: ReuseDecision(True, value),
                "baseline_cost": 5,
                "check_cost": 1,
                "observe_cost": 2,
            },
        )
        self.assertEqual(result, {"x": 1})
        self.assertTrue(proof.snapshot()["safety_pass"])
        exported = proof.hostile_benchmark_input(workload_id="opaque", controls=CONTROLS)
        self.assertEqual(exported["schema_version"], 2)
        self.assertEqual(exported["sample_type"], "natural_workload")
        self.assertEqual(exported["baseline_definition"], "best_existing_non_shared_path")
        self.assertEqual(len(exported["records"]), 1)
        record = exported["records"][0]
        self.assertTrue(record["policy_reusable"])
        self.assertTrue(record["reuse_would_match_validation"])
        self.assertNotIn("source", record)
        self.assertNotIn("fact", record)
        self.assertNotIn("known_value", record)
        self.assertNotIn("validated_value", record)
        self.assertFalse(proof.benchmark_snapshot()["raw_values_retained"])
        self.assertFalse(proof.benchmark_snapshot()["timestamps_retained"])

    def test_mismatch_fails_safety_even_though_authoritative_validation_returns(self):
        proof = SeenRelayShadowProof(BenchmarkFakeClient([
            {"check": {"status": "SAME_OBSERVED"}, "value": {"x": 2}}
        ]))
        self.assertEqual(
            proof.guard(fact={}, known_value={"x": 1}, validate=lambda _ctx: {"x": 2}),
            {"x": 2},
        )
        self.assertFalse(proof.snapshot()["safety_pass"])

    def test_check_unavailable_is_retained_in_schema_v2(self):
        proof = SeenRelayShadowProof(BenchmarkFakeClient([{"check": None}]))
        proof.guard(fact={}, known_value=1, validate=lambda _ctx: 1, benchmark={"baseline_cost": 1})
        exported = proof.hostile_benchmark_input(controls=CONTROLS)
        self.assertIsNone(exported["records"][0]["check_status"])

    def test_record_overflow_invalidates_export_instead_of_truncating(self):
        proof = SeenRelayShadowProof(
            BenchmarkFakeClient([{"check": {"status": "UNKNOWN"}}, {"check": {"status": "UNKNOWN"}}]),
            benchmark_record_limit=1,
        )
        for _ in range(2):
            proof.guard(fact={}, known_value=1, validate=lambda _ctx: 1, benchmark={})
        with self.assertRaises(RuntimeError):
            proof.hostile_benchmark_input(controls=CONTROLS)

    def test_concurrent_telemetry_attribution_fails_closed(self):
        proof = SeenRelayShadowProof(BenchmarkFakeClient([
            {"check": {"status": "UNKNOWN"}, "check_requests": 2, "check_ms": 4}
        ]))
        proof.guard(fact={}, known_value=1, validate=lambda _ctx: 1, benchmark={})
        self.assertIn("ambiguous_per_call_relay_timings", proof.benchmark_snapshot()["invalid_reasons"])
        with self.assertRaises(RuntimeError):
            proof.hostile_benchmark_input(controls=CONTROLS)

    def test_simulated_reuse_never_suppresses_authoritative_validation(self):
        validations = 0
        proof = SeenRelayShadowProof(BenchmarkFakeClient([
            {"check": {"status": "SAME_OBSERVED"}}
        ]))

        def validate(_ctx):
            nonlocal validations
            validations += 1
            return 7

        proof.guard(
            fact={},
            known_value=7,
            validate=validate,
            benchmark={"reuse": lambda _check, value: ReuseDecision(True, value)},
        )
        self.assertEqual(validations, 1)


class PythonHostileEconomicsParityTests(unittest.TestCase):
    @staticmethod
    def record(*, status="SAME_OBSERVED", reuse=True, match=True, base=100, check=5, observe=10,
               baseline_cost=10, check_cost=1, observe_cost=2):
        return {
            "check_status": status,
            "policy_reusable": reuse,
            "reuse_would_match_validation": match if reuse else None,
            "observe_after_baseline": True,
            "baseline_ms": base,
            "baseline_cost": baseline_cost,
            "check_ms": check,
            "observe_ms": observe,
            "check_cost": check_cost,
            "observe_cost": observe_cost,
        }

    @staticmethod
    def input(records, controls=CONTROLS):
        return {
            "schema_version": 2,
            "workload_id": "parity-fixture",
            "sample_type": "natural_workload",
            "baseline_definition": "best_existing_non_shared_path",
            "controls": controls,
            "observe_off_critical_path": False,
            "records": records,
        }

    def test_safe_positive_fixture_matches_js_evaluator_contract(self):
        result = evaluate_hostile_benchmark(self.input([self.record(), self.record()]))
        self.assertEqual(result["evaluator_version"], 2)
        self.assertEqual(result["calls"], 2)
        self.assertTrue(result["safety"]["pass"])
        self.assertEqual(result["latency"]["baseline_total_ms"], 200)
        self.assertEqual(result["latency"]["prospective_total_ms"], 10)
        self.assertEqual(result["cost"]["baseline_total_units"], 20)
        self.assertEqual(result["cost"]["prospective_total_units"], 2)
        self.assertTrue(result["decision"]["beats_baseline_on_both"])
        self.assertFalse(result["decision"]["automatic_reuse_enabled_by_evaluator"])

    def test_check_unavailable_stays_in_cohort_and_cannot_fake_safety(self):
        record = self.record(status=None, reuse=False, match=None)
        result = evaluate_hostile_benchmark(self.input([record]))
        self.assertEqual(result["status_counts"]["CHECK_UNAVAILABLE"], 1)
        self.assertIsNone(result["safety"]["pass"])
        self.assertFalse(result["decision"]["beats_baseline_on_both"])

    def test_one_unsafe_hypothetical_reuse_fails(self):
        result = evaluate_hostile_benchmark(self.input([self.record(match=False)]))
        self.assertFalse(result["safety"]["pass"])
        self.assertFalse(result["decision"]["beats_baseline_on_both"])

    def test_available_unmeasured_native_control_is_rejected(self):
        controls = {name: dict(value) for name, value in CONTROLS.items()}
        controls["local_cache"] = {"available": True, "measured": False}
        with self.assertRaises(RuntimeError):
            evaluate_hostile_benchmark(self.input([self.record()], controls=controls))


if __name__ == "__main__":
    unittest.main()
