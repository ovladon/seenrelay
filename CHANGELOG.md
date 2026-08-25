# Changelog

## 0.3.6 - 2026-08-25
- Made the Control Room operational snapshot independent from optional external-adoption classification so an adoption query failure cannot blank the admin surface.
- Added an explicit external / first-party / total split, adoption milestones, Reference Observer health context, and an external-only Hive Radar with a truthful empty state.
- Preserved first-party bootstrap data while keeping it excluded from external adoption metrics.
- Bound the Preview Release Gate to the current pull request's Vercel Preview URL instead of a stale hard-coded branch alias, while retaining exact deployment-SHA verification.
- Synchronized the service, static MCP server card, and Official MCP Registry metadata at 0.3.6.

## 0.3.5 - 2026-08-25
- Changed Control Room adoption telemetry to external-only views by excluding the first-party Reference Observer from active Hive radar leases, retained OBSERVE/fact counts, and contributor rankings.
- Count qualified reuse as external adoption only when the consuming lease is external; a first-party seed may still support genuine third-party reuse.
- Kept CHECK telemetry external by invariant because the Reference Observer performs OBSERVE only and never calls CHECK.
- Added structural regression coverage for the external-adoption boundary.

## 0.3.4 - 2026-08-25
- Added the bounded first-party Reference Observer and scheduled allowlisted public-source workflow.
- Kept the Reference Observer outside the SeenRelay server runtime and on the same public OBSERVE path as ordinary clients.
- Added explicit documentation that first-party observer activity is bootstrap data and must not be treated as third-party adoption.
- Added a static MCP server card for directory discovery and synchronized tool metadata for `check_fact` and `observe_fact`.

## 0.3.3 - 2026-08-25
- Reworked public documentation around a cooperative freshness-cache model and removed brand-specific analogy language.
- Added explicit cold-start behavior: UNKNOWN passthrough, first-observation seeding, same-fleet reuse, and additive external coverage.
- Simplified public access wording to state that the service is currently free without exposing payment configuration details in product documentation.
- Reduced the public documentation set to implementation, integration, operations, security, and protocol material.
- Clarified Control Room runtime labels and added confirmation before restrictive custom runtime-control changes.
- Updated public-surface and release-gate assertions for the revised machine descriptor and landing page.

## 0.3.0 - 2026-08-24
- Replaced the hand-built MCP transport with the official `@modelcontextprotocol/server` v2 SDK and `createMcpHandler`.
- Targeted MCP protocol revision `2026-07-28`.
- Removed A2A discovery from v1 because no real A2A task endpoint exists.
- Salt-hashed client and observer identifiers and made Vercel environments fail closed without a high-entropy `PRIVACY_SALT`.
- Scoped idempotency keys to the privacy-preserving observer key to avoid cross-agent collisions.
- Hardened fact identity to `seenrelay-fact-v3`: mutable observed content is excluded from identity; stable source-native locators are preferred, otherwise a shared predicate plus minimal qualifiers is used.
- Added deterministic URL hygiene: fragments and known tracking parameters are removed, remaining query parameters are sorted deterministically, and credential/signature-bearing source URLs are rejected before Hive admission.
- Added transport-independent Ed25519 observer proof-of-possession with bounded proof timestamps and exact-proof replay resistance.
- Separated cryptographic observer-key counts from unverified observer-key counts without claiming Sybil resistance or real-world identity independence.
- Added frictionless Hive Leases, free token-bucket CHECK admission, delayed contribution rewards based on qualified reuse across distinct conservative network-derived independence buckets, duplicate reward suppression and daily award caps.
- Added `FREEZE` admission ordering so disabled runtime state is checked before stateful Hive lease/quota mutation.
- Added the human-only SeenRelay Control Room with live Hive Radar, runtime controls, audit trail, retention housekeeping, standards posture, operational readiness and prepared `NORMAL`, `SHIELD`, `READ_ONLY`, and `FREEZE` incident modes.
- Added runtime safety controls without creating any third agent-facing domain operation; CHECK and OBSERVE remain the only domain operations.
- Added Preview/Production database isolation, exact-deployment-SHA release gating and a Production E2E namespace fuse.
- Added privacy-safe public network metrics with qualified-reuse CHECK accounting separated from contributor award count.
- Added runtime tests for fact-key convergence, URL hygiene, exact source locators, Unicode safety, Ed25519 verification, tamper rejection, expired-proof rejection, Hive classification, anti-farming, credential rotation and control-plane guardrails.
- Added a production dependency vulnerability audit gate, committed lockfile and `npm ci`; removed unused local Vercel CLI tooling from the dependency tree.
- Added Dependabot and a read-only Standards Watch that can discover and prepare maintenance work but cannot mutate Production automatically.
- Preserved the hard billing-disabled boundary.

## 0.2.0 - 2026-08-21
- Renamed working product from FactTick to SeenRelay.
- Migrated target architecture from Cloudflare/D1 to Vercel + Neon Postgres.
- Kept the two-operation product boundary: CHECK and OBSERVE.
- Updated MCP target protocol to 2026-07-28 stateless semantics.
- Preserved the billing-disabled invariant.
