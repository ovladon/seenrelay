import time
import unittest
from types import SimpleNamespace

from seenrelay_shadow import SeenRelayShadowProof


class FakeClient:
    def __init__(self, statuses):
        self.statuses = list(statuses)
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
        self.assert_shadow(reuse)
        status = self.statuses.pop(0)
        self.telemetry.check_network_requests += 1
        self.telemetry.check_network_latency_ms_total += 2.0
        self.telemetry.check_network_latency_ms_average = (
            self.telemetry.check_network_latency_ms_total / self.telemetry.check_network_requests
        )
        check = {"status": status}
        if status == "SAME_OBSERVED":
            check["conditional_request_hint"] = {
                "request_header": "If-None-Match",
                "header_value": '"abc"',
            }
        context = SimpleNamespace(check=check, conditional_headers={})
        value = validate(context)
        self.telemetry.observe_network_requests += 1
        self.telemetry.observe_network_latency_ms_total += 3.0
        self.telemetry.observe_network_latency_ms_average = (
            self.telemetry.observe_network_latency_ms_total / self.telemetry.observe_network_requests
        )
        return SimpleNamespace(value=value, check=check)

    @staticmethod
    def assert_shadow(reuse):
        if reuse is not None:
            raise AssertionError("Shadow Proof must force reuse=None")


class ShadowProofTests(unittest.TestCase):
    def test_measures_potential_reuse_without_suppressing_validation(self):
        proof = SeenRelayShadowProof(FakeClient(["SAME_OBSERVED", "UNKNOWN"]))
        validations = 0

        def validate(_context):
            nonlocal validations
            validations += 1
            time.sleep(0.002)
            return "ok"

        for _ in range(2):
            self.assertEqual(
                proof.guard(
                    fact={"source_url": "https://example.invalid/status", "predicate": "status.value"},
                    known_value="ok",
                    validate=validate,
                ),
                "ok",
            )

        self.assertEqual(validations, 2)
        snapshot = proof.snapshot()
        self.assertEqual(snapshot["statuses"]["SAME_OBSERVED"], 1)
        self.assertEqual(snapshot["statuses"]["UNKNOWN"], 1)
        self.assertEqual(snapshot["conditional_hints_seen"], 1)
        self.assertGreater(snapshot["same_observed_validation_ms"], 0)

        report = proof.report(
            avoided_validation_cost=2.0,
            check_request_cost=0.1,
            observe_request_cost=0.1,
        )
        self.assertEqual(report["potential_validation_calls_avoided"], 1)
        self.assertAlmostEqual(report["gross_potential_savings"], 2.0)
        self.assertAlmostEqual(report["prospective_relay_request_cost"], 0.3)
        self.assertAlmostEqual(report["net_potential_savings"], 1.7)
        self.assertTrue(report["assumptions"]["conditional_request_savings_excluded"])

    def test_zero_same_observed_means_zero_claimed_savings(self):
        proof = SeenRelayShadowProof(FakeClient(["UNKNOWN"]))
        proof.guard(
            fact={"source_url": "https://example.invalid/version", "predicate": "version.latest"},
            known_value="1",
            validate=lambda _context: "1",
        )
        report = proof.report(avoided_validation_cost=100.0)
        self.assertEqual(report["potential_validation_calls_avoided"], 0)
        self.assertEqual(report["gross_potential_savings"], 0)
        self.assertTrue(report["assumptions"]["no_savings_claim_when_same_observed_is_zero"])


if __name__ == "__main__":
    unittest.main()
