# SeenRelay Quickstart

SeenRelay adds a low-cost freshness check in front of work an AI agent would otherwise repeat. It has exactly two domain operations: **CHECK** and **OBSERVE**.

SeenRelay reports observations, not universal truth. `UNKNOWN`, `STALE`, and `CONTESTED` are normal outcomes; the caller then continues with its existing validation policy.

## Connect without an account

Access is currently free and requires no account, API key, email, or OAuth.

### MCP

Remote endpoint: `https://seenrelay.com/mcp`

Official Registry identifier: `io.github.ovladon/seenrelay`

When an MCP client supports remote Streamable HTTP servers, point it at the endpoint above. When it supports MCP Registry discovery, use the Registry identifier.

### REST / OpenAPI

- OpenAPI: `https://seenrelay.com/openapi.json`
- CHECK: `POST https://seenrelay.com/v1/check`
- OBSERVE: `POST https://seenrelay.com/v1/observe`

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

## Minimal TypeScript pattern

Node 22+ has `fetch` built in:

```ts
const fact = {
  subject: 'Model X input price',
  predicate: 'price.current',
  source: 'https://provider.example/pricing',
  locator: { scheme: 'element_id', value: 'model-x-input-price' }
};

const check = await fetch('https://seenrelay.com/v1/check', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ fact, known_value: 17, max_age_seconds: 3600 })
}).then(r => r.json());

if (['UNKNOWN', 'STALE', 'CONTESTED'].includes(check.status)) {
  const independentlyObservedValue = await yourExistingValidation();
  await fetch('https://seenrelay.com/v1/observe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fact,
      value: independentlyObservedValue,
      observed_at: new Date().toISOString(),
      idempotency_key: crypto.randomUUID()
    })
  });
}
```

Treat `SAME_OBSERVED` or `CHANGED_OBSERVED` according to your own risk policy. SeenRelay deliberately does not make that decision for you.

## Fact identity

Use a stable source-native locator whenever available: `json_pointer`, `element_id`, or `source_key`. If none exists, use a canonical machine predicate such as `price.current`, `availability.current`, `status.current`, `version.current`, or `capacity.current`.

Do not put mutable observed content into identity. `subject` is descriptive only. Qualifiers should contain only fields necessary to distinguish otherwise identical facts.

See [`PROTOCOL.md`](PROTOCOL.md) for the complete `seenrelay-fact-v3` contract.

## Safe rollout

1. **Baseline:** measure the validations your workflow already performs.
2. **Shadow mode:** call CHECK but continue every existing validation.
3. **Compare:** record status distribution, latency, and the downstream calls that could have been skipped or deprioritized.
4. **Bounded reuse:** permit reuse only for fact classes and freshness windows accepted by your own policy.
5. **Monitor:** track false convergence, policy exceptions, `UNKNOWN`/`STALE`/`CONTESTED`, latency, and operational overhead.

```text
measured operational value = downstream work actually avoided - integration/operation overhead
```

## Security and provenance

OBSERVE supports optional `ed25519-v1` proof-of-possession. It proves key possession, continuity, and payload integrity — not legal identity, independent actor identity, or truth.

Technical data practices: `https://seenrelay.com/data-practices`

## Machine-readable discovery

- Service descriptor: `https://seenrelay.com/service.json`
- OpenAPI: `https://seenrelay.com/openapi.json`
- MCP: `https://seenrelay.com/mcp`
- Public metrics: `https://seenrelay.com/public-stats.json`
- Health: `https://seenrelay.com/healthz`

SeenRelay intentionally has no third domain operation, no external fact verification, no browser/search function, no LLM truth oracle, and no shared general-agent memory.
