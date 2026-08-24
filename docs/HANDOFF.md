# SeenRelay Operational Handoff

## Current state — 2026-08-24

- Brand: **SeenRelay**.
- Canonical domain: **seenrelay.com**.
- Version: `0.3.0` deployment candidate.
- Repository: private `ovladon/seenrelay`.
- Working branch: `review/v0.3-bootstrap`.
- Pull request: #1, draft; `main` remains unmerged pending explicit approval.
- Hosting: Vercel Pro.
- State: Neon Postgres.
- Billing: **disabled** (`PAYMENTS_ENABLED=false`, `PAYMENT_PROVIDER=none`).

## Verified implementation

- exactly two domain operations: CHECK and OBSERVE;
- fact identity `seenrelay-fact-v3`;
- source URL hygiene and deterministic canonicalization;
- optional Ed25519 observer proof-of-possession;
- Hive Lease accountless admission and delayed qualified-reuse reward;
- conservative reuse-independence anti-farming guard;
- Neon migrations for core state, Hive state and admin control plane;
- Hono/Node ESM runtime on Vercel;
- REST/OpenAPI;
- official MCP v2 server SDK targeting protocol revision `2026-07-28`;
- authenticated Control Room with live radar, controls, incident playbooks and audit trail;
- privacy-safe public network metrics;
- dual human/machine public surface;
- billing-disabled fail-closed boundary;
- reproducible `package-lock.json` + `npm ci` build;
- Standards Watch and Dependabot maintenance automation;
- generic operations export and custody-transfer readiness;
- make-before-break credential rotation using optional previous verification/authentication keys.

## Verified Preview E2E

The review branch has passed end-to-end tests covering:

- health;
- UNKNOWN -> OBSERVE -> SAME_OBSERVED -> CHANGED_OBSERVED -> dedup;
- qualified useful reuse and duplicate-reward suppression;
- conservative anti-farming across reuse-independence buckets;
- observer-scoped idempotency;
- CONTESTED and STALE;
- fact-v3 locator convergence;
- credential-bearing source rejection before Hive admission;
- admin/billing safety boundaries;
- MCP `server/discover`, `tools/list`, `check_fact` and `observe_fact` using revision `2026-07-28`;
- CHECK-level qualified-reuse KPI semantics.

Every subsequent change must re-pass CI/E2E before being described as verified.

## Standards posture

Implemented/tracked state is centralized in `src/standards.ts`.

- MCP: `2026-07-28`, implemented and E2E tested.
- A2A: `1.0.0`, monitored but deliberately not exposed because SeenRelay is currently a tool/infrastructure service rather than a task-oriented autonomous agent.
- OpenTelemetry semantic conventions: tracked for future privacy-safe interoperability.
- OAuth Security BCP / DPoP / MCP enterprise identity directions: tracked for interoperability/security readiness.

See `docs/MAINTENANCE_AUTOPILOT.md`.

## Custody transfer

For any future administrative custody change:

1. Establish receiving provider identities first.
2. Grant receiving custody before revoking existing custody.
3. Set the receiving value as the new `ADMIN_SECRET`; temporarily place the prior value in `ADMIN_SECRET_PREVIOUS`.
4. Set the receiving value as the new `HIVE_SIGNING_SECRET`; temporarily place the prior value in `HIVE_SIGNING_SECRET_PREVIOUS`.
5. New sessions/leases are signed only with current keys; previous keys are verification/authentication-only during the grace period.
6. Run complete Preview and Production acceptance tests.
7. Remove both `*_PREVIOUS` variables after the agreed grace period and operational acceptance.
8. Do **not** rotate `PRIVACY_SALT` casually; it is continuity-sensitive and requires a versioned migration if it must ever change.

This is operational continuity documentation, not a record of any private operator strategy.

## Remaining before merge/public launch

- keep latest branch CI and full Preview E2E green after every current change;
- final privacy/security/product review;
- confirm `main` branch rules are effective;
- explicit approval to merge;
- after merge, scheduled Standards Watch becomes active because GitHub schedules execute only from the default branch;
- production smoke test on `seenrelay.com`;
- only then machine-registry/distribution launch.

## Never do silently

- add VERIFY/search/browser/LLM truth functionality;
- introduce a third domain operation;
- change fact identity or retention/privacy semantics;
- publish A2A capability that is not genuinely implemented;
- enable billing;
- merge into `main`;
- interpret observer/lease count as proof of independent actors or truth;
- put private operator plans or personal information into online project surfaces.
