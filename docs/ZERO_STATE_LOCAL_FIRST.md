# Zero-state local-first client

The experimental local-first client is designed for repeated read-only validation work where a caller should receive useful optimization before any shared SeenRelay evidence exists.

It does not add a SeenRelay domain operation. The hosted protocol remains CHECK and OBSERVE.

## Execution order

For an eligible read-only coordinate, the client uses this order:

1. coalesce an identical in-flight call in the current process;
2. reuse a sufficiently recent in-process result only when an explicit local freshness window permits it;
3. if a retained source-native validator exists, pass `If-None-Match` or `If-Modified-Since` to the caller's existing validator;
4. only when no source-native validator is available, optionally query shared SeenRelay if the configured relay mode permits it;
5. otherwise execute the caller's normal validator;
6. optionally schedule OBSERVE after independently confirmed validation.

The default relay mode is `off`. Therefore a new installation performs zero shared CHECK requests on the validation critical path until the integrator deliberately enables relay sampling or relay checking.

## Local cache boundary

The completed-result cache is process memory only. It has a bounded entry count. The default local freshness window is `0`, which disables sequential completed-result reuse while preserving exact in-flight coalescing and retained source-validator support. A positive local TTL must be declared explicitly by the adapter or caller.

Values that cannot be safely cloned with `structuredClone` are not retained as completed local cache entries. No local cache content is uploaded by the cache itself.

## Source-native confirmation

A retained ETag or Last-Modified value may be supplied to the original source validation. A `304 Not Modified` result is treated as source confirmation and refreshes the local result timestamp. SeenRelay is not the authority for that confirmation.

When a source-native validator exists, that confirmation path is attempted before an optional shared CHECK.

`createConditionalFetchValidator(...)` is restricted to GET and HEAD.

## Shared relay boundary

`relayMode: "off"` is the default.

- `off`: no shared CHECK;
- `sample`: CHECK only according to the configured sampling probability and only after local/source-native opportunities are exhausted;
- `always`: CHECK on protected cache misses that do not already have a retained source-native validator.

A relay result never suppresses validation unless the caller supplied a reuse policy and that policy accepts the returned CHECK evidence.

OBSERVE contribution is separate from CHECK placement. In the default `scheduled-only` mode, contribution occurs only when the consuming runtime supplies a scheduler such as a request-lifecycle `waitUntil` primitive. Without a scheduler it is skipped rather than adding hidden blocking latency. Scheduler and OBSERVE failures are fail-open and never invalidate the caller's successful source validation.

## Automatic dispatcher binding

`seenrelay/auto` wraps a tool dispatcher once. Only calls matching an explicit deterministic adapter are protected. Non-matching calls pass through unchanged.

The built-in `exactToolAdapter(...)` requires an explicit allowlist of tool names and uses the complete tool argument object in the local identity by default. This intentionally favors false misses over unsafe convergence. Its default completed-result TTL is also `0`; positive reuse windows must be declared explicitly.

If more than one adapter matches the same call, execution fails with an adapter-ambiguity error rather than guessing an optimization policy.

Mutation tools should not be allowlisted.

For HTTP-style adapters, any custom identity mapping must include every representation-affecting qualifier needed to prevent unsafe convergence, including authentication scope, content negotiation, locale, selectors, query parameters and other source-specific inputs where applicable. Semantic or LLM equivalence is not authoritative identity.

## Example

```js
import { exactToolAdapter, protectToolDispatcher } from 'seenrelay/auto';

const { execute } = protectToolDispatcher(existingToolDispatcher, {
  adapters: [
    exactToolAdapter({
      toolNames: ['catalog.read', 'document.fetch'],
      maxAgeMs: 30_000 // explicit caller policy
    })
  ]
});
```

With relay mode left at its default, this can coalesce eligible calls and apply any explicitly authorized local TTL without a shared SeenRelay CHECK. Source-native validators can still provide confirmation even when the local TTL is zero.

## Safety invariants

- no model/LLM determines whether two coordinates are equivalent;
- no read-only classification is inferred from a tool name or description;
- arguments differ => coordinates differ by default;
- mutation calls remain untouched unless an integrator incorrectly allowlists them;
- completed-result TTL is zero unless explicitly declared;
- relay CHECK is off by default;
- at relay hit probability zero, critical-path shared CHECK count is zero;
- shared reuse requires an explicit caller reuse policy;
- source-native `304` is distinguished from SeenRelay evidence;
- scheduler/OBSERVE failure is fail-open;
- the local layer remains useful when the shared network contains no observations.
