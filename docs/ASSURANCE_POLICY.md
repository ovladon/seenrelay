# Shared CHECK assurance policy

SeenRelay CHECK reports recent observations. It does not certify truth or independent real-world identity.

Shared CHECK is off by default in Zero-State. A `SAME_OBSERVED` response alone does not make the client reuse a value: active reuse requires an explicit caller-supplied policy.

## Multi-signal helper

The client `assurance` module provides an explicit opt-in policy helper for retained-value reuse.

Its default assessment requires all of the following:

- CHECK status is `SAME_OBSERVED`;
- the returned known/latest value fingerprints are present and equal;
- the evidence is inside both the server CHECK window and any stricter caller window;
- at least two distinct observer keys support the recent value;
- at least two of those are cryptographic Ed25519 continuity keys;
- at least two privacy-salted reuse-independence buckets are represented.

JavaScript / TypeScript:

```js
import { createConservativeRetainedReusePolicy } from 'seenrelay/assurance';
const reuseRetained = createConservativeRetainedReusePolicy({ maxAgeSeconds: 300 });
```

Python exposes the equivalent `conservative_retained_reuse_policy(...)` helper.

## What the signals mean

An Ed25519 observer key proves possession/continuity for that key and signed payload integrity. A reuse-independence bucket is a privacy-salted network separation signal already used for anti-farming. Multiple keys or buckets make trivial single-origin poisoning harder.

None of these establish that observers are independent real-world actors, that one actor cannot control multiple keys or networks, or that the submitted value is true.

For high-consequence validation, require authoritative source confirmation under the consuming application's own policy. Source-native validation remains stronger than shared observational evidence when available.

The helper does not add a SeenRelay operation, change CHECK/OBSERVE semantics, or enable reuse automatically.
