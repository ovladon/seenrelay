# SeenRelay deterministic client wrappers

These reference wrappers put SeenRelay directly in front of validation work an application already performs. They are an alternative integration path for applications that want deterministic behavior instead of relying on a model to decide whether to call an MCP tool.

They do **not** change the SeenRelay protocol. The server still has exactly two domain operations: CHECK and OBSERVE.

## Available wrappers

- JavaScript / TypeScript runtime: [`typescript/dist/seenrelay.js`](typescript/dist/seenrelay.js)
- Python: [`python/seenrelay.py`](python/seenrelay.py)

The wrappers have zero third-party runtime dependencies. Package metadata is prepared for npm and PyPI publication, but registry publication is a separate release step and must not be inferred from the repository metadata alone.

The client wrappers are MIT licensed under [`clients/LICENSE`](LICENSE). This permissive client license does not change the repository-root license that governs the SeenRelay hosted service implementation.

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

## Prove value in shadow mode

Do not enable reuse because a generic benchmark says it should help. Measure the workload that would actually be protected.

JavaScript / TypeScript:

```js
import { SeenRelayClient } from './seenrelay.js';
import { SeenRelayShadowProof } from './shadow-proof.js';

const proof = new SeenRelayShadowProof(new SeenRelayClient());

await proof.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders)
});

console.log(proof.report({
  avoidedValidationCost: 0.01 // use your own cost or invoice unit
}));
```

Python:

```python
from seenrelay import SeenRelayClient
from seenrelay_shadow import SeenRelayShadowProof

proof = SeenRelayShadowProof(SeenRelayClient())

proof.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)

print(proof.report(
    avoided_validation_cost=0.01,
))
```

Shadow Proof never supplies a reuse policy, so the application's original validation still runs. It records locally:

- CHECK status distribution;
- `SAME_OBSERVED` rate;
- validation time;
- CHECK and OBSERVE network latency from the underlying client telemetry;
- conditional-hint frequency;
- potential validation calls avoided if direct reuse were later enabled;
- caller-supplied monetary economics and time break-even estimates.

The report is deliberately conservative. Direct potential savings count only `SAME_OBSERVED`. Conditional ETag / Last-Modified savings are excluded until the consuming application measures them. If `SAME_OBSERVED` is zero, gross potential savings are reported as zero.

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

For direct reuse, a useful first-order model is:

```text
expected savings
= reusable validations avoided
- CHECK overhead on all protected validations
- OBSERVE overhead on validations that still run
```

For time, if `V` is average validation latency, `C` average CHECK latency and `O` average OBSERVE latency, the direct-reuse break-even hit rate under the current blocking-observe wrapper is approximately:

```text
(C + O) / (V + O)
```

The Shadow Proof helper computes this from measured client/validation timing. Monetary break-even uses caller-supplied cost units rather than vendor pricing embedded in the library.

A package download, MCP initialize, tools/list request, or first-party Reference Observer run is not external adoption.
