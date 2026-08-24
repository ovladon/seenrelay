# SeenRelay Maintenance Autopilot

## Goal

SeenRelay should remain current without turning production into an unattended experiment. The maintenance model is therefore:

`discover -> isolate -> implement candidate -> verify -> explicit release`

The system automates the first four steps wherever that is safe. Production release remains subject to branch protection and an explicit owner-approved merge.

## What is watched

### Protocols and interoperability

- Model Context Protocol specification and official server SDK.
- Agent2Agent (A2A) stable releases.
- OpenTelemetry semantic conventions and the GenAI semantic-conventions project.
- MCP roadmap items that materially affect agent identity, authorization, delegation, transport or discoverability.

### Security standards

Current security posture tracks at minimum:

- OAuth 2.0 Security Best Current Practice — RFC 9700.
- Demonstrating Proof of Possession (DPoP) — RFC 9449.
- MCP enterprise authorization/agent-identity direction, including workload identity federation and delegated authority.

Tracking a standard does not mean implementing it before it is useful. It means SeenRelay has an explicit place to notice when the surrounding ecosystem changes.

## Automated mechanisms

### Dependency autopilot

`.github/dependabot.yml` creates isolated dependency and GitHub Actions upgrade pull requests. Safe minor/patch updates are grouped. Major changes remain conspicuous.

Every candidate must pass SeenRelay's existing verification gates, including full TypeScript checking, product guardrails, dependency audit, runtime tests and Preview E2E.

### Standards watch

`.github/workflows/standards-watch.yml` runs daily and can also be invoked manually. It reads official sources and compares them to `src/standards.ts`.

When drift appears it creates or updates one dedicated GitHub issue. When alignment is restored, it closes that issue.

A standards drift issue is not an instruction to adopt blindly. It is a trigger to evaluate:

1. Is the new release stable?
2. Does it affect SeenRelay's actual role?
3. Is backward compatibility required?
4. Does it weaken privacy, security, latency or unit economics?
5. Does it introduce a third domain operation or violate the no-browse/no-truth-oracle boundary?
6. Can it be verified in Preview against real clients before production?

## Upgrade classes

### Class A — routine maintenance

Examples: patched libraries, non-breaking runtime fixes, GitHub Action updates.

Expected path: automated PR -> CI/E2E -> owner-approved merge.

### Class B — interoperability upgrade

Examples: new stable MCP revision, new OpenAPI behavior, observability conventions.

Expected path: standards issue -> compatibility design -> isolated implementation -> old/new interoperability tests when needed -> owner-approved merge.

### Class C — security/identity upgrade

Examples: DPoP, workload identity federation, delegated authorization, enterprise-managed authorization.

Expected path: threat-model review -> protocol design -> isolated implementation -> negative security tests -> staged rollout. No automatic production activation.

### Class D — product-shape proposal

Examples: A2A task interface, a new externally visible operation, semantic matching, external browsing.

These are never treated as maintenance. They require explicit product reconsideration because they can change what SeenRelay is.

## A2A posture

A2A 1.0 is actively tracked, but SeenRelay does not currently publish an Agent Card. SeenRelay is a tool/infrastructure service with CHECK and OBSERVE, not a task-oriented autonomous agent. Publishing A2A metadata without a genuine A2A task interface would misrepresent capabilities.

If a future use case genuinely requires A2A, implementation should be added only after the task semantics are real and the existing MCP/OpenAPI surfaces remain coherent.

## Observability posture

OpenTelemetry adoption should improve interoperability without exporting sensitive fact values, source URLs, observer identifiers, raw keys, lease tokens or customer payloads by default. High-cardinality or provenance-sensitive fields remain opt-in or are excluded.

## Non-negotiable release gates

No maintenance automation may:

- merge directly to `main` without explicit approval;
- enable payments;
- weaken Deployment Protection or branch protection;
- add outbound fact verification;
- add an LLM truth decision;
- silently change the fact-identity contract;
- silently change retention/privacy semantics;
- publish A2A or another protocol surface that is not genuinely implemented.

The intended property is not “SeenRelay automatically accepts everything new.” It is “SeenRelay automatically notices, prepares and proves upgrades quickly enough that it does not become stale.”
