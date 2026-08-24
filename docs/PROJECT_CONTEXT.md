# Project Context

## Core concept

SeenRelay is described as **Waze for AI agents**, specifically for reusable freshness observations about source-backed facts.

Agents already access sources for their own work. SeenRelay reuses the resulting incidental observations so another agent can avoid or prioritize an otherwise redundant revalidation.

Economic primitive:

`one necessary observation -> many opportunities for cheaper reuse`

“Avoided revalidation” is a downstream interpretation. The directly observable network event is **qualified cross-bucket useful reuse**.

## Product boundary

Only two fundamental domain operations exist:

- CHECK
- OBSERVE

The running service itself never browses, searches or independently verifies a source and does not use an LLM to decide truth.

Human admin routes, public metrics and maintenance automation are operational/supporting surfaces, not new domain operations.

## Observation semantics

SeenRelay answers what has recently been observed for a deterministic source-backed fact. It does not certify universal truth.

Statuses are deliberately evidential:

- SAME_OBSERVED
- CHANGED_OBSERVED
- CONTESTED
- STALE
- UNKNOWN

## Fact identity

Current contract: `seenrelay-fact-v3`.

Identity uses canonical source + source-native locator when available; otherwise a shared machine predicate; minimal qualifiers remain identity-bearing. Human-readable subject and mutable observed content are excluded from the fact key.

Credential-bearing and signed source URLs are rejected before Hive admission. Known tracking parameters can be removed deterministically; semantically meaningful query parameters remain identity-bearing.

False convergence is considered more dangerous than an explicit `UNKNOWN`.

## Network effect

Consumer and contributor should converge. An agent checks freshness cheaply. When it independently observes a source anyway, it can leave that observation for others.

The intended flywheel is:

`more agent traffic -> more incidental observations -> more qualified useful reuse -> stronger reason to CHECK first -> more opportunities to contribute`

This is a hypothesis until external traffic demonstrates it. Raw request count does not validate the hypothesis.

## Contribution economics

- CHECK is currently free under a Hive token bucket.
- OBSERVE is free.
- OBSERVE itself earns no contribution score.
- contribution increases only after a later useful CHECK crosses a different conservative privacy-salted reuse-independence bucket;
- changing only a self-declared client label does not establish reward independence;
- repeated reward farming is suppressed and capped;
- a CHECK that rewards multiple contributors still counts once in the public qualified-reuse KPI.

Contribution score is an access/economic mechanism, not a truth/reputation score. Reuse-independence is an anti-farming signal, not proof of independent real-world actors.

## Current infrastructure

- canonical domain: `seenrelay.com`;
- Vercel Pro for managed hosting/deployment/protection;
- Neon Postgres for persistent state;
- Hono + TypeScript/Node 22;
- REST/OpenAPI;
- MCP `2026-07-28` using the official v2 server SDK;
- authenticated Control Room with live Hive Radar and incident controls.

`main` is deliberately not merged until explicit approval and all release gates pass.

## Environment integrity

Preview/CI and Production use different writable Neon branches. Reserved E2E namespaces are rejected in Production before Hive admission. Synthetic Preview activity must never be represented as traction.

Before the first production release, historical synthetic state in Neon main was reset to zero while preserving the global runtime-control row.

## Public surface

The service supports both primary audiences without compromising machine ergonomics:

- browsers requesting HTML receive an evidence-led landing page for agent builders and decision makers;
- machine/API requests retain a structured descriptor;
- privacy-safe aggregate stats expose actual network activity;
- qualified reuse is measured as a CHECK-level event and remains bounded to 0..100%;
- no fabricated customer, savings or validation claims are permitted.

## Maintenance posture

SeenRelay must not become protocol-stale. It therefore uses:

- Dependabot for isolated dependency/action upgrade PRs;
- a Standards Watch workflow for official MCP/A2A/OpenTelemetry drift;
- explicit tracked standards in `src/standards.ts`;
- compatibility/security/E2E gates before release.

Automation prepares upgrades; it does not blindly mutate production.

## Operational continuity

Infrastructure, documentation and the Control Room are designed so administrative custody can be transferred without runtime dependency on one workstation or one operator session. Rotatable credentials support make-before-break transition. `PRIVACY_SALT` remains continuity-sensitive and is not treated as an ordinary password.

## Billing state

Billing is disabled in this deployment:

```text
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=none
```

No private operator strategy belongs in repository, site, Control Room, PR descriptions, issues or other online project surfaces.
