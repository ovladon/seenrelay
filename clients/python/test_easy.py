import unittest

from seenrelay import SeenRelayClient, TransportResponse, reuse_known_on_same_observed
from seenrelay_easy import protect_validation

FACT = {"subject": "Example price", "predicate": "price.current", "source": "https://example.com/price"}


def response(body, status=200, lease="lease-1"):
    return TransportResponse(status=status, headers={"x-seenrelay-lease": lease}, body=body)


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        self.calls.append((method, url, dict(headers), body, timeout))
        return self.responses.pop(0)


class SeenRelayEasyTests(unittest.TestCase):
    def test_bound_validation_stays_shadow_by_default(self):
        transport = FakeTransport([
            response({"status": "SAME_OBSERVED"}),
            response({"accepted": True}),
        ])
        validations = []
        relay = SeenRelayClient(transport=transport)
        validate_price = protect_validation(
            relay,
            fact=FACT,
            validate=lambda context: validations.append(dict(context.conditional_headers)) or 18,
        )

        self.assertEqual(validate_price(17), 18)
        self.assertEqual(len(validations), 1)
        self.assertEqual(len(transport.calls), 2)

    def test_bound_validation_can_reuse_only_with_explicit_policy(self):
        transport = FakeTransport([response({"status": "SAME_OBSERVED"})])
        relay = SeenRelayClient(transport=transport)
        validate_price = protect_validation(
            relay,
            fact=FACT,
            validate=lambda _: 18,
            reuse=reuse_known_on_same_observed,
        )

        self.assertEqual(validate_price(17), 17)
        self.assertEqual(len(transport.calls), 1)


if __name__ == "__main__":
    unittest.main()
