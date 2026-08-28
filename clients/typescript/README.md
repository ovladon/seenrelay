# SeenRelay JavaScript / TypeScript client

Provider-independent, zero-third-party-runtime-dependency client for reducing redundant source-backed validation while preserving the application's original validation policy.

The classic client remains available and backward-compatible. Version 0.2.0 adds an opt-in local-first Zero-State path that can provide value before any shared SeenRelay evidence exists.

## Install

```bash
npm install seenrelay@0.2.0
```

Version `0.2.0` is published on the public npm registry and release-gated through clean package installation.

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

Shadow Proof always keeps the original validation. It measures CHECK status distribution, validation time and SeenRelay request latency locally. Potential savings count only `SAME_OBSERVED` calls and subtract caller-supplied request costs.

## Protocol boundary

The client does not add a third SeenRelay operation. The hosted service still exposes only CHECK and OBSERVE. SeenRelay reports source-backed observations; it does not browse, search, verify arbitrary facts on demand, act as a truth oracle or provide shared general-agent memory.

## License

The client package is MIT licensed. The hosted SeenRelay service implementation remains governed by the repository root license.
