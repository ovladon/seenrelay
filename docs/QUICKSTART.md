# SeenRelay Quickstart

SeenRelay adds a low-cost freshness check in front of work an AI agent would otherwise repeat. It has exactly two domain operations: **CHECK** and **OBSERVE**.

SeenRelay reports observations, not universal truth. `UNKNOWN`, `STALE`, and `CONTESTED` are normal outcomes; the caller then continues with its existing validation policy.

## Connect without an account

Bootstrap access requires no account, API key, email, or OAuth.

### MCP

Remote endpoint: `https://seenrelay.com/mcp`

Official Registry identifier: `io.github.ovladon/seenrelay`

When an MCP client supports remote Streamable HTTP servers, point it at the endpoint above. When it supports MCP Registry discovery, use the Registry identifier.

### REST / OpenAPI

- OpenAPI: `https://seenrelay.com/openapi.json`
- CHECK: `POST https://seenrelay.com/v1/check`
- OBSERVE: `POST https://seenrelay.com/v1/observe`

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

## Minimal OBSERVE

Call OBSERVE only after your agent independently obtained the value for its own task:

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
    \"idempotency_key\": \"example-run/model-x-input-price\"
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

## Decision-maker rollout

1. **Baseline:** measure browser/search/API/model/human revalidation work, latency, and cost.
2. **Shadow mode:** call CHECK but continue every existing validation; compare outcomes.
3. **Bounded reuse:** allow reuse only for fact classes and freshness windows your policy accepts.
4. **Measure utility:** qualified reuse rate, avoided downstream operations, latency saved, cost saved, false-reuse/policy incidents, and UNKNOWN/STALE/CONTESTED rates.

```text
measured value = avoided downstream work - SeenRelay integration/operation cost
```

### Kill criteria

Do not expand rollout if the pilot cannot demonstrate net avoided work, if identity discipline creates unacceptable false convergence, if operational complexity exceeds savings, or if the application's risk policy cannot safely consume observational freshness signals.

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
