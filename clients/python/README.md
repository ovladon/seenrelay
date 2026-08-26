# SeenRelay Python client

Deterministic, standard-library-only client for placing SeenRelay CHECK directly in front of repeated source-backed validation.

## Install

Package metadata is prepared and continuously validated for registry publication. Until the package is published, use the repository copy from `clients/python/`.

## Smallest integration: bind once, one line per revalidation

```python
from seenrelay import SeenRelayClient
from seenrelay_easy import protect_validation

relay = SeenRelayClient()

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)

value = validate_price(known_value)
```

That is strict shadow mode by default: SeenRelay CHECK runs, your original validation still runs, and the independently obtained result is OBSERVEd best-effort. Nothing is skipped merely because SeenRelay is installed.

Only after measurement and policy approval should you add an explicit reuse policy:

```python
from seenrelay import reuse_known_on_same_observed

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
    reuse=reuse_known_on_same_observed,
)
```

## Direct client form

The same behavior is available without the convenience binder:

```python
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

Use SeenRelay around repeated validation that is materially more expensive than the preflight: paid search, scraping/proxy work, browser or extraction calls, rate-limited APIs, model-assisted parsing, or multi-step validation. It is generally a poor fit for a cheap one-off GET.

For fleet economics and current public-price illustrations, see `https://seenrelay.com/economics` and `docs/ECONOMICS_LAB.md` in the repository.

## License

The client package is MIT licensed. The hosted SeenRelay service implementation remains governed by the repository root license.
