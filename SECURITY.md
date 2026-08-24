# Security

Do not report secrets or exploitable vulnerability details in public issues.

SeenRelay is intentionally conservative: it reports recent observations, not truth. Treat observer counts as signals, not proof of independent human or organizational identity.

## Private vulnerability reporting

Use GitHub's private vulnerability reporting for this repository when available. If that channel is unavailable, do not disclose exploit details publicly; contact the repository owner through a private channel.

## Observer identity assurance

SeenRelay distinguishes three observer classes:

1. `cryptographic_key` — a valid `ed25519-v1` proof demonstrates possession of the corresponding private key and binds the OBSERVE payload to that key.
2. `self_asserted` — an `observer_id` without cryptographic proof is only an unverified continuity hint.
3. `anonymous_network_hint` — a privacy-salted transport-derived hint; weakest assurance.

A valid Ed25519 proof does **not** establish that one key equals one person, one organization, one device, or one autonomous agent. Generating multiple keys is cheap, so cryptographic proof alone does not solve Sybil attacks. SeenRelay therefore exposes cryptographic and unverified observer counts separately and must not translate key counts into claims of independent consensus.

Future account, organization, hardware-attestation, or trusted-issuer bindings may increase assurance by binding a persistent key to a separately verified principal. Such bindings must remain distinct from truth assessment and must not change the two-operation CHECK/OBSERVE protocol boundary.

## Replay resistance

Observer proofs contain a timestamp and nonce. Proof timestamps are accepted only within a bounded skew window. When a cryptographically signed observation has no explicit idempotency key, its verified proof fingerprint is used to derive a deterministic observation id, so an exact proof replay does not create a second accepted observation.

This does not prevent a malicious key holder from signing the same claim again with a new nonce. Same-observer/value deduplication limits immediate amplification, but Sybil and repeated-claim abuse remain separate policy concerns.

## Fact identity and URL hygiene

Fact identity is deterministic and requires no network lookup. The source canonicalizer removes URL fragments and known tracking parameters, sorts remaining query parameters deterministically, rejects URL userinfo credentials, and rejects authentication/signature-bearing query parameters before stateful Hive admission. This prevents credential-bearing private URLs from being collapsed into a shared fact identity while reducing benign tracking-driven fragmentation.

`subject` is descriptive and excluded from fact identity. Stable source-native locators should be used whenever available. Without a locator, the machine predicate remains identity-bearing.

## Non-goals / hard boundaries

SeenRelay must not:

- browse or fetch a source in order to verify an observation;
- use an LLM as a truth oracle;
- claim real-world identity independence from cryptographic keys alone;
- convert observer counts into certified truth;
- execute billing while the billing-disabled boundary is active.

Security-sensitive findings should use the private reporting path above.
