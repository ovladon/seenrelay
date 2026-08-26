# SeenRelay Python client

Deterministic, standard-library-only client for placing SeenRelay CHECK directly in front of repeated source-backed validation.

## Install

Package metadata is prepared for registry publication. Until the package is published, use the repository copy from `clients/python/`.

## Shadow mode

```python
from seenrelay import SeenRelayClient

relay = SeenRelayClient()

value = relay.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)
```

Without an explicit reuse policy, validation is never skipped.

## Prove value before enabling reuse

```python
from seenrelay import SeenRelayClient
from seenrelay_shadow import SeenRelayShadowProof

proof = SeenRelayShadowProof(SeenRelayClient())

value = proof.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)

print(proof.report(
    avoided_validation_cost=0.01,  # use your own invoice/cost unit
))
```

Shadow Proof always keeps the original validation. It measures CHECK status distribution, validation time and SeenRelay request latency locally. Potential savings count only `SAME_OBSERVED` calls and subtract caller-supplied request costs. Savings from conditional ETag / Last-Modified requests are deliberately excluded unless measured separately by the application.

Use SeenRelay around repeated validation that is materially more expensive than the preflight. It is generally a poor fit for a cheap one-off GET.

## License

The client package is MIT licensed. The hosted SeenRelay service implementation remains governed by the repository root license.
