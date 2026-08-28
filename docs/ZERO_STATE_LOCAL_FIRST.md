# Zero-state local-first client

The experimental local-first client is designed for repeated read-only validation work where a caller should receive useful optimization before any shared SeenRelay evidence exists.

It does not add a SeenRelay domain operation. The hosted protocol remains CHECK and OBSERVE.

## Execution order

For an eligible read-only coordinate, the client uses this order:

1. coalesce an identical in-flight call in the current process;
2. reuse a sufficiently recent in-process result only when an explicit local freshness window permits it;
3. optionally reuse a sufficiently recent caller-owned encrypted private L1 result when an explicit private freshness window permits it;
4. if a retained local or private source-native validator exists, pass `If-None-Match` or `If-Modified-Since` to the caller's existing validator;
5. only when no source-native validator is available, optionally query shared SeenRelay if the configured relay mode permits it;
6. otherwise execute the caller's normal validator;
7. optionally schedule OBSERVE after independently confirmed validation.

The default relay mode is `off`. Therefore a new installation performs zero shared CHECK requests on the validation critical path until the integrator deliberately enables relay sampling or relay checking.

## L0 process cache boundary

The completed-result cache is process memory only and has a bounded entry count. The default local freshness window is `0`, which disables sequential completed-result reuse while preserving exact in-flight coalescing and retained source-validator support. A positive local TTL must be declared explicitly by the adapter or caller.

With TTL `0`, a result that has no ETag or Last-Modified validator is not retained after the call. A cloneable result may be retained in process memory when a source-native validator is present so a later source `304 Not Modified` can return the previously confirmed value. Values that cannot be safely cloned with `structuredClone` are not retained.

Local coordinate maps use SHA-256 keys rather than raw coordinate JSON as map keys. No local cache content is uploaded by the cache itself.

## L1 private reuse

Private L1 is optional and caller-owned. It is intended for reuse across workers or process restarts without sending those cached values to the public SeenRelay service.

`privateStore` and `privateCodec` must be configured together. The built-in `createAesGcmPrivateCodec(...)` uses AES-256-GCM and requires a caller-supplied 32-byte key. The SHA-256 coordinate key is authenticated as additional data, so moving a ciphertext to another coordinate causes decryption failure.

The store receives only an opaque SHA-256 coordinate key and the sealed payload produced by the codec. Store or decryption failures are fail-open and do not suppress the caller's original source validation.

Private completed-result reuse also defaults to TTL `0`. A positive `privateMaxAgeMs` must be declared explicitly. Even with private TTL `0`, a result carrying ETag or Last-Modified may be stored encrypted so another worker can attempt source-native conditional confirmation rather than trusting stale private content.

Example storage contract:

```js
import { randomBytes } from 'node:crypto';
import { SeenRelayZeroState, createAesGcmPrivateCodec } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  privateStore: {
    get: async (key) => privateCache.get(key),
    set: async (key, sealedValue) => privateCache.set(key, sealedValue)
  },
  privateCodec: createAesGcmPrivateCodec(randomBytes(32)),
  privateMaxAgeMs: 30_000
});
```

Production deployments must load a stable encryption key from an appropriate secret-management mechanism; generating a new key at startup, as in the isolated example above, intentionally prevents reuse after restart.

## Source-native confirmation

A retained ETag or Last-Modified value may be supplied to the original source validation. A `304 Not Modified` result is treated as confirmation from the source and refreshes the local/private receipt timestamp. SeenRelay is not the authority for that confirmation.

When a source-native validator exists, that confirmation path is attempted before an optional shared CHECK. `createConditionalFetchValidator(...)` is restricted to GET and HEAD.

## Shared relay boundary

`relayMode: "off"` is the default.

- `off`: no shared CHECK;
- `sample`: CHECK only according to the configured sampling probability and only after local/private/source-native opportunities are exhausted;
- `always`: CHECK on protected misses that do not already have a retained source-native validator.

A relay result never suppresses validation unless the caller supplied a reuse policy and that policy accepts the returned CHECK evidence.

OBSERVE contribution is separate from CHECK placement. In the default `scheduled-only` mode, contribution occurs only when the consuming runtime supplies a scheduler such as a request-lifecycle `waitUntil` primitive. Without a scheduler it is skipped rather than adding hidden blocking latency. Scheduler and OBSERVE failures are fail-open and never invalidate the caller's successful source validation.

A private L1 hit is not an independent observation and therefore does not itself justify a new OBSERVE. OBSERVE remains tied to independently confirmed source validation.

## Automatic dispatcher binding

`seenrelay/auto` wraps a generic tool dispatcher once. Only calls matching an explicit deterministic adapter are protected. Non-matching calls pass through unchanged.

The built-in `exactToolAdapter(...)` requires an explicit allowlist of tool names and uses the complete tool argument object in the local identity by default. This intentionally favors false misses over unsafe convergence. Its default completed-result TTL is also `0`; positive reuse windows must be declared explicitly.

If more than one adapter matches the same call, execution fails with an adapter-ambiguity error rather than guessing an optimization policy. Mutation tools should not be allowlisted.

For HTTP-style adapters, any custom identity mapping must include every representation-affecting qualifier needed to prevent unsafe convergence, including authentication scope, content negotiation, locale, selectors, query parameters and other source-specific inputs where applicable. Semantic or LLM equivalence is not authoritative identity.

## One-time MCP client binding

`seenrelay/mcp-auto` wraps an MCP client's existing `callTool()` method once. It does not alter MCP resources, prompts or list operations and does not require the model to choose a SeenRelay tool.

```js
import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(existingMcpClient, {
  serverKey: 'catalog-production',
  tools: {
    'catalog.read': { maxAgeMs: 30_000 },
    'document.fetch': { maxAgeMs: 10_000 }
  }
});
```

Only exact tool names declared in `tools` are protected. The default identity includes the server binding, exact tool name and complete `params.arguments`. The default TTL for each tool is `0`.

`Client.callTool()` may also receive request options. Those calls pass through unchanged unless the tool policy provides an explicit `coordinate(params, rest)` function. This prevents request-option semantics from being silently omitted from identity. Custom coordinates must include every result-affecting input required by the integration.

Other client methods remain bound to the original MCP client object.

## Safety invariants

- no model/LLM determines whether two coordinates are equivalent;
- no read-only classification is inferred from a tool name or description;
- arguments differ => coordinates differ by default;
- mutation calls remain untouched unless an integrator incorrectly allowlists them;
- completed-result TTL is zero unless explicitly declared;
- private completed-result TTL is zero unless explicitly declared;
- TTL-zero results without source-native validators are not retained after completion;
- persistent/private storage requires an explicit codec and store pair;
- private store or decrypt failures fail open;
- relay CHECK is off by default;
- at relay hit probability zero, critical-path shared CHECK count is zero;
- shared reuse requires an explicit caller reuse policy;
- source-native `304` is distinguished from SeenRelay evidence;
- scheduler/OBSERVE failure is fail-open;
- MCP call request options bypass optimization by default unless identity handling is explicit;
- the local/private layer remains useful when the shared network contains no observations.
