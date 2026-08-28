# Zero-state local-first client

The experimental local-first client is designed for repeated read-only validation work where a caller should receive useful optimization before any shared SeenRelay evidence exists.

It does not add a SeenRelay domain operation. The hosted protocol remains CHECK and OBSERVE.

## Execution order

For an eligible read-only coordinate, the client uses this order:

1. coalesce an identical in-flight call in the current process;
2. reuse a sufficiently recent in-process result;
3. if a retained source-native validator exists, pass `If-None-Match` or `If-Modified-Since` to the caller's existing validator;
4. optionally query shared SeenRelay only when the configured relay mode permits it;
5. otherwise execute the caller's normal validator;
6. optionally schedule OBSERVE after independently confirmed validation.

The default relay mode is `off`. Therefore a new installation performs zero shared CHECK requests on the validation critical path until the integrator deliberately enables relay sampling or relay checking.

## Local cache boundary

The completed-result cache is process memory only. It has a bounded entry count and TTL. Values that cannot be safely cloned with `structuredClone` are not retained as completed local cache entries.

No local cache content is uploaded by the cache itself.

## Source-native confirmation

A retained ETag or Last-Modified value may be supplied to the original source validation. A `304 Not Modified` result is treated as source confirmation and refreshes the local result timestamp. SeenRelay is not the authority for that confirmation.

`createConditionalFetchValidator(...)` is restricted to GET and HEAD.

## Shared relay boundary

`relayMode: "off"` is the default.

- `off`: no shared CHECK;
- `sample`: CHECK only according to the configured sampling probability;
- `always`: CHECK on each protected cache miss before source validation.

A relay result never suppresses validation unless the caller supplied a reuse policy and that policy accepts the returned CHECK evidence.

OBSERVE contribution is separate from CHECK placement. In the default `scheduled-only` mode, contribution occurs only when the consuming runtime supplies a scheduler such as a request-lifecycle `waitUntil` primitive. Without a scheduler it is skipped rather than adding hidden blocking latency.

## Automatic dispatcher binding

`seenrelay/auto` wraps a tool dispatcher once. Only calls matching an explicit deterministic adapter are protected. Non-matching calls pass through unchanged.

The built-in `exactToolAdapter(...)` requires an explicit allowlist of tool names and uses the complete tool argument object in the local identity by default. This intentionally favors false misses over unsafe convergence.

If more than one adapter matches the same call, execution fails with an adapter-ambiguity error rather than guessing an optimization policy.

Mutation tools should not be allowlisted.

## Example

```js
import { exactToolAdapter, protectToolDispatcher } from 'seenrelay/auto';

const { execute } = protectToolDispatcher(existingToolDispatcher, {
  adapters: [
    exactToolAdapter({
      toolNames: ['catalog.read', 'document.fetch'],
      maxAgeMs: 30_000
    })
  ]
});
```

With the default edge configuration this can coalesce and reuse eligible calls locally without any shared SeenRelay CHECK.

## Safety invariants

- no model/LLM determines whether two coordinates are equivalent;
- no read-only classification is inferred from a tool name or description;
- arguments differ => coordinates differ by default;
- mutation calls remain untouched unless an integrator incorrectly allowlists them;
- relay CHECK is off by default;
- shared reuse requires an explicit caller reuse policy;
- source-native `304` is distinguished from SeenRelay evidence;
- the local layer remains useful when the shared network contains no observations.
