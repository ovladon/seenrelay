# SeenRelay fleet integration

This is the shortest practical deployment model for a fleet that repeatedly revalidates the same source-backed facts.

## 1. Pick one expensive repeated validation

Choose one existing function that repeatedly spends money or time on a fact the application already knows, for example paid web search, scraping, browser extraction, a rate-limited API, or a multi-step validation chain.

Do not start with a cheap one-off GET.

## 2. Define one deterministic fact identity

Prefer a stable source-native locator (`json_pointer`, `element_id`, or `source_key`). If none exists, use a canonical predicate such as `price.current`, `status.current`, `availability.current`, `version.current`, or `capacity.current`.

## 3. Bind SeenRelay around the validator once

JavaScript / TypeScript:

```js
const relay = new SeenRelayClient();

const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) =>
    existingValidation(conditionalHeaders)
});
```

Python:

```python
from seenrelay import SeenRelayClient
from seenrelay_easy import protect_validation

relay = SeenRelayClient()

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx: existing_validation(ctx.conditional_headers),
)
```

## 4. Replace the old repeated call with one protected call

JavaScript / TypeScript:

```js
const value = await validatePrice(knownValue);
```

Python:

```python
value = validate_price(known_value)
```

In default shadow mode nothing is skipped. CHECK runs first, the existing validation still runs, and OBSERVE deposits the independently obtained result best-effort.

## 5. Share the same integration across the fleet

Every worker or agent that validates that same deterministic fact uses the same SeenRelay service. No peer-to-peer connection is required. The first caller may receive `UNKNOWN`, validate normally and OBSERVE. A later caller can then see the observation through CHECK.

## 6. Measure before enabling reuse

Use Shadow Proof on the real workload. Record the measured `SAME_OBSERVED` rate, validation cost/latency and SeenRelay overhead. Keep SeenRelay only where the workload's measured economics are positive.

## 7. Enable bounded reuse only when policy permits it

Only after measurement and risk review add `reuseKnownOnSameObserved` / `reuse_known_on_same_observed` for fact classes and freshness windows the application accepts.

SeenRelay remains evidence infrastructure, not a truth oracle. `UNKNOWN`, `STALE`, `CONTESTED` and policy rejection continue into the validation path the application already had.
