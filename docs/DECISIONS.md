# Architecture Decision Record

## ADR-001 — Fact freshness, not general shared knowledge
Decision: SeenRelay stores freshness observations about structured source-backed facts.
Reason: shared knowledge/memory broadens the product unnecessarily.

## ADR-002 — Exactly two core operations
Decision: CHECK and OBSERVE.
Rejected: VERIFY, SEARCH, BROWSE, research jobs.
Reason: external verification breaks the Waze-style operating model and introduces unpredictable marginal work.

## ADR-003 — Reports observations, not truth
Decision: evidential status vocabulary only.
Reason: conservative semantics reduce overclaiming and let callers apply their own risk policy.

## ADR-004 — Fact identity v3
Decision: canonical identity excludes human-readable subject and mutable observed content. Identity is based on canonical source + source-native locator when available, otherwise canonical machine predicate, plus minimal qualifiers. Credential-bearing/signed source URLs are rejected rather than silently collapsed.
Reason: agents must converge on the same fact even when descriptions differ, while a changing value must remain the same tracked fact. False convergence is more dangerous than explicit UNKNOWN.

## ADR-005 — Vercel + Neon
Decision: managed Vercel deployment and Neon Postgres.
Reason: low operational burden, managed scaling, portability of Postgres data, rollback/deployment support and bounded-cost controls.

## ADR-006 — No outbound fact verification in application logic
Decision: guardrails and tests reject application fetch calls used to research/verify facts.
Reason: protects product identity and bounded request behavior.
Note: maintenance scripts may access official standards/dependency sources outside runtime product logic.

## ADR-007 — Billing disabled fail-closed
Decision: `PAYMENTS_ENABLED=false` and `PAYMENT_PROVIDER=none`; any incompatible configuration fails closed.
Reason: the deployed service has no billing surface and should not accidentally expose one.

## ADR-008 — MCP 2026-07-28
Decision: implement the stateless MCP `2026-07-28` core with official SDK and direct E2E tests.
Reason: stateless request/response semantics fit horizontally scaled serverless infrastructure and current ecosystem direction.

## ADR-009 — MCP/OpenAPI, not A2A unless task semantics become real
Decision: expose SeenRelay as a stateless tool through REST/OpenAPI and MCP. Track A2A releases, but do not advertise an Agent Card until a genuine A2A task interface exists.
Reason: discovery metadata must never claim an interface that is not actually implemented.

## ADR-010 — Hive Lease: accountless admission, delayed reward
Decision: use signed ephemeral operational leases and delayed useful-reuse rewards rather than conventional account authentication for bootstrap agents.
Reason: preserve low friction while limiting trivial abuse and rewarding observations only after they support a later useful CHECK.

## ADR-011 — Observer provenance is continuity, not truth
Decision: optional Ed25519 proof-of-possession binds OBSERVE payloads to a persistent key.
Reason: key possession, continuity and integrity are useful without pretending cryptographic identity proves independent real-world actors or true facts.

## ADR-012 — Human Control Room is operational, not a third product operation
Decision: maintain an authenticated human-only admin plane with live radar, circuit breakers, incident playbooks, standards posture, operational readiness and generic custody-transfer support.
Reason: safe operations and recoverability are necessary even though humans are not the primary product consumer. Admin routes are never MCP tools and do not alter the CHECK/OBSERVE domain model.

## ADR-013 — Public site is dual human/machine
Decision: `/` returns HTML only when a client explicitly requests `text/html`; generic/API requests retain machine JSON. `/service.json` and `/public-stats.json` provide explicit machine and aggregate metric surfaces.
Reason: decision makers need evidence and integration clarity without making agent discoverability worse.

## ADR-014 — Maintenance autopilot prepares, but does not blindly deploy
Decision: Dependabot and Standards Watch automatically discover and prepare upgrade work. Protocol-semantic changes are isolated and tested before explicit release approval.
Reason: “never fall behind” cannot mean allowing a third-party release to mutate production without compatibility/security review.

## ADR-015 — Build reproducibility
Decision: commit `package-lock.json` and use `npm ci` in CI.
Reason: repeatable supply-chain state improves reliability, incident response and operational transferability.

## ADR-016 — Custody transfer is an operational concern
Decision: operate managed infrastructure and documentation so administrative custody can be transferred without dependence on one workstation or one active operator session; provide a sanitized operations export and explicit transfer sequence.
Reason: recoverability and continuity improve when provider access, credentials and acceptance checks are documented generically.

## ADR-017 — Reuse independence is conservative and non-identifying
Decision: contribution rewards require different privacy-salted network-derived independence buckets; caller-controlled client labels are insufficient.
Reason: accountless admission should not allow trivial reward farming, while network separation must never be presented as proof of unique real-world actors.

## ADR-018 — Qualified reuse is a CHECK-level KPI
Decision: one CHECK counts once as qualified reuse even if it rewards multiple contributors.
Reason: public reuse rate must remain semantically interpretable and bounded to 0..1.

## ADR-019 — Private operator context stays offline
Decision: repository, site, Control Room, PR descriptions, issues and other online project surfaces contain no personal operator plans or private strategy.
Reason: operational software should be portable and reviewable without exposing private context.
