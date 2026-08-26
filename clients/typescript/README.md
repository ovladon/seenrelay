# SeenRelay JavaScript / TypeScript client

Deterministic, zero-third-party-runtime-dependency client for placing SeenRelay CHECK directly in front of repeated source-backed validation.

## Install

Package metadata is prepared for registry publication. Until the package is published, use the repository copy from `clients/typescript/dist/`.

## Shadow mode

```js
import { SeenRelayClient } from 'seenrelay';

const relay = new SeenRelayClient();

const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => expensiveValidation(conditionalHeaders)
});
```

Without an explicit `reuse` policy, validation is never skipped.

## Prove value before enabling reuse

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
  avoidedValidationCost: 0.01 // use your own invoice/cost unit
}));
```

Shadow Proof always keeps the original validation. It measures CHECK status distribution, validation time and SeenRelay request latency locally. Potential savings count only `SAME_OBSERVED` calls and subtract caller-supplied request costs. Savings from conditional ETag / Last-Modified requests are deliberately excluded unless measured separately by the application.

Use SeenRelay around repeated validation that is materially more expensive than the preflight. It is generally a poor fit for a cheap one-off GET.

## License

The client package is MIT licensed. The hosted SeenRelay service implementation remains governed by the repository root license.
