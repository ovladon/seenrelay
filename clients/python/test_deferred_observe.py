import time
import unittest
from types import SimpleNamespace

from seenrelay import SeenRelayClient, TransportResponse
from seenrelay_shadow import SeenRelayShadowProof

FACT = {"subject": "Example status", "predicate": "status.current", "source": "https://example.com/status"}


def response(body, status=200, lease="lease-1"):
    return TransportResponse(status=status, headers={"x-seenrelay-lease": lease}, body=body)


class FakeTransport:
    def __init__(self, responses=None, error=None):
        self.responses = list(responses or [])
        self.error = error
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        self.calls.append((method, url, dict(headers), body, timeout))
        if self.error:
            raise self.error
        return self.responses.pop(0)


class DeferredObserveTests(unittest.TestCase):
    def test_caller_scheduler_defers_observe_without_hidden_thread(self):
        transport = FakeTransport([response({"status": "UNKNOWN"}), response({"accepted": True})])
        scheduled = []
        client = SeenRelayClient(transport=transport, schedule_observe=lambda task: scheduled.append(task))
        result = client.guard_detailed(fact=FACT, known_value="old", validate=lambda _: "fresh")
        self.assertEqual(result.value, "fresh")
        self.assertTrue(result.observe_deferred)
        self.assertIsNone(result.observe_ok)
        self.assertEqual(len(scheduled), 1)
        self.assertEqual(len(transport.calls), 1, "wrapper must not create hidden background work")
        self.assertEqual(client.get_telemetry().observe_scheduled, 1)
        scheduled[0]()
        self.assertEqual(len(transport.calls), 2)
        self.assertEqual(client.get_telemetry().observe_successes, 1)

    def test_deferred_observe_error_uses_caller_callback(self):
        scheduled = []
        errors = []
        transport = FakeTransport([response({"status": "UNKNOWN"})])
        client = SeenRelayClient(
            transport=transport,
            schedule_observe=lambda task: scheduled.append(task),
            on_deferred_observe_error=lambda exc: errors.append(str(exc)),
        )
        result = client.guard_detailed(fact=FACT, known_value=1, validate=lambda _: 2)
        self.assertTrue(result.observe_deferred)
        transport.error = RuntimeError("observe unavailable")
        scheduled[0]()
        self.assertEqual(client.get_telemetry().observe_failures, 1)
        self.assertEqual(errors, ["observe unavailable"])

    def test_scheduler_failure_fails_open_without_observe_request(self):
        transport = FakeTransport([response({"status": "UNKNOWN"})])
        def broken_scheduler(_task):
            raise RuntimeError("scheduler unavailable")
        client = SeenRelayClient(transport=transport, schedule_observe=broken_scheduler)
        result = client.guard_detailed(fact=FACT, known_value=1, validate=lambda _: 2)
        self.assertEqual(result.value, 2)
        self.assertTrue(result.observe_deferred)
        self.assertFalse(result.observe_ok)
        self.assertIn("scheduler unavailable", result.observe_error or "")
        telemetry = client.get_telemetry()
        self.assertEqual(telemetry.observe_schedule_failures, 1)
        self.assertEqual(telemetry.observe_network_requests, 0)


class EconomicsFakeClient:
    def __init__(self):
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
        return self.telemetry

    def guard_detailed(self, *, fact, known_value, validate, reuse=None, max_age_seconds=None, observation=None):
        if reuse is not None:
            raise AssertionError("Shadow Proof must force reuse=None")
        self.telemetry.check_network_requests += 1
        self.telemetry.check_network_latency_ms_total += 2.0
        self.telemetry.check_network_latency_ms_average = 2.0
        check = {"status": "SAME_OBSERVED"}
        value = validate(SimpleNamespace(check=check, conditional_headers={}))
        self.telemetry.observe_network_requests += 1
        self.telemetry.observe_network_latency_ms_total += 3.0
        self.telemetry.observe_network_latency_ms_average = 3.0
        return SimpleNamespace(value=value, check=check)


class DeferredEconomicsTests(unittest.TestCase):
    def test_off_critical_path_observe_changes_time_model_only_when_explicit(self):
        proof = SeenRelayShadowProof(EconomicsFakeClient())
        proof.guard(
            fact={"source_url": "https://example.invalid/status", "predicate": "status.value"},
            known_value="ok",
            validate=lambda _context: (time.sleep(0.004) or "ok"),
        )
        blocking = proof.report(avoided_validation_cost=1.0)
        deferred = proof.report(avoided_validation_cost=1.0, observe_off_critical_path=True)
        self.assertTrue(deferred["assumptions"]["observe_off_critical_path"])
        self.assertLessEqual(deferred["prospective_relay_latency_ms"], blocking["prospective_relay_latency_ms"])
        self.assertLessEqual(deferred["break_even_reuse_rate_by_time"], blocking["break_even_reuse_rate_by_time"])


if __name__ == "__main__":
    unittest.main()
