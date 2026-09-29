import asyncio
import json
import os
import unittest

from seenrelay_fleet import (
    InMemoryFleetCoordinationStore,
    SeenRelayFleetCoordinator,
    create_fleet_savings_ledger,
    create_redis_rest_fleet_store,
    fleet_codec_from_private_codec,
)
from seenrelay_zero_state import create_aes_gcm_private_codec


COORDINATE = {
    "provider": "openai",
    "operation": "responses",
    "model": "gpt-example",
    "request": {"prompt": "same"},
}
POLICY = {
    "side_effect_class": "read_only",
    "exact_single_answer_shareable": True,
    "independent_samples_required": False,
}


def codec():
    return fleet_codec_from_private_codec(create_aes_gcm_private_codec(os.urandom(32)))


class FleetTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_coordinators_collapse_one_exact_execution(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.03)
            return {"answer": 42}

        ra, rb = await asyncio.gather(
            a.run(coordinate=COORDINATE, policy=POLICY, execute=execute),
            b.run(coordinate=COORDINATE, policy=POLICY, execute=execute),
        )
        self.assertEqual(ra, {"answer": 42})
        self.assertEqual(rb, {"answer": 42})
        self.assertEqual(calls, 1)
        self.assertEqual(a.get_telemetry()["leader_executions"] + b.get_telemetry()["leader_executions"], 1)
        self.assertEqual(a.get_telemetry()["follower_reuses"] + b.get_telemetry()["follower_reuses"], 1)

    async def test_completed_result_is_not_sequential_cache(self):
        store = InMemoryFleetCoordinationStore()
        c = SeenRelayFleetCoordinator(store=store, codec=codec(), scope_key="tenant-fleet-a")
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            return calls

        self.assertEqual(await c.run(coordinate=COORDINATE, policy=POLICY, execute=execute), 1)
        self.assertEqual(await c.run(coordinate=COORDINATE, policy=POLICY, execute=execute), 2)
        self.assertEqual(calls, 2)

    async def test_different_scopes_never_coordinate(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-b", poll_ms=2)
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.02)
            return calls

        await asyncio.gather(
            a.run(coordinate=COORDINATE, policy=POLICY, execute=execute),
            b.run(coordinate=COORDINATE, policy=POLICY, execute=execute),
        )
        self.assertEqual(calls, 2)

    async def test_unsafe_and_independent_sampling_pass_through(self):
        store = InMemoryFleetCoordinationStore()
        c = SeenRelayFleetCoordinator(store=store, codec=codec(), scope_key="tenant-fleet-a")
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            return calls

        await c.run(
            coordinate=COORDINATE,
            policy={"side_effect_class": "mutation", "exact_single_answer_shareable": True},
            execute=execute,
        )
        await c.run(
            coordinate=COORDINATE,
            policy={
                "side_effect_class": "read_only",
                "exact_single_answer_shareable": True,
                "independent_samples_required": True,
            },
            execute=execute,
        )
        self.assertEqual(calls, 2)
        self.assertEqual(c.get_telemetry()["policy_passthrough"], 2)

    async def test_camel_case_policy_is_accepted_for_shared_config_parity(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.02)
            return 7

        policy = {
            "sideEffectClass": "read_only",
            "exactSingleAnswerShareable": True,
            "independentSamplesRequired": False,
        }
        await asyncio.gather(
            a.run(coordinate=COORDINATE, policy=policy, execute=execute),
            b.run(coordinate=COORDINATE, policy=policy, execute=execute),
        )
        self.assertEqual(calls, 1)

    async def test_native_zero_cost_exact_cache_wins(self):
        store = InMemoryFleetCoordinationStore()
        c = SeenRelayFleetCoordinator(store=store, codec=codec(), scope_key="tenant-fleet-a")
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            return 1

        value = await c.run(
            coordinate=COORDINATE,
            policy={
                **POLICY,
                "native_control": {
                    "exact_response_cache": True,
                    "cache_hit_marginal_cost_zero": True,
                },
            },
            execute=execute,
        )
        self.assertEqual(value, 1)
        self.assertEqual(calls, 1)
        self.assertEqual(c.get_telemetry()["native_control_passthrough"], 1)
        self.assertEqual(c.get_telemetry()["leader_claims"], 0)

    async def test_leader_failure_makes_follower_fail_open(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        calls = 0

        async def bad():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.02)
            raise RuntimeError("provider failed")

        async def good():
            nonlocal calls
            calls += 1
            return {"fallback": True}

        leader = asyncio.create_task(a.run(coordinate=COORDINATE, policy=POLICY, execute=bad))
        await asyncio.sleep(0.002)
        follower = asyncio.create_task(b.run(coordinate=COORDINATE, policy=POLICY, execute=good))
        with self.assertRaisesRegex(RuntimeError, "provider failed"):
            await leader
        self.assertEqual(await follower, {"fallback": True})
        self.assertEqual(calls, 2)
        self.assertEqual(b.get_telemetry()["fail_open_executions"], 1)

    async def test_oversize_result_stays_leader_local(self):
        store = InMemoryFleetCoordinationStore()
        c = SeenRelayFleetCoordinator(
            store=store, codec=codec(), scope_key="tenant-fleet-a", max_sealed_bytes=64
        )
        value = await c.run(
            coordinate=COORDINATE,
            policy=POLICY,
            execute=lambda: {"blob": "x" * 1000},
        )
        self.assertEqual(len(value["blob"]), 1000)
        self.assertEqual(c.get_telemetry()["oversize_results"], 1)

    async def test_follower_receipt_and_ledger_count_only_actual_avoidance(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        ledger = create_fleet_savings_ledger()
        receipts = []
        calls = 0

        async def on_receipt(receipt):
            receipts.append(receipt)
            ledger.record(receipt)

        async def execute():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.03)
            return {"answer": 42}

        cost = {"marginal_cost_usd": 1.44, "provenance": "provider_list_price"}
        await asyncio.gather(
            a.run(coordinate=COORDINATE, policy=POLICY, execute=execute, cost=cost, on_receipt=on_receipt),
            b.run(coordinate=COORDINATE, policy=POLICY, execute=execute, cost=cost, on_receipt=on_receipt),
        )
        self.assertEqual(calls, 1)
        self.assertEqual(len(receipts), 2)
        follower = next(r for r in receipts if r["path"] == "follower_reuse")
        leader = next(r for r in receipts if r["path"] == "leader_execution")
        self.assertEqual(follower["avoided_executions"], 1)
        self.assertEqual(follower["gross_avoided_cost_usd"], 1.44)
        self.assertEqual(follower["cost_provenance"], "provider_list_price")
        self.assertEqual(leader["avoided_executions"], 0)
        self.assertIsNone(leader["gross_avoided_cost_usd"])
        snapshot = ledger.snapshot()
        self.assertEqual(snapshot["avoided_executions"], 1)
        self.assertEqual(snapshot["costed_avoided_executions"], 1)
        self.assertAlmostEqual(snapshot["gross_avoided_cost_usd"], 1.44)

    async def test_unknown_cost_keeps_dollars_unknown(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        ledger = create_fleet_savings_ledger()
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.02)
            return 9

        await asyncio.gather(
            a.run(coordinate=COORDINATE, policy=POLICY, execute=execute, on_receipt=ledger.record),
            b.run(coordinate=COORDINATE, policy=POLICY, execute=execute, on_receipt=ledger.record),
        )
        snap = ledger.snapshot()
        self.assertEqual(calls, 1)
        self.assertEqual(snap["avoided_executions"], 1)
        self.assertEqual(snap["uncosted_avoided_executions"], 1)
        self.assertEqual(snap["gross_avoided_cost_usd"], 0.0)

    async def test_result_cost_resolver_can_be_async(self):
        store = InMemoryFleetCoordinationStore()
        shared_codec = codec()
        a = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        b = SeenRelayFleetCoordinator(store=store, codec=shared_codec, scope_key="tenant-fleet-a", poll_ms=2)
        receipts = []

        async def execute():
            await asyncio.sleep(0.02)
            return {"usage": {"billed_usd": 0.75}}

        async def resolver(value):
            return value["usage"]["billed_usd"]

        cost = {"provenance": "provider_reported", "resolve_marginal_cost_usd": resolver}
        await asyncio.gather(
            a.run(coordinate=COORDINATE, policy=POLICY, execute=execute, cost=cost, on_receipt=receipts.append),
            b.run(coordinate=COORDINATE, policy=POLICY, execute=execute, cost=cost, on_receipt=receipts.append),
        )
        follower = next(r for r in receipts if r["path"] == "follower_reuse")
        self.assertEqual(follower["cost_resolution"], "resolved")
        self.assertEqual(follower["gross_avoided_cost_usd"], 0.75)

    async def test_receipt_callback_and_bad_cost_never_break_result(self):
        store = InMemoryFleetCoordinationStore()
        c = SeenRelayFleetCoordinator(store=store, codec=codec(), scope_key="tenant-fleet-a")

        def broken(_receipt):
            raise RuntimeError("analytics down")

        value = await c.run(
            coordinate=COORDINATE,
            policy=POLICY,
            execute=lambda: {"ok": True},
            cost={"marginal_cost_usd": -1},
            on_receipt=broken,
        )
        self.assertEqual(value, {"ok": True})
        self.assertEqual(c.get_telemetry()["receipt_failures"], 2)

    async def test_store_failure_fails_open(self):
        class BrokenStore:
            async def try_claim(self, **_kwargs):
                raise RuntimeError("down")
            async def read(self, **_kwargs):
                raise RuntimeError("down")
            async def publish(self, **_kwargs):
                raise RuntimeError("down")
            async def fail(self, **_kwargs):
                raise RuntimeError("down")

        c = SeenRelayFleetCoordinator(store=BrokenStore(), codec=codec(), scope_key="tenant-fleet-a")
        calls = 0

        async def execute():
            nonlocal calls
            calls += 1
            return "source"

        self.assertEqual(
            await c.run(coordinate=COORDINATE, policy=POLICY, execute=execute),
            "source",
        )
        self.assertEqual(calls, 1)
        self.assertEqual(c.get_telemetry()["store_failures"], 1)
        self.assertEqual(c.get_telemetry()["fail_open_executions"], 1)


class _FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class RedisRestFleetStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_atomic_eval_claim_and_publish_shape(self):
        calls = []

        def opener(request, _timeout):
            command = json.loads(request.data.decode("utf-8"))
            calls.append(command)
            if command[0] == "EVAL" and "return {1, ARGV[1]}" in command[1]:
                return _FakeResponse({"result": [1, command[4]]})
            if command[0] == "EVAL" and "KEYS[2]" in command[1]:
                return _FakeResponse({"result": 1})
            return _FakeResponse({"result": None})

        store = create_redis_rest_fleet_store(
            url="https://redis.example",
            token="secret",
            opener=opener,
            now=lambda: 1000.0,
        )
        claim = await store.try_claim(
            scope_hash="scopehash",
            coordinate_key="coordinatehash",
            owner_id="owner-a",
            lease_ms=1000,
        )
        self.assertEqual(claim["role"], "leader")
        self.assertTrue(await store.publish(
            scope_hash="scopehash",
            coordinate_key="coordinatehash",
            generation=claim["generation"],
            owner_id="owner-a",
            pending_token=claim["pending_token"],
            sealed_result="ciphertext",
        ))
        self.assertEqual(calls[0][0:3], ["EVAL", calls[0][1], "1"])
        self.assertIn("scopehash", calls[0][3])
        self.assertEqual(calls[1][0], "EVAL")
        self.assertEqual(calls[1][2], "2")

    async def test_completed_lock_torn_read_rechecks_result(self):
        generation = "gen-a"
        pending = f"P|{generation}|owner-a|999999"
        sequence = iter([
            {"result": None},
            {"result": f"C|{generation}|owner-a|999999"},
            {"result": "ciphertext"},
        ])

        def opener(_request, _timeout):
            return _FakeResponse(next(sequence))

        store = create_redis_rest_fleet_store(
            url="https://redis.example",
            token="secret",
            opener=opener,
            now=lambda: 1000.0,
        )
        state = await store.read(
            scope_hash="scopehash",
            coordinate_key="coordinatehash",
            generation=generation,
            pending_token=pending,
        )
        self.assertEqual(state, {"status": "completed", "sealed_result": "ciphertext"})


if __name__ == "__main__":
    unittest.main()
