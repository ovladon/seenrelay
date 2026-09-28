# Fleet coordination preview

> Draft API. This page belongs to PR #304 and is not part of the current stable release.

SeenRelay's existing Zero-State client coalesces identical in-flight work inside one process. The fleet preview extends the same conservative idea across workers that share a caller-owned coordination store.

It does **not** replace your AI gateway or provider.

## What it does

For an explicitly shareable read-only operation:

```
worker A ─┐
worker B ─┼── same exact coordinate ── one authoritative execution
worker C ─┘                                │
                                          └── sealed result fan-out
```

Completed results are not treated as a sequential cache entry. A later call executes normally unless another SeenRelay layer independently authorizes reuse.

## Required semantics

Fleet coordination activates only when you explicitly declare:

- `sideEffectClass: 'read_only'` or `'idempotent_read'`;
- `exactSingleAnswerShareable: true`;
- `independentSamplesRequired: false`.

Mutations, underspecified calls and independent-sampling workloads pass through unchanged.

If a provider already offers a zero-cost exact response cache, declare that native control and SeenRelay steps aside.

## Install shape

The preview is exported as:

```js
import {
  SeenRelayFleetCoordinator,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from 'seenrelay/fleet';

import { createAesGcmPrivateCodec } from 'seenrelay/zero-state';
```

The Redis REST adapter is dependency-free. The caller owns the Redis account and the encryption key.

## OpenAI example

```js
import OpenAI from 'openai';
import { randomBytes } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from 'seenrelay/fleet';
import { createAesGcmPrivateCodec } from 'seenrelay/zero-state';

const openai = new OpenAI();

const store = createRedisRestFleetStore({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// Load a stable 32-byte fleet key from your own secret manager in production.
// Do not generate a new key on every process start.
const key = Buffer.from(process.env.SEENRELAY_FLEET_KEY, 'base64');

const fleet = new SeenRelayFleetCoordinator({
  store,
  codec: fleetCodecFromPrivateCodec(createAesGcmPrivateCodec(key)),
  // Use a non-sensitive opaque fleet / tenant scope.
  scopeKey: process.env.SEENRELAY_FLEET_SCOPE
});

async function expensiveReadOnlyTask(input) {
  return fleet.run({
    coordinate: {
      provider: 'openai',
      operation: 'responses.create',
      model: 'gpt-5.6-sol',
      input
    },
    policy: {
      sideEffectClass: 'read_only',
      exactSingleAnswerShareable: true,
      independentSamplesRequired: false
    },
    execute: () => openai.responses.create({
      model: 'gpt-5.6-sol',
      input
    })
  });
}
```

Every result-affecting option belongs in the coordinate. If temperature, tools, files, tenant state, model version or another qualifier can change the result, include it.

## Provider-native controls first

If a route already has a zero-cost exact response cache:

```js
policy: {
  sideEffectClass: 'read_only',
  exactSingleAnswerShareable: true,
  independentSamplesRequired: false,
  nativeControl: {
    exactResponseCache: true,
    cacheHitMarginalCostZero: true
  }
}
```

SeenRelay passes the operation through instead of adding redundant coordination.

## Privacy

The fleet store receives:

- an opaque hashed scope;
- an opaque exact-coordinate hash;
- lease/generation metadata;
- the caller-sealed result.

The built-in adapter can reuse the existing AES-256-GCM private codec. The Redis store does not need plaintext prompts or results.

Different fleet scopes do not coordinate.

## Failure behavior

Fleet coordination is fail-open:

- shared-store error -> execute the original operation;
- follower timeout -> execute the original operation;
- decrypt/open failure -> execute the original operation;
- leader failure -> followers do not receive a false success;
- oversized shared result -> leader keeps its own result, no distribution.

## What this is not

It is not:

- a generic response cache;
- semantic caching;
- cross-customer result sharing;
- a replacement for provider prompt caching;
- permission to collapse stochastic sampling;
- permission to collapse writes or side effects.

## Current preview evidence

The repository tests require:

- two coordinator instances can share one authoritative in-flight execution;
- two separate Node processes can share one authoritative in-flight execution;
- sequential calls do not become an accidental cache;
- tenant/fleet scopes do not mix;
- unsafe policies pass through;
- zero-cost provider-native exact caches take precedence;
- failures fail open.

A separate remote-store proof workflow tests the same primitive through a temporary Redis REST instance.

## Adoption path

Start with one expensive, read-only, exact-shareable operation. Observe telemetry before expanding scope.

If the operation needs independent answers, diversity, voting, per-user private state or side effects, do not mark it shareable.
