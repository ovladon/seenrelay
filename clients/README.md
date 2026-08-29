# SeenRelay deterministic client wrappers

<!-- BEGIN GENERATED:PUBLIC-FACTS -->
**Install:** `npm install seenrelay` · `pip install seenrelay` · client v0.2.3 · currently free · no account/API key.

**Measured first-party smoke result:** Firecrawl JSON extraction, n=3: 3/3 eligible provider calls avoided, 15 credits avoided, median 1265.68 ms fresh / 1039.5 ms provider-cached → 617.78 ms SeenRelay bounded reuse. This is a small first-party benchmark, not a promised reuse rate.
<!-- END GENERATED:PUBLIC-FACTS -->

The client packages put SeenRelay around source-backed validation that an application already performs. They do **not** change the hosted protocol: SeenRelay still has exactly two domain operations, CHECK and OBSERVE.

Version 0.2.3 has two deliberately different execution modes:

- **JavaScript / TypeScript Zero-State:** provider-independent, local-first optimization that can save work before any shared network evidence exists.
- **Classic JavaScript / TypeScript and Python:** conservative shadow-first CHECK/validate/OBSERVE path for measuring or explicitly using shared evidence.

## Available clients

- JavaScript / TypeScript package: [`typescript/README.md`](typescript/README.md)
- Python package: [`python/README.md`](python/README.md)
- JavaScript / TypeScript Zero-State: `seenrelay/zero-state`
- Generic JavaScript / TypeScript dispatcher: `seenrelay/auto`
- MCP bind-once interception: `seenrelay/mcp-auto`
- Classic Shadow Proof: `seenrelay/shadow-proof`

The clients have zero third-party runtime dependencies and are publicly available as `seenrelay` version `0.2.3` on npm and PyPI.

## Install

```bash
# JavaScript / TypeScript
npm install seenrelay

# Python
pip install seenrelay
```

No SeenRelay account or API key is required. Access is currently free.

## JavaScript / TypeScript: local-first Zero-State

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

Zero-State tries safe caller-side options before an optional shared relay lookup:

1. in-flight exact-call coalescing;
2. explicit-TTL local reuse;
3. optional encrypted caller-owned private L1 reuse;
4. source-native ETag / Last-Modified confirmation where available;
5. optional shared CHECK only when configured and useful;
6. the original validation as fallback;
7. OBSERVE only after a genuinely fresh independent validation that is eligible for contribution.

The default completed-result TTL is `0`. SeenRelay does not invent freshness for arbitrary calls.

Private L1 data stays caller-owned. A provider or intermediary cache hit is not re-labeled as a fresh independent OBSERVE.

### Bind once around MCP tool calls

```js
import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(rawMcpClient, {
  serverKey: 'catalog-server',
  tools: {
    'catalog.read': { maxAgeMs: 30_000 }
  }
});
```

Only explicitly allowlisted tools are eligible. Unlisted tools pass through unchanged. The generic core does not infer read-only safety from tool names, descriptions, or untrusted annotations.

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

The application owns the storage, encryption key, namespace and retention policy. Store/codec failure fails open into the application's normal validation path.

## Classic shadow-first client

The original API remains available in JavaScript / TypeScript and Python. Its default behavior remains conservative:

1. CHECK;
2. if the caller supplied an explicit reuse policy and permits reuse, return the accepted value;
3. otherwise pass a safe ETag / Last-Modified conditional hint to the application's existing validation when available;
4. run the validation the application already intended to run;
5. OBSERVE the independently obtained result best-effort;
6. fail open if SeenRelay itself times out, returns 429, returns malformed data, or is unavailable.

Application validation errors are never hidden by SeenRelay fail-open behavior.

### JavaScript / TypeScript classic form

```js
import { SeenRelayClient, reuseKnownOnSameObserved } from 'seenrelay';

const relay = new SeenRelayClient();

const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders),
  // Optional explicit opt-in. Omit this for shadow mode.
  reuse: reuseKnownOnSameObserved
});
```

### Python classic form

```python
from seenrelay import SeenRelayClient, reuse_known_on_same_observed

relay = SeenRelayClient()

value = relay.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
    # Optional explicit opt-in. Omit this for shadow mode.
    reuse=reuse_known_on_same_observed,
)
```

Python behavior remains shadow-first in 0.2.3. JavaScript / TypeScript Zero-State and natural-workload collector parity are not claimed for Python in this release.

## Shadow Proof

Use Shadow Proof when you specifically want to measure the value of shared CHECK evidence while keeping every original validation.

```js
import { SeenRelayClient } from 'seenrelay';
import { SeenRelayShadowProof } from 'seenrelay/shadow-proof';

const proof = new SeenRelayShadowProof(new SeenRelayClient());

await proof.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders)
});

console.log(proof.report({ avoidedValidationCost: 0.01 }));
```

JavaScript / TypeScript 0.2.3 keeps authoritative validation enabled and can export bounded, sanitized natural-workload records directly into the hostile benchmark input format. The export excludes fact identity, source, raw values and per-call timestamps. CHECK-unavailable calls remain in the sample; an observed mismatch fails safety evidence, and an unavailable deterministic comparison leaves the evidence incomplete rather than safe.

Potential direct savings count only measured `SAME_OBSERVED` cases. Conditional ETag / Last-Modified savings remain excluded until the consuming application measures them separately.

## Optional caller-scheduled OBSERVE

Classic clients can move OBSERVE off the response critical path only when the caller supplies a lifecycle-safe scheduler. The clients do not create hidden workers or threads. If scheduling fails, validation still succeeds and the failure is exposed in local telemetry.

## Where to use it

Good candidates are repeated **read-only** validations with deterministic identity and meaningful cost or latency:

- paid web search;
- metered scraping/proxy work;
- browser rendering or extraction;
- rate-limited APIs;
- model-assisted parsing;
- multi-step validation chains.

Do not suppress mutating/destructive operations. A cheap one-off GET with little repeat probability is usually a poor fit.

## Safety and scope

- exactly two SeenRelay domain operations remain CHECK and OBSERVE;
- no browser, search, crawler or LLM truth function is added to SeenRelay Core;
- local/private/source-native/shared evidence can all fail open to the application's original validation;
- raw private L1 values are not required by the public relay;
- provider-specific adapters are optional and cannot become dependencies of the provider-independent core;
- intermediary cache reuse is not treated as a new independent observation;
- telemetry stays local unless the consuming application exports it.

## Economics

Measure the actual protected workload. A useful first-order model is:

```text
expected savings
= redundant validations actually avoided
- SeenRelay/client overhead
```

For shared CHECK-specific economics, use [`docs/ECONOMICS_LAB.md`](../docs/ECONOMICS_LAB.md). Package downloads, MCP initialize, tools/list requests and first-party Reference Observer activity are not evidence of external adoption.
