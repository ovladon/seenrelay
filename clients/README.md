# SeenRelay deterministic client wrappers

These reference wrappers put SeenRelay directly in front of validation work an application already performs. They are an alternative integration path for applications that want deterministic behavior instead of relying on a model to decide whether to call an MCP tool.

They do **not** change the SeenRelay protocol. The server still has exactly two domain operations: CHECK and OBSERVE.

## Available wrappers

- JavaScript / TypeScript runtime: [`typescript/dist/seenrelay.js`](typescript/dist/seenrelay.js)
- Python: [`python/seenrelay.py`](python/seenrelay.py)

The wrappers are intentionally vendorable single-file clients with zero third-party runtime dependencies. Package-registry publication is not required to evaluate this integration path.

## Default behavior

The default is shadow mode:

1. CHECK;
2. if the caller supplied an explicit reuse policy and permits reuse, return the accepted value;
3. otherwise pass a safe ETag / Last-Modified conditional hint to the application's existing validation when available;
4. run the validation the application already intended to run;
5. OBSERVE the independently obtained result best-effort;
6. fail open if SeenRelay itself times out, returns 429, returns malformed data, or is unavailable.

Application validation errors are never hidden by SeenRelay fail-open behavior.

## JavaScript / TypeScript

```js
import { SeenRelayClient, reuseKnownOnSameObserved } from './seenrelay.js';

const relay = new SeenRelayClient();

const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders),
  // Optional explicit opt-in. Omit this for shadow mode.
  reuse: reuseKnownOnSameObserved
});
```

## Python

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

## Safety and scope

- no new SeenRelay operation;
- no persistent local fact cache;
- no browser or search behavior;
- no automatic truth decision;
- no hidden telemetry upload;
- ETag / Last-Modified hints remain observer-supplied and unverified;
- only `If-None-Match` and `If-Modified-Since` are forwarded, with CR/LF rejected;
- simultaneous identical CHECKs can be coalesced in-process, but completed CHECK results are not cached;
- local telemetry exists only in process memory unless the consuming application explicitly exports it.

Use the wrapper around work that is materially more expensive than the SeenRelay preflight: browser rendering, scraping/proxies, paid APIs, extraction, LLM parsing, rate-limited sources, or multi-step validation. It is a poor fit for a one-off trivial GET with little chance of repeated work.

## Economics

The wrapper can estimate direct-reuse economics using caller-supplied cost units. It does not invent provider pricing, and it does not claim savings from conditional requests unless the consuming application measures them.

The relevant quantity is approximately:

```text
full validation cost actually avoided
- SeenRelay request cost
- integration/operational overhead
```

A package download, MCP initialize, tools/list request, or first-party Reference Observer run is not external adoption.
