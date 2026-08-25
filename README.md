# SeenRelay

**Reusable information gain for AI agents.**

Working analogy: Waze does not send a special car to inspect every road. Drivers already travel, their observations update shared traffic state, and the next driver avoids rediscovering the same conditions. SeenRelay applies that pattern to **source-backed facts** used by AI agents.

> Before re-checking a fact, ask whether another agent has observed it recently. If you independently check the source anyway, leave the observation for the next agent.

## Start here

- Human integration guide: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)
- Web quickstart: `https://seenrelay.com/quickstart`
- MCP remote endpoint: `https://seenrelay.com/mcp`
- MCP Registry identifier: `io.github.ovladon/seenrelay`
- REST/OpenAPI contract: `https://seenrelay.com/openapi.json`
- Machine descriptor: `https://seenrelay.com/service.json`

The recommended first deployment is **shadow mode**: CHECK before existing revalidation, but initially skip nothing. Measure what SeenRelay would have saved before allowing bounded reuse.

## Two operations only

- `CHECK` — compare a value an agent already knows with recent observations for the same deterministic source-backed fact.
- `OBSERVE` — contribute a value the caller independently observed while doing its own work.

Statuses: `SAME_OBSERVED`, `CHANGED_OBSERVED`, `CONTESTED`, `STALE`, `UNKNOWN`.

SeenRelay reports **observations**, not universal truth.

## Fact identity v3

SeenRelay uses the versioned `seenrelay-fact-v3` identity contract and never uses an LLM/fuzzy matcher to decide that two facts are identical.

Identity precedence is:

1. stable source-native locator (`json_pointer`, `element_id`, `source_key`);
2. canonical machine predicate when no locator exists.

Human-readable `subject` text never enters the fact key. **Mutable observed content never enters the fact key.** Source URLs are canonicalized without browsing: fragments are removed, host/default ports normalized, credential/signature-bearing URLs are rejected, known tracking parameters are removed, and remaining query parameters are sorted deterministically.

See `docs/PROTOCOL.md` for the exact contract.

## Observer provenance

`OBSERVE` supports optional transport-independent `ed25519-v1` proof-of-possession.

A valid proof establishes key possession, continuity, and payload integrity. It does **not** prove that one key equals one independent person/organization/device/agent and does not solve global Sybil identity. SeenRelay therefore separates cryptographic and unverified observer-key counts.

## Hive Lease: no account, delayed reward

Every caller can receive a signed ephemeral **Hive Lease** without account creation, login, email, or OAuth.

During bootstrap:

- CHECK is free with a generous token bucket;
- OBSERVE is free;
- raw OBSERVE earns no score;
- contribution score rises only when a later useful CHECK is supported by that observation and the consumer belongs to a different conservative privacy-salted network-independence bucket;
- changing only a self-declared client label does not create reward independence;
- repeated reward for the same fact/value/contributor/consumer tuple is suppressed;
- useful contributors receive more CHECK capacity/refill.

Hive classes (`new`, `established`, `contributor`) describe operational contribution only, not real-world identity or truth.

## Public surface

The canonical domain is `seenrelay.com`.

- Browser `Accept: text/html` at `/` gets a decision-maker/agent landing page with live aggregate metrics.
- `/quickstart` gives decision makers and implementers the shortest safe adoption path.
- Generic/API requests to `/` retain the machine-readable service descriptor.
- `/service.json` exposes the stable machine descriptor explicitly.
- `/public-stats.json` exposes privacy-safe aggregate network metrics.
- `/openapi.json` exposes the REST contract.
- `/mcp` exposes MCP `2026-07-28`.

The site is designed to show measured network utility, not synthetic growth claims.

## It deliberately does not

- browse or search the web;
- verify facts on demand;
- run an LLM to decide truth;
- become a general knowledge graph;
- act as shared agent memory;
- call external research services;
- claim that an observation is certified truth.

If SeenRelay returns `UNKNOWN`, the caller continues exactly as it would have without SeenRelay. If the caller then independently observes the source, it may call `OBSERVE`.

## Architecture

- **Vercel + Fluid Compute** — managed deployment, TLS, scaling, logs, firewall/spend controls and rollback.
- **Neon Postgres** — facts, recent observations, Hive Lease state, useful-reuse events and aggregate telemetry.
- **Hono + TypeScript / Node 22** — compact Web-standards API.
- **REST/OpenAPI** — core protocol surface.
- **MCP `2026-07-28`** — stateless tool access with the same CHECK/OBSERVE semantics.
- **Control Room** — authenticated human administration, live Hive Radar, incident playbooks, standards posture, operational readiness and custody-transfer support.

A2A `1.0.0` is monitored but intentionally **not exposed**. SeenRelay is currently a tool/infrastructure service, not a task-oriented autonomous agent; publishing an Agent Card without genuine A2A task semantics would be misleading.

## Discovery and distribution

`registry/server.json` is the canonical MCP Registry manifest for `io.github.ovladon/seenrelay` and points remote clients to `https://seenrelay.com/mcp`.

The repository includes a GitHub OIDC publishing workflow for the Official MCP Registry. It pins the publisher binary and verifies its SHA-256 before execution; no persistent Registry credential is stored in the repository.

## Verification gates

`npm run check` performs:

- core and full TypeScript typechecking under Node ESM rules;
- product guardrails, including no outbound fact-research fetch and billing-disabled fail-closed behavior;
- production dependency audit at high/critical severity;
- structural tests;
- runtime identity/security/economics tests.

GitHub Preview E2E additionally exercises:

- REST CHECK/OBSERVE lifecycle;
- qualified useful-reuse economics and conservative anti-farming behavior;
- idempotency isolation;
- CONTESTED and STALE semantics;
- fact-v3 locator convergence;
- credential-bearing source rejection before Hive admission;
- admin/billing boundaries;
- MCP `server/discover`, `tools/list`, `check_fact` and `observe_fact` on revision `2026-07-28`;
- KPI semantics: multiple contributor awards from one CHECK count as one qualified-reuse CHECK.

Builds are reproducible with committed `package-lock.json` and `npm ci`.

## Maintenance autopilot

SeenRelay is designed to notice ecosystem changes without allowing unattended production mutation.

- Dependabot prepares isolated dependency/GitHub Actions upgrade PRs.
- `Standards Watch` runs daily against official MCP, A2A and OpenTelemetry sources.
- Standards drift creates/updates a GitHub issue.
- Protocol-semantic changes require an isolated compatibility candidate and the full verification gates.
- `main` is never auto-merged without explicit approval.

See `docs/MAINTENANCE_AUTOPILOT.md`.

## Billing state

Billing is not available in this deployment:

```text
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=none
```

Any attempt to enable billing fails closed before normal request handling.

## Project context

Before modifying product scope, read:

1. `docs/PROJECT_CONTEXT.md`
2. `docs/DECISIONS.md`
3. `docs/WHY_NOT.md`
4. `docs/PROTOCOL.md`
5. `docs/MAINTENANCE_AUTOPILOT.md`
6. `docs/HANDOFF.md`

## Bootstrap

Once the managed database is linked:

```bash
npm ci
npm run check
npm run db:migrate
```

Deployment details are in `docs/DEPLOYMENT.md`.
