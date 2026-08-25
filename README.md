# SeenRelay

**A cooperative freshness cache for AI agents.**

Think of SeenRelay as a shared cache for **freshness evidence rather than content**. A normal cache lets a later request avoid fetching the same bytes again. SeenRelay lets a later agent avoid repeating the same fact validation when another agent has already observed that exact source-backed fact recently.

> CHECK before repeating validation work. OBSERVE what you independently found while doing work you already needed to do.

SeenRelay has exactly two domain operations: `CHECK` and `OBSERVE`. It reports recent observations, not universal truth.

## Why connect now

SeenRelay remains useful before broad network coverage exists:

- with no prior observation, `CHECK` returns `UNKNOWN` and your existing workflow continues;
- when your agent validates the source anyway, `OBSERVE` can make that result reusable for later callers;
- multiple agents or workers in the same fleet can benefit from observations produced by their own normal work;
- external observations add coverage as the network grows, but they are not required for the integration to function.

Access is **currently free** and requires no account or API key.

## Start here

- Quickstart: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)
- MCP client setup: [`docs/CLIENTS.md`](docs/CLIENTS.md)
- Protocol contract: [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- Web quickstart: `https://seenrelay.com/quickstart`
- Web client integrations: `https://seenrelay.com/clients`
- MCP endpoint: `https://seenrelay.com/mcp`
- Official MCP Registry: `io.github.ovladon/seenrelay`
- OpenAPI: `https://seenrelay.com/openapi.json`
- Machine descriptor: `https://seenrelay.com/service.json`
- Machine-oriented index: `https://seenrelay.com/llms.txt`

## How it works

1. An agent is about to validate a structured source-backed fact.
2. It sends `CHECK` with the fact identity and the value it already knows.
3. SeenRelay returns recent observation status for that exact fact.
4. If policy still requires validation, the agent performs its normal source check.
5. It sends `OBSERVE` with the independently obtained result so later callers can reuse the freshness evidence.

Possible statuses are `SAME_OBSERVED`, `CHANGED_OBSERVED`, `CONTESTED`, `STALE`, and `UNKNOWN`.

`SAME_OBSERVED` means the same value was recently observed for the same deterministic fact identity. It is not a truth verdict. The consuming agent decides whether the evidence is sufficient for its own policy.

## Fact identity

SeenRelay uses the versioned `seenrelay-fact-v3` identity contract. Identity precedence is:

1. stable source-native locator (`json_pointer`, `element_id`, `source_key`);
2. canonical machine predicate when no stable locator exists.

Human-readable `subject` text and mutable observed content do not enter the fact key. Source URLs are canonicalized deterministically without browsing. Credential- or signature-bearing source URLs are rejected before stateful admission.

See [`docs/PROTOCOL.md`](docs/PROTOCOL.md) for the complete contract.

## Observer provenance

`OBSERVE` supports optional transport-independent `ed25519-v1` proof-of-possession. A valid proof establishes key possession, continuity, and payload integrity. It does not establish legal identity, independent real-world actor identity, or truth.

## Access and contribution

SeenRelay issues signed ephemeral operational leases without account creation. `CHECK` and `OBSERVE` are currently free to use. Contribution credit is based on later qualifying reuse rather than raw submission volume.

Hive classes describe operational contribution only; they are not identity or truth scores.

## Public interfaces

The canonical domain is `seenrelay.com`.

- Browser `Accept: text/html` at `/` receives the public landing page.
- Generic/API requests to `/` receive the machine descriptor.
- `/service.json` exposes the explicit machine descriptor.
- `/public-stats.json` exposes privacy-safe aggregate activity.
- `/openapi.json` exposes the REST contract.
- `/mcp` exposes MCP `2026-07-28`.
- `/quickstart` and `/clients` provide integration instructions.

## Product boundary

SeenRelay itself does not browse or search fact sources, perform on-demand verification, call an LLM to decide truth, or expose a shared general-agent memory. `UNKNOWN` simply means no sufficiently recent reusable observation is available.

## Architecture

- Vercel managed deployment
- Neon Postgres state store
- Hono + TypeScript / Node 22
- REST/OpenAPI
- MCP `2026-07-28` through the official v2 server SDK
- authenticated human-only Control Room for runtime operations and incident controls

A2A is monitored but is not advertised as an implemented product interface.

## Verification

`npm run check` performs TypeScript checks, product guardrails, production dependency auditing, structural tests, and runtime tests. The Preview Release Gate additionally exercises REST, MCP, fact identity, security boundaries, runtime controls, and reuse accounting against the exact Preview deployment SHA before Production promotion.

Builds use the committed lockfile and `npm ci`.

## Maintenance

Dependabot and Standards Watch prepare isolated maintenance work. Production changes remain subject to compatibility, security, CI, and Preview verification gates.

## Bootstrap

```bash
npm ci
npm run check
npm run db:migrate
```

Deployment details are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
