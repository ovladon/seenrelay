import asyncio
import os
import unittest

from seenrelay_zero_state import (
    SeenRelayZeroState,
    create_aes_gcm_private_codec,
    fresh_result,
    not_modified_result,
    sha256_json_fingerprint,
)


class MemoryStore:
    def __init__(self):
        self.values = {}
    async def get(self, key):
        return self.values.get(key)
    async def set(self, key, value):
        self.values[key] = value


class ZeroStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_default_ttl_never_suppresses_validation(self):
        calls = 0
        edge = SeenRelayZeroState()
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            return {"v": calls}
        a = await edge.guard(coordinate={"tool":"read","id":1}, validate=validate)
        b = await edge.guard(coordinate={"tool":"read","id":1}, validate=validate)
        self.assertEqual(a, {"v":1})
        self.assertEqual(b, {"v":2})
        self.assertEqual(calls, 2)

    async def test_local_positive_ttl_reuses(self):
        calls = 0
        edge = SeenRelayZeroState(local_max_age_ms=1000)
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            return {"v":1}
        await edge.guard(coordinate={"id":1}, validate=validate)
        value = await edge.guard(coordinate={"id":1}, validate=validate)
        self.assertEqual(value, {"v":1})
        self.assertEqual(calls, 1)
        self.assertEqual(edge.get_telemetry()["edge"]["local_fresh_hits"], 1)

    async def test_inflight_identical_calls_coalesce(self):
        calls = 0
        edge = SeenRelayZeroState()
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.01)
            return {"v":1}
        a, b = await asyncio.gather(
            edge.guard(coordinate={"id":1}, validate=validate),
            edge.guard(coordinate={"id":1}, validate=validate),
        )
        self.assertEqual(a, b)
        self.assertEqual(calls, 1)
        self.assertEqual(edge.get_telemetry()["edge"]["inflight_coalesced"], 1)

    async def test_private_l1_reuses_across_workers(self):
        store = MemoryStore()
        codec = create_aes_gcm_private_codec(os.urandom(32))
        calls = 0
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            return fresh_result({"price": 7})
        first = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=10_000)
        second = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=10_000)
        await first.guard(coordinate={"tool":"catalog.read","arguments":{"id":42}}, validate=validate)
        value = await second.guard(coordinate={"tool":"catalog.read","arguments":{"id":42}}, validate=validate)
        self.assertEqual(value, {"price":7})
        self.assertEqual(calls, 1)
        self.assertEqual(second.get_telemetry()["edge"]["private_fresh_hits"], 1)

    async def test_zero_ttl_without_validator_retains_no_local_or_private_value(self):
        store = MemoryStore()
        codec = create_aes_gcm_private_codec(os.urandom(32))
        edge = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=0)
        await edge.guard(coordinate={"id":1}, validate=lambda _headers=None: fresh_result({"v":1}))
        self.assertEqual(store.values, {})
        self.assertEqual(len(edge._entries), 0)
        self.assertEqual(edge.get_telemetry()["edge"]["private_writes"], 0)

    async def test_private_ttl_zero_can_still_retain_validator_for_304(self):
        store = MemoryStore()
        codec = create_aes_gcm_private_codec(os.urandom(32))
        first = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=0)
        second = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=0)
        await first.guard(coordinate={"id":1}, validate=lambda _headers=None: fresh_result({"v":1}, {"etag":"\"abc\""}))
        observed = {}
        async def second_validate(headers):
            observed.update(headers)
            return not_modified_result({"etag":"\"abc\""})
        value = await second.guard(coordinate={"id":1}, validate=second_validate)
        self.assertEqual(value, {"v":1})
        self.assertEqual(observed, {"If-None-Match":"\"abc\""})
        self.assertEqual(second.get_telemetry()["edge"]["source_not_modified_hits"], 1)

    async def test_future_confirmed_private_entry_from_clock_skew_fails_closed(self):
        store = MemoryStore()
        codec = create_aes_gcm_private_codec(os.urandom(32))
        ahead = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=1000, now=lambda: 2000.0)
        await ahead.guard(coordinate={"id":"skew"}, validate=lambda _headers=None: fresh_result({"v":1}, {"etag":"\"v1\""}))
        behind = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=1000, now=lambda: 1000.0)
        calls = 0
        async def validate(headers):
            nonlocal calls
            calls += 1
            self.assertEqual(headers, {})
            return {"v":2}
        value = await behind.guard(coordinate={"id":"skew"}, validate=validate)
        self.assertEqual(value, {"v":2})
        self.assertEqual(calls, 1)
        self.assertEqual(behind.get_telemetry()["edge"]["private_fresh_hits"], 0)
        self.assertEqual(behind.get_telemetry()["edge"]["source_conditional_attempts"], 0)

    async def test_expired_validator_state_cannot_authorize_not_modified_reuse(self):
        now = [1000.0]
        edge = SeenRelayZeroState(local_max_age_ms=0, validator_retention_ms=50, now=lambda: now[0])
        await edge.guard(coordinate={"id": "stale"}, validate=lambda headers: fresh_result({"v": 1}, {"etag": '"v1"'}))
        now[0] = 1100.0
        async def bad_validator(headers):
            self.assertEqual(headers, {})
            return not_modified_result({"etag": '"v1"'})
        with self.assertRaisesRegex(RuntimeError, "requires a retained"):
            await edge.guard(coordinate={"id": "stale"}, validate=bad_validator)

    async def test_validator_type_error_is_not_retried(self):
        edge = SeenRelayZeroState()
        calls = 0
        async def validate(_headers):
            nonlocal calls
            calls += 1
            raise TypeError("validator bug")
        with self.assertRaisesRegex(TypeError, "validator bug"):
            await edge.guard(coordinate={"id":1}, validate=validate)
        self.assertEqual(calls, 1)

    async def test_zero_argument_validator_is_supported_without_retry_semantics(self):
        edge = SeenRelayZeroState()
        calls = 0
        async def validate():
            nonlocal calls
            calls += 1
            return {"ok": True}
        value = await edge.guard(coordinate={"id":1}, validate=validate)
        self.assertEqual(value, {"ok": True})
        self.assertEqual(calls, 1)

    async def test_tampered_private_ciphertext_fails_open_to_validation(self):
        class TamperedStore:
            async def get(self, _key): return "aes256gcm-json-v1.bad.bad.bad"
            async def set(self, _key, _value): return None
        edge = SeenRelayZeroState(private_store=TamperedStore(), private_codec=create_aes_gcm_private_codec(os.urandom(32)), private_max_age_ms=1000)
        calls = 0
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            return "source"
        self.assertEqual(await edge.guard(coordinate={"id":1}, validate=validate), "source")
        self.assertEqual(calls, 1)
        self.assertEqual(edge.get_telemetry()["edge"]["private_read_failures"], 1)

    async def test_private_backend_receives_only_opaque_key_and_sealed_payload(self):
        seen = {}
        class CaptureStore:
            async def get(self, _key): return None
            async def set(self, key, value):
                seen["key"] = key
                seen["value"] = value
        edge = SeenRelayZeroState(private_store=CaptureStore(), private_codec=create_aes_gcm_private_codec(os.urandom(32)), private_max_age_ms=1000)
        await edge.guard(coordinate={"tool":"private.read","arguments":{"authorization":"Bearer do-not-store-raw"}}, validate=lambda _headers=None: {"payload":"sensitive-result"})
        self.assertRegex(seen["key"], r"^sha256:[0-9a-f]{64}$")
        self.assertNotIn("do-not-store-raw", seen["key"])
        self.assertTrue(seen["value"].startswith("aes256gcm-json-v1."))
        self.assertNotIn("sensitive-result", seen["value"])

    async def test_observation_time_bounds_freshness_and_future_time_is_clamped(self):
        now = [10_000.0]
        calls = 0
        edge = SeenRelayZeroState(local_max_age_ms=1000, now=lambda: now[0])
        async def old_validate(_headers=None):
            nonlocal calls
            calls += 1
            return fresh_result({"v":calls}, observed_at=9_300)
        await edge.guard(coordinate={"kind":"age"}, validate=old_validate)
        now[0] = 10_500
        await edge.guard(coordinate={"kind":"age"}, validate=old_validate)
        self.assertEqual(calls, 2)
        now[0] = 20_000
        future_calls = 0
        edge2 = SeenRelayZeroState(local_max_age_ms=1000, now=lambda: now[0])
        async def future_validate(_headers=None):
            nonlocal future_calls
            future_calls += 1
            return fresh_result("v", observed_at=99_999_999)
        await edge2.guard(coordinate={"kind":"future"}, validate=future_validate)
        now[0] = 21_001
        await edge2.guard(coordinate={"kind":"future"}, validate=future_validate)
        self.assertEqual(future_calls, 2)

    async def test_clear_local_and_reset_telemetry_are_explicit(self):
        calls = 0
        edge = SeenRelayZeroState(local_max_age_ms=1000)
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            return {"v": calls}
        await edge.guard(coordinate={"id":1}, validate=validate)
        edge.clear_local()
        await edge.guard(coordinate={"id":1}, validate=validate)
        self.assertEqual(calls, 2)
        edge.reset_telemetry()
        self.assertEqual(edge.get_telemetry()["edge"]["guard_calls"], 0)

    async def test_store_or_codec_failure_fails_open(self):
        class BrokenStore:
            async def get(self, _key): raise RuntimeError("down")
            async def set(self, _key, _value): raise RuntimeError("down")
        codec = create_aes_gcm_private_codec(os.urandom(32))
        edge = SeenRelayZeroState(private_store=BrokenStore(), private_codec=codec, private_max_age_ms=1000)
        calls = 0
        async def validate(_headers=None):
            nonlocal calls
            calls += 1
            return {"ok":True}
        self.assertEqual(await edge.guard(coordinate={"id":1}, validate=validate), {"ok":True})
        self.assertEqual(calls, 1)
        telemetry = edge.get_telemetry()["edge"]
        self.assertEqual(telemetry["private_read_failures"],1)
        self.assertEqual(telemetry["private_write_failures"],1)

    async def test_ciphertext_is_bound_to_coordinate_key(self):
        codec = create_aes_gcm_private_codec(os.urandom(32))
        key1 = sha256_json_fingerprint({"id":1})
        key2 = sha256_json_fingerprint({"id":2})
        sealed = codec.seal({"value":{"x":1},"confirmed_at_ms":1,"source_validator":None,"observed_at_ms":None,"independently_obtained":True}, key1)
        with self.assertRaises(Exception):
            codec.open(sealed, key2)

    async def test_private_l1_never_emits_hosted_operations(self):
        store = MemoryStore(); codec = create_aes_gcm_private_codec(os.urandom(32))
        edge = SeenRelayZeroState(private_store=store, private_codec=codec, private_max_age_ms=1000)
        await edge.guard(coordinate={"id":1}, validate=lambda _headers=None: {"v":1})
        await edge.guard(coordinate={"id":1}, validate=lambda _headers=None: {"v":2})
        telemetry = edge.get_telemetry()
        self.assertEqual(telemetry["edge"]["relay_check_calls"],0)
        self.assertEqual(telemetry["edge"]["relay_observe_calls"],0)
        self.assertEqual(telemetry["interpretation"]["hosted_operations_added"],0)

    def test_store_and_codec_must_be_paired(self):
        with self.assertRaises(TypeError): SeenRelayZeroState(private_store=MemoryStore())
        with self.assertRaises(TypeError): SeenRelayZeroState(private_codec=object())

    def test_aes_key_must_be_32_bytes(self):
        with self.assertRaises(TypeError): create_aes_gcm_private_codec(b"short")

    def test_coordinate_rejects_python_integer_not_exactly_representable_in_javascript(self):
        with self.assertRaisesRegex(TypeError, "not exactly representable"):
            sha256_json_fingerprint({"id": 9007199254740993})


if __name__ == "__main__":
    unittest.main()
