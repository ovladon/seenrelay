# SeenRelay

**A cooperative freshness cache that reduces redundant validation spend across AI-agent fleets.**

Think of SeenRelay as a shared cache for **freshness evidence rather than content**. Put a cheap CHECK before repeated paid search, scraping, browser/extraction, rate-limited API or other expensive fact validation. When recent matching evidence meets caller policy, a later run or agent can avoid paying for the same validation again. If not, the existing validation runs normally and OBSERVE records the independent result for later callers.

> CHECK before repeating validation work. OBSERVE what you independently found while doing work you already needed to do.

SeenRelay has exactly two domain operations: `CHECK` and `OBSERVE`. It reports recent observations, not universal truth.

For application workflows where `CHECK` must run whenever a selected validation path executes, use the deterministic JavaScript/TypeScript or Python wrapper. MCP remains the standard discovery and model/tool-routing interface. Both paths expose the same two SeenRelay operations; the wrapper changes execution placement, not protocol semantics.

## Why connect now

SeenRelay remains useful before broad network coverage exists:

- with no prior observation, `CHECK` returns `UNKNOWN` and your existing workflow continues;
- when your agent validates the source anyway, `OBSERVE` can make that result reusable for later callers;
- later runs in the same integration or fleet can benefit from observations produced by their own normal work;
- when an observation carries an ETag or Last-Modified validator, CHECK can return it as an explicitly unverified conditional-request hint for cheaper source confirmation;
- external observations add coverage as the network grows, but they are not required for the integration to function.

Access is **currently free** and requires no account or API key.

## Start here

- Public install: `npm install seenrelay` or `pip install seenrelay`
- Fleet economics and concrete cost examples: `https://seenrelay.com/economics`
- Recommended deterministic application integration: [`clients/README.md`](clients/README.md)
- Measure your own workload before enabling reuse: [`docs/ECONOMICS_LAB.md`](docs/ECONOMICS_LAB.md)
- Integration choices and MCP setup: [`docs/CLIENTS.md`](docs/CLIENTS.md)
- Quickstart: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)
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

## Deterministic client path

The reference wrappers are the recommended path when application code must guarantee that CHECK runs before selected validation work. They put SeenRelay directly around the validation the application already performs rather than relying on a model to select the MCP tool.

MCP remains fully supported as the standard discovery and tool interface when model-selected tool routing is appropriate.

The wrappers default to shadow mode, fail open on relay-side failure, retain no completed CHECK result cache, and require an explicit caller policy before reuse can suppress validation. They do not add a SeenRelay domain operation.

The client wrappers are separately MIT licensed so applications can integrate them without changing the repository-root license that governs the hosted service implementation. Version `0.1.0` is publicly installable from both registries: `npm install seenrelay` and `pip install seenrelay`. Public-registry installation is verified in clean GitHub-hosted environments before the documentation claims availability.

`SeenRelayShadowProof` measures the consuming application's own CHECK status distribution, validation time and relay latency while keeping every original validation. Potential direct savings count only measured `SAME_OBSERVED` cases, and conditional-request savings remain excluded until the application measures them separately. See [`docs/ECONOMICS_LAB.md`](docs/ECONOMICS_LAB.md).

## One-line-per-revalidation binding

For a fixed source-backed fact, bind SeenRelay around the existing validator once. Shadow mode remains the default:

```js
const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) => existingValidation(conditionalHeaders)
});

const value = await validatePrice(knownValue);
```

Python exposes the equivalent `protect_validation(...)`. Add an explicit reuse policy only after Shadow Proof shows that the workload's measured reuse rate is above its cost/latency break-even threshold and the application's risk policy permits that reuse.

## Validator-assisted revalidation

`OBSERVE` can include source metadata such as an `etag` or `last_modified` value obtained during the caller's normal validation. When the newest usable observation carries one of those validators, a fresh `CHECK` can return it together with `source_validator_assurance: observer_supplied_unverified` and a safe `conditional_request_hint`.

That hint is an optimization, not a truth claim. If the caller's policy still requires source confirmation, it can attempt `If-None-Match` or `If-Modified-Since` before invoking a more expensive browser, extraction, API, or model pipeline. A `304 Not Modified` response is confirmation from the source, not from SeenRelay.

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
- `/service.json` exposes the explicit machine descriptor, including the deterministic-wrapper and MCP integration paths.
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
- deterministic JavaScript/TypeScript and Python client wrappers
- authenticated human-only Control Room for runtime operations and incident controls

A2A is monitored but is not advertised as an implemented product interface.

## Verification

`npm run check` performs TypeScript checks, product guardrails, production dependency auditing, structural tests, and runtime tests. The dedicated Client Wrappers workflow executes the JavaScript and Python wrapper regressions. The Preview Release Gate additionally exercises REST, MCP, fact identity, security boundaries, runtime controls, and reuse accounting against the exact Preview deployment SHA before Production promotion.

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
