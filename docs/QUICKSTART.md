# SeenRelay Quickstart

<!-- BEGIN GENERATED:PUBLIC-INSTALL -->
Install the public client first:

```bash
# JavaScript / TypeScript
npm install seenrelay

# Python
pip install seenrelay
```

Client v0.1.0 was clean-install verified from both public registries on 2026-08-26. Start in shadow mode; reuse stays caller policy.
<!-- END GENERATED:PUBLIC-INSTALL -->

SeenRelay adds a low-cost freshness check in front of work an AI agent would otherwise repeat. It has exactly two domain operations: **CHECK** and **OBSERVE**.

SeenRelay reports observations, not universal truth. `UNKNOWN`, `STALE`, and `CONTESTED` are normal outcomes; the caller then continues with its existing validation policy.

## Choose the right validation first

SeenRelay is intended for repeated validation whose full path has meaningful cost or latency: paid web search, metered scraping/proxies, browser or extraction work, rate-limited APIs, model-assisted parsing, or multi-step validation.

It is usually a poor fit for a cheap one-off GET with little chance of repetition.

For current fleet-level examples and break-even arithmetic, see `https://seenrelay.com/economics` and [`ECONOMICS_LAB.md`](ECONOMICS_LAB.md).

## Connect without an account

Access is currently free and requires no account, API key, email, or OAuth.

### Deterministic reference clients — recommended for application code

For applications that must run the SeenRelay preflight every time an existing validation path executes, install the public zero-third-party-runtime-dependency client:

```bash
# JavaScript / TypeScript
npm install seenrelay

# Python
pip install seenrelay
```

Design, safety and complete examples: [`../clients/README.md`](../clients/README.md). The exact package version currently published on both registries is `0.1.0`.

The clients default to shadow mode and fail open on relay-side timeout, 429, malformed responses, or outages. They never hide an error from the application's own validation. They do not add a SeenRelay operation or persistent local fact cache.

### MCP

Remote endpoint: `https://seenrelay.com/mcp`

Official Registry identifier: `io.github.ovladon/seenrelay`

Use MCP when model/tool routing is appropriate. When an MCP client supports remote Streamable HTTP servers, point it at the endpoint above. When it supports MCP Registry discovery, use the Registry identifier.

### REST / OpenAPI

- OpenAPI: `https://seenrelay.com/openapi.json`
- CHECK: `POST https://seenrelay.com/v1/check`
- OBSERVE: `POST https://seenrelay.com/v1/observe`

## Smallest deterministic integration

Bind SeenRelay around one fixed source-backed validator once. Every later revalidation then supplies only the value your application already knows.

### JavaScript / TypeScript

```js
import { SeenRelayClient } from 'seenrelay';

const relay = new SeenRelayClient();

const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) =>
    yourExistingValidation(conditionalHeaders)
});

const value = await validatePrice(knownValue);
```

### Python

```python
from seenrelay import SeenRelayClient
from seenrelay_easy import protect_validation

relay = SeenRelayClient()

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx: your_existing_validation(ctx.conditional_headers),
)

value = validate_price(known_value)
```

With no reuse policy, both examples are strict shadow mode: CHECK runs, your original validation still runs, and the independently obtained result is OBSERVEd best-effort. Nothing is skipped merely because SeenRelay was installed.

Only after Shadow Proof shows positive economics and your policy accepts bounded reuse should you add `reuseKnownOnSameObserved` / `reuse_known_on_same_observed`.

## Useful from the first integration

A large public network is not required for SeenRelay to be useful.

- If no one has observed the fact yet, CHECK returns `UNKNOWN` and your existing validation path continues.
- When your agent performs that validation, OBSERVE can make the result available to later callers.
- Repeated work inside the same integration or fleet can therefore become reusable before any external network effect exists.
- If a prior OBSERVE included an ETag or Last-Modified validator, CHECK can return it as an explicitly unverified conditional-request hint for cheaper source confirmation.
- Observations from other callers increase coverage over time.

The safe initial pattern is still shadow mode: measure the signal first, then decide where your own policy permits reuse.

## Integration pattern

Do not replace your existing source-validation policy. Insert SeenRelay immediately before work that may be redundant:

```text
goal
  ↓
CHECK
  ├─ useful recent observation + policy permits reuse → avoid or prioritize downstream work
  └─ UNKNOWN / STALE / CONTESTED / policy requires validation
         ↓
      perform the validation you already intended to perform
         ↓
      OBSERVE the independently obtained result
```

A safe first deployment is **shadow mode**: call CHECK and record what it would have changed, but do not skip any existing validation. Promote only after measured results justify it.

## Direct wrapper pattern

If you need the full per-call options instead of the bind-once convenience helper:

### JavaScript / TypeScript

```js
const value = await relay.guard({
  fact,
  knownValue,
  validate: async ({ conditionalHeaders }) =>
    yourExistingValidation(conditionalHeaders)
});
```

### Python

```python
value = relay.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda context: your_existing_validation(context.conditional_headers),
)
```

If the relay itself cannot be used, the validation still runs. If validation succeeds but the later OBSERVE cannot be deposited, the validated application result is still returned.

## Minimal CHECK

```bash
curl -sS https://seenrelay.com/v1/check \
  -H 'content-type: application/json' \
  -d '{
    "fact": {
      "subject": "Model X input price",
      "predicate": "price.current",
      "source": "https://provider.example/pricing",
      "locator": {"scheme": "element_id", "value": "model-x-input-price"}
    },
    "known_value": 17,
    "max_age_seconds": 3600
  }'
```

Possible statuses: `SAME_OBSERVED`, `CHANGED_OBSERVED`, `CONTESTED`, `STALE`, `UNKNOWN`.

A fresh CHECK may also include `source_validator`, `source_validator_assurance: observer_supplied_unverified`, and, for ETag or Last-Modified metadata, a `conditional_request_hint`. Treat that hint only as an optimization. If your policy still requires source confirmation, try the conditional request before a more expensive validation path; any `304 Not Modified` result comes from the source itself.

### Cheapest useful validation path

```text
CHECK
  ├─ policy permits reuse → avoid redundant validation
  └─ validation still required
       ├─ conditional_request_hint available → conditional source request
       │    ├─ source confirms not modified → avoid expensive downstream work
       │    └─ source changed / cannot confirm → full validation
       └─ no validator hint → full validation

After an independently completed validation → OBSERVE
```

## Minimal OBSERVE

Call OBSERVE only after your agent independently obtained the value for its own task. When that validation also produced an ETag or Last-Modified value, include it as `source_validator` so a later CHECK can offer a cheaper conditional-request path. The validator remains observer-supplied and unverified by SeenRelay.

```bash
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
curl -sS https://seenrelay.com/v1/observe \
  -H 'content-type: application/json' \
  -d "{
    \"fact\": {
      \"subject\": \"Model X input price\",
      \"predicate\": \"price.current\",
      \"source\": \"https://provider.example/pricing\",
      \"locator\": {\"scheme\": \"element_id\", \"value\": \"model-x-input-price\"}
    },
    \"value\": 17,
    \"observed_at\": \"$NOW\",
    \"idempotency_key\": \"example-run/model-x-input-price\",
    \"source_validator\": {\"kind\": \"last_modified\", \"value\": \"Tue, 25 Aug 2026 16:00:00 GMT\"}
  }"
```

HTTP responses return an `x-seenrelay-lease` header. Reuse that lease when practical to preserve operational allowance and contribution continuity. It is not a real-world identity credential.

## Fact identity

Use a stable source-native locator whenever available: `json_pointer`, `element_id`, or `source_key`. If none exists, use a canonical machine predicate such as `price.current`, `availability.current`, `status.current`, `version.current`, or `capacity.current`.

Do not put mutable observed content into identity. `subject` is descriptive only. Qualifiers should contain only fields necessary to distinguish otherwise identical facts.

See [`PROTOCOL.md`](PROTOCOL.md) for the complete `seenrelay-fact-v3` contract.

## Safe rollout

1. **Baseline:** measure the validations your workflow already performs.
2. **Shadow mode:** call CHECK but continue every existing validation.
3. **Compare:** record status distribution, latency and downstream operations that could have been skipped.
4. **Economics gate:** keep SeenRelay only where measured reuse beats the workload's monetary or latency break-even threshold.
5. **Bounded reuse:** permit reuse only for fact classes and freshness windows accepted by your policy.
6. **Monitor:** track `UNKNOWN`/`STALE`/`CONTESTED`, policy exceptions, latency and operational overhead.

```text
measured operational value = downstream work actually avoided - integration/operation overhead
```

The deterministic clients expose local in-process counters and Shadow Proof to support this measurement. Package downloads, MCP initialize requests, tools/list requests and the first-party Reference Observer are not evidence of external adoption.

## Security and provenance

OBSERVE supports optional `ed25519-v1` proof-of-possession. It proves key possession, continuity and payload integrity — not legal identity, independent actor identity, or truth.

Technical data practices: `https://seenrelay.com/data-practices`

## Machine-readable discovery

- Service descriptor: `https://seenrelay.com/service.json`
- Economics: `https://seenrelay.com/economics`
- OpenAPI: `https://seenrelay.com/openapi.json`
- MCP: `https://seenrelay.com/mcp`
- Public metrics: `https://seenrelay.com/public-stats.json`
- Health: `https://seenrelay.com/healthz`

SeenRelay intentionally has no third domain operation, no external fact verification, no browser/search function, no LLM truth oracle and no shared general-agent memory.
