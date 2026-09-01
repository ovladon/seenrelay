# SeenRelay JavaScript / TypeScript client

**Avoid redundant expensive validation.**

Local-first, provider-independent client with zero third-party runtime dependencies. For eligible read-only work, reuse locally or privately first, use source-native checks when available, and keep the application's original validation as fallback.

Client 0.2.9 includes the multi-signal shared-evidence assurance helpers and deterministic Fact Coordinate Kit alongside the Ambient framework integrations, local integration catalog, Firecrawl shadow helpers, and existing local-first surfaces. Shared evidence never authorizes reuse by itself.

## Shared CHECK assurance

`seenrelay/assurance` turns additive CHECK evidence into an explicit caller-side policy decision. The multi-signal preset requires at least two observer keys, two cryptographic continuity keys, and two reuse-independence buckets, plus matching value fingerprints and acceptable freshness.

```js
import { createMultiSignalRetainedReusePolicy } from 'seenrelay/assurance';

const reuseRetained = createMultiSignalRetainedReusePolicy({
  maxAgeSeconds: 300
});
```

These signals reduce trivial poisoning risk; they do not establish truth or prove independent real-world actors. High-consequence validation should still require authoritative source confirmation under the application's own policy.

## Deterministic coordinates

`seenrelay/coordinates` separates local call coordinates from shared source-backed fact descriptors. Do not guess semantic equivalence.

```js
import {
  mcpToolCoordinate,
  openApiOperationCoordinate,
  jsonPointerFact
} from 'seenrelay/coordinates';

const localCall = mcpToolCoordinate({
  server: 'catalog-prod',
  name: 'catalog.read',
  arguments: { id: 42 }
});

const apiCall = openApiOperationCoordinate({
  service: 'catalog-api',
  operationId: 'getProduct',
  parameters: { id: 42 }
});

const fact = jsonPointerFact({
  subject: 'Product 42 stock',
  predicate: 'availability.current',
  source: 'https://api.example.com/products/42',
  jsonPointer: '/stock'
});
```

MCP/OpenAPI coordinates are local repetition keys only. Shared fact builders require a stable source-native locator and remain subject to SeenRelay's server-side fact identity contract.

## Ambient MCP

Start in zero-behavior-change local shadow mode. The original tool call still runs; SeenRelay keeps only local fingerprints and aggregate counters. No shadow CHECK or OBSERVE is sent.

```js
import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient, { serverKey: 'docs' });
// use client.callTool(...) normally
console.log(client.seenRelayAmbient.getReport());
```

The report identifies exact repeated calls that are worth reviewing. It is an upper-bound diagnostic, not a savings claim. Native/source/provider validators and SeenRelay CHECK overhead have not yet been subtracted.

For OpenAI Agents JS:

```js
import { ambientOpenAIAgentsMcpServer } from 'seenrelay/ambient';

const server = ambientOpenAIAgentsMcpServer(rawMcpServer);
// pass `server` to the Agent exactly as before
```

For AI SDK MCP tools:

```js
import { ambientAiSdkMcpTools } from 'seenrelay/ambient';

const { tools, seenRelayAmbient } = ambientAiSdkMcpTools(await mcpClient.tools());
```

Active local-first protection is opt-in per exact MCP tool name. Unconfigured tools stay shadow-only:

```js
const client = ambientMcpClient(rawMcpClient, {
  serverKey: 'docs',
  tools: {
    'document.read': { maxAgeMs: 30_000 }
  }
});
```

Do not enable active protection for mutating/destructive operations or for calls whose context/result equivalence has not been reviewed. Unknown call options fail closed from shadow equivalence measurement and preserve the authoritative call.

## Install

```bash
npm install seenrelay
```

## Local-first Zero-State

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

Zero-State is useful without a populated public network:

- simultaneous identical calls are coalesced in-process;
- completed results are reused only inside an explicit freshness window;
- source-native ETag / Last-Modified validators can be retained for conditional confirmation;
- an optional caller-owned private L1 store can reuse encrypted entries across workers or restarts;
- shared SeenRelay CHECK is off by default and is only an optional accelerator;
- OBSERVE is never required to return the application's validated result.

The default completed-result freshness window is `0`. SeenRelay does not invent a TTL for an arbitrary tool call.

## Bind once around MCP tool calls

```js
import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(rawMcpClient, {
  serverKey: 'catalog-server',
  tools: {
    'catalog.read': {
      maxAgeMs: 30_000
    }
  }
});

const result = await client.callTool({
  name: 'catalog.read',
  arguments: { id: 42 }
});
```

Only exact tool names explicitly listed in `tools` are eligible. Unlisted tools pass through unchanged. A policy with no TTL still gains in-flight deduplication but does not reuse completed results sequentially.

The generic core does not infer that a tool is read-only from its name, description or an untrusted hint.

## Generic dispatcher adapters

```js
import { SeenRelayAuto, exactToolAdapter } from 'seenrelay/auto';

const auto = new SeenRelayAuto({
  adapters: [
    exactToolAdapter({
      toolNames: ['catalog.read'],
      maxAgeMs: 30_000
    })
  ]
});

const execute = auto.wrap(yourToolDispatcher);
```

Adapters are ordinary caller-side policy. Core modules do not depend on any particular scraping, browser, API or MCP provider.

Provider-specific integrations, when supplied, are optional subpath adapters. They cannot make their provider a runtime dependency of the core client. For example, the Firecrawl adapter lives under `seenrelay/firecrawl`; public relay evidence is opt-in in that adapter and intermediary provider-cache hits are not re-labeled as new independent observations.

## Source-native conditional validation

For ordinary HTTP reads, source-native validators are preferable to guessing freshness:

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

When an earlier response carried a safe ETag or Last-Modified validator, a later validation can use `If-None-Match` or `If-Modified-Since`. A source `304 Not Modified` confirms the retained value without requiring the public relay.

## Optional private L1

A caller can supply both a private store and codec to reuse values across workers or restarts. SeenRelay ships an AES-256-GCM codec helper; the application owns the encryption key, storage and namespace.

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

Private values are not sent to the public SeenRelay service merely because L1 is enabled. Store/codec failures are fail-open to the application's normal validation path.

## Classic shadow-first client

The original API remains available:

```js
import { SeenRelayClient } from 'seenrelay';

const relay = new SeenRelayClient();

const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders)
});
```

Without an explicit `reuse` policy, the classic client never skips the original validation. It remains the conservative path for directly measuring public CHECK evidence.

## Prove public-relay value before enabling classic reuse

```js
import { SeenRelayClient } from 'seenrelay';
import { SeenRelayShadowProof } from 'seenrelay/shadow-proof';

const proof = new SeenRelayShadowProof(new SeenRelayClient());

const value = await proof.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders)
});

console.log(proof.report({
  avoidedValidationCost: 0.01
}));
```

Shadow Proof always keeps the original validation authoritative. For `SAME_OBSERVED`, it can compare the caller's known deterministic JSON value with the validation result and retain only aggregate agreement counters. Any observed mismatch fails safety evidence; an unavailable deterministic comparison leaves evidence incomplete. Compared raw values are not included in the snapshot or report. Safety-adjusted savings remain unavailable until the observed `SAME_OBSERVED` set passes strict agreement.

Potential economics still use caller-supplied costs and do not constitute a universal savings claim.

## Collect natural-workload evidence for the hostile benchmark

JavaScript / TypeScript Shadow Proof can additionally retain a bounded local record for each naturally occurring protected validation. The record contains only CHECK outcome, simulated policy decision, agreement result, measured call timings and caller-supplied cost units. It does not retain the fact descriptor, source URL, known value, validated value or a per-call timestamp.

The simulated reuse policy runs only **after** the authoritative validation. It cannot suppress the validation or turn measurement into active reuse.

```js
import {
  SeenRelayClient,
  reuseKnownOnSameObserved
} from 'seenrelay';
import { SeenRelayShadowProof } from 'seenrelay/shadow-proof';
import { evaluateHostileBenchmark } from 'seenrelay/economics';

const proof = new SeenRelayShadowProof(
  new SeenRelayClient(),
  { benchmarkRecordLimit: 10_000 }
);

await proof.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders),
  benchmark: {
    reuse: reuseKnownOnSameObserved,
    baselineCost: 5,
    checkCost: 0,
    observeCost: 0,
    observeAfterBaseline: true
  }
});

const benchmarkInput = proof.hostileBenchmarkInput({
  workloadId: 'opaque-run-id',
  controls: {
    local_cache: { available: true, measured: true },
    source_native_conditional: { available: true, measured: true },
    provider_native_cache: { available: true, measured: true }
  }
});

const evaluation = evaluateHostileBenchmark(benchmarkInput);
```

Use only a non-sensitive opaque `workloadId`. Every control marked `available: true` must actually have been measured against the same workload before the hostile evaluator accepts the evidence. CHECK failures remain in the sample as unavailable rather than disappearing. If a hypothetical reuse cannot be compared deterministically with the authoritative validation, safety evidence is `incomplete`; any observed mismatch fails it. Record overflow or an invalid simulated reuse policy invalidates export instead of silently truncating the sample.

The collector does not upload benchmark telemetry. Export is explicit and local. The evaluator reports evidence; `automatic_reuse_enabled_by_evaluator` is always false.

## Firecrawl shadow economics

For an existing Firecrawl MCP client, `seenrelay/firecrawl-shadow` measures whether repeated public scrape work would benefit from shared CHECK without suppressing any Firecrawl call:

```js
import { createFirecrawlShadowPilot } from 'seenrelay/firecrawl-shadow';

const measured = createFirecrawlShadowPilot(existingFirecrawlMcpClient);

await measured.callTool({
  name: 'firecrawl_scrape',
  arguments: {
    url: 'https://example.com/public-page',
    formats: ['markdown'],
    maxAge: 60_000
  }
});

await measured.seenRelayFirecrawlShadowPilot.flush();

const evaluation = measured.seenRelayFirecrawlShadowPilot.evaluate({
  workload_id: 'opaque-workload-id',
  local_cache: { available: false, measured: false },
  source_native_conditional: { available: false, measured: false }
});
```

The authoritative Firecrawl request always runs and returns before the counterfactual measurement needs to finish. A prior retained exact-result fingerprint is CHECKed only after the current provider result has completed and before the current result can contribute an OBSERVE. This keeps the experiment shadow-only and prevents a call from manufacturing its own hit.

Firecrawl provider-cache hits are retained as provider baseline evidence but are not re-labeled as independent OBSERVEs. If Firecrawl does not expose a usable `creditsUsed` value, cost evaluation remains incomplete unless the caller explicitly supplies a justified `provider_credit_fallback_units` in the same provider-credit unit. Local cache and source-native controls must be declared truthfully; an available but unmeasured control makes the hostile evaluator reject the evidence.

A favorable pilot result is evidence only for the measured workload. It does not enable reuse or establish a universal Firecrawl savings rate.

### Direct Firecrawl JavaScript SDK shadow adapter

For applications that use the Firecrawl JavaScript SDK directly, the staged `seenrelay/firecrawl-sdk-shadow` subpath wraps current `scrape(url, options)` and legacy `scrapeUrl(url, options)` calls without changing provider behavior:

```js
import { createFirecrawlSdkShadowPilot } from 'seenrelay/firecrawl-sdk-shadow';

const measured = createFirecrawlSdkShadowPilot(existingFirecrawlSdkClient, {
  // SeenRelay measurement horizon only. It is not added to the Firecrawl request.
  maxAgeMs: 60_000
});

const result = await measured.scrape('https://example.com/public-page', {
  formats: ['markdown']
});

await measured.seenRelayFirecrawlSdkShadowPilot.flush();
```

The original SDK method always runs with the exact argument list supplied by the application, and the exact raw provider result is returned. The adapter converts the successful result only inside the measurement bridge so it can reuse the existing Firecrawl shadow semantics. If that internal measurement serialization fails after Firecrawl succeeds, the provider result still returns successfully and shadow evidence for that call is simply unavailable.

## Protocol boundary

The client does not add a third SeenRelay operation. The hosted service still exposes only CHECK and OBSERVE. SeenRelay reports source-backed observations; it does not browse, search, verify arbitrary facts on demand, act as a truth oracle or provide shared general-agent memory.

## License

The client package is MIT licensed. The hosted SeenRelay service implementation remains governed by the repository root license.

## Ambient framework integrations

Ambient integrations preserve the authoritative tool call and start in local-only shadow mode. They do not send CHECK or OBSERVE from shadow measurement and do not authorize reuse automatically.

```js
import { ambientLangChainMcpHooks } from "seenrelay/ambient";
const hooks = ambientLangChainMcpHooks();
// pass hooks.beforeToolCall / hooks.afterToolCall to LangChain MCP adapters
console.log(hooks.seenRelayAmbient.getReport());
```

OpenAI Agents and AI SDK adapters remain available from the same `seenrelay/ambient` entry point.

Coding agents and integration tooling can inspect the installed package without network discovery:

```js
import { getAmbientIntegrationCatalog } from "seenrelay/ambient";
console.log(getAmbientIntegrationCatalog());
```

The catalog is local metadata only. It adds no telemetry, hosted operation, or reuse authorization.
