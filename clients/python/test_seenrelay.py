import unittest

from seenrelay import SeenRelayClient, TransportResponse, reuse_known_on_same_observed

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


class SeenRelayWrapperTests(unittest.TestCase):
    def test_shadow_mode_validates_observes_and_preserves_lease(self):
        transport = FakeTransport([response({"status": "UNKNOWN"}), response({"accepted": True})])
        client = SeenRelayClient(transport=transport)
        result = client.guard_detailed(fact=FACT, known_value="old", validate=lambda _: "fresh")
        self.assertEqual(result.value, "fresh")
        self.assertEqual(result.path, "validated")
        self.assertTrue(result.check_ok)
        self.assertTrue(result.observe_ok)
        self.assertEqual(transport.calls[1][2]["x-seenrelay-lease"], "lease-1")

    def test_explicit_same_observed_policy_can_reuse(self):
        transport = FakeTransport([response({"status": "SAME_OBSERVED"})])
        client = SeenRelayClient(transport=transport)
        result = client.guard_detailed(
            fact=FACT,
            known_value=17,
            validate=lambda _: 18,
            reuse=reuse_known_on_same_observed,
        )
        self.assertEqual(result.value, 17)
        self.assertEqual(result.path, "reused")
        self.assertEqual(len(transport.calls), 1)

    def test_relay_failure_is_fail_open(self):
        transport = FakeTransport(error=RuntimeError("relay unavailable"))
        client = SeenRelayClient(transport=transport)
        result = client.guard_detailed(fact=FACT, known_value=1, validate=lambda _: 2)
        self.assertEqual(result.value, 2)
        self.assertFalse(result.check_ok)
        self.assertFalse(result.observe_ok)
        self.assertEqual(len(transport.calls), 2)

    def test_conditional_hint_is_bounded(self):
        transport = FakeTransport([
            response({"status": "SAME_OBSERVED", "conditional_request_hint": {"request_header": "If-Modified-Since", "header_value": "Tue, 25 Aug 2026 16:00:00 GMT"}}),
            response({"accepted": True}),
        ])
        seen = {}

        def validate(context):
            nonlocal seen
            seen = context.conditional_headers
            return 1

        SeenRelayClient(transport=transport).guard(fact=FACT, known_value=1, validate=validate)
        self.assertEqual(seen, {"If-Modified-Since": "Tue, 25 Aug 2026 16:00:00 GMT"})

    def test_economics_uses_caller_costs(self):
        transport = FakeTransport([response({"status": "SAME_OBSERVED"})])
        client = SeenRelayClient(transport=transport)
        client.guard(fact=FACT, known_value=5, validate=lambda _: 6, reuse=reuse_known_on_same_observed)
        estimate = client.estimate_reuse_economics(avoided_validation_cost=10, check_request_cost=1)
        self.assertEqual(estimate.gross_avoided_validation_cost, 10)
        self.assertEqual(estimate.relay_request_cost, 1)
        self.assertEqual(estimate.net_estimated_savings, 9)
        self.assertTrue(estimate.excludes_conditional_request_savings)


if __name__ == "__main__":
    unittest.main()
