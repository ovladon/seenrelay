# SeenRelay Quickstart

<!-- BEGIN GENERATED:PUBLIC-INSTALL -->
Install the public client first:

```bash
# JavaScript / TypeScript
npm install seenrelay

# Python
pip install seenrelay
```

Client v0.2.3 was clean-install verified from both public registries on 2026-08-29. JavaScript/TypeScript 0.2.3 supports provider-independent local-first Zero-State; Python remains shadow-first in this release. Reuse remains caller policy.
<!-- END GENERATED:PUBLIC-INSTALL -->

SeenRelay reduces redundant source-backed validation while preserving the application's existing validation policy. It still has exactly two domain operations: **CHECK** and **OBSERVE**.

The recommended JavaScript/TypeScript 0.2.3 path is local-first: use caller-side reuse and source-native confirmation before considering shared evidence. Python 0.2.3 and the classic JavaScript/TypeScript API remain shadow-first.

## Choose the right target

Use SeenRelay for repeated **read-only** validation whose full path has meaningful cost or latency: paid web search, metered scraping/proxies, browser or extraction work, rate-limited APIs, model-assisted parsing, or multi-step validation.

Do not suppress mutating/destructive operations. A cheap one-off GET with little chance of repetition is usually a poor fit.

Access is currently free and requires no account, API key, email, or OAuth.

## JavaScript / TypeScript: Zero-State

```js
import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  localMaxAgeMs: 30_000
});

const result = await edge.guard({
  coordinate: {
    tool: 'catalog.read',
    arguments: { id: 42 }
  },
  validate: async () => expensiveRead()
});

console.log(result.value);
```

The order is intentionally conservative:

```text
eligible read-only validation
  ↓
in-flight / explicit-TTL local reuse
  ↓
optional encrypted caller-owned private L1
  ↓
source-native ETag / Last-Modified confirmation when available
  ↓
optional shared SeenRelay CHECK when configured and useful
  ↓
original validation
  ↓
OBSERVE only after a genuinely fresh independent validation
```

The default completed-result freshness window is `0`. SeenRelay does not invent a TTL for arbitrary calls.

### MCP bind-once interception

```js
import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(rawMcpClient, {
  serverKey: 'catalog-server',
  tools: {
    'catalog.read': { maxAgeMs: 30_000 }
  }
});
```

Only exact tool names explicitly listed in `tools` are eligible. Unlisted tools pass through unchanged. The generic core does not infer read-only safety from a tool name, description or untrusted annotation.

### Source-native confirmation

```js
import {
  SeenRelayZeroState,
  createConditionalFetchValidator
} from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState();
const validate = createConditionalFetchValidator({
  url: 'https://api.example.com/item/42'
});

const result = await edge.guard({
  coordinate: { resource: 'https://api.example.com/item/42' },
  validate
});
```

If an earlier response supplied a safe ETag or Last-Modified validator, a later request can use `If-None-Match` or `If-Modified-Since`. A `304 Not Modified` response is confirmation from the source itself, not a SeenRelay truth verdict.

### Optional private L1

```js
import {
  SeenRelayZeroState,
  createAesGcmPrivateCodec
} from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  privateStore,
  privateCodec: createAesGcmPrivateCodec(keyBytes),
  privateMaxAgeMs: 30_000
});
```

The caller owns the encryption key, storage, namespace and retention policy. Private values are not sent to the public relay merely because private L1 is enabled.

## Classic shadow-first integration

The original API remains available in JavaScript / TypeScript and Python. It is useful when you specifically want to measure or use shared CHECK evidence around an existing fact validation.

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

With no explicit reuse policy, the classic clients remain strict shadow mode: CHECK runs, the original validation still runs, and the independently obtained result is OBSERVEd best-effort. Python behavior remains shadow-first in 0.2.3.

JavaScript / TypeScript 0.2.3 Shadow Proof can additionally retain bounded, sanitized natural-workload benchmark records while authoritative validation still runs. The export excludes fact identity, source, raw values and per-call timestamps; unavailable CHECKs remain in the sample, mismatches fail safety evidence and uncomparable hypothetical reuse remains incomplete. It does not enable reuse.

## MCP and REST

Remote MCP endpoint: `https://seenrelay.com/mcp`

Official Registry identifier: `io.github.ovladon/seenrelay`

REST / OpenAPI:

- OpenAPI: `https://seenrelay.com/openapi.json`
- CHECK: `POST https://seenrelay.com/v1/check`
- OBSERVE: `POST https://seenrelay.com/v1/observe`

Use MCP when model/tool routing is appropriate. Use the deterministic JS/TS path when the application should make optimization decisions outside model choice.

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

A CHECK can also carry an observer-supplied, unverified ETag / Last-Modified conditional-request hint. Treat it only as an optimization input; source confirmation still comes from the source.

## Minimal OBSERVE

Call OBSERVE only after the caller independently obtained the value for its own task. Do not re-label a provider/intermediary cache hit as a new independent observation.

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

## Fact identity

Use a stable source-native locator whenever available: `json_pointer`, `element_id`, or `source_key`. If none exists, use a canonical machine predicate such as `price.current`, `availability.current`, `status.current`, `version.current`, or `capacity.current`.

Do not put mutable observed content into identity. `subject` is descriptive only. Qualifiers should contain only fields necessary to distinguish otherwise identical facts.

See [`PROTOCOL.md`](PROTOCOL.md) for the complete `seenrelay-fact-v3` contract.

## Safe rollout

For JavaScript / TypeScript Zero-State:

1. allow only explicitly eligible read-only operations;
2. start with TTL `0` unless the caller/source already has a defensible freshness window;
3. measure local/private/source-native savings first;
4. enable shared CHECK only where it can plausibly add value;
5. contribute OBSERVE only after genuinely fresh independent validation;
6. monitor false-reuse tests, validation fallback and operational overhead.

For the classic shared-evidence path, shadow mode remains the safe first deployment: keep every original validation, measure CHECK results, then enable bounded reuse only if the consuming application's economics and risk policy justify it.

The clients expose local counters and Shadow Proof to support measurement. Package downloads, MCP initialize requests, tools/list requests and first-party Reference Observer activity are not evidence of external adoption.

## Security and provenance

OBSERVE supports optional `ed25519-v1` proof-of-possession. It proves key possession, continuity and payload integrity — not legal identity, independent actor identity, or truth.

Technical data practices: `https://seenrelay.com/data-practices`

SeenRelay intentionally has no third domain operation, no external fact-verification service, no browser/search function, no LLM truth oracle and no shared general-agent memory.
