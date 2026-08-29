# SeenRelay

<!-- BEGIN GENERATED:PUBLIC-FACTS -->
**Install:** `npm install seenrelay` · `pip install seenrelay` · client v0.2.3 · currently free · no account/API key.

**Measured first-party smoke result:** Firecrawl JSON extraction, n=3: 3/3 eligible provider calls avoided, 15 credits avoided, median 1265.68 ms fresh / 1039.5 ms provider-cached → 617.78 ms SeenRelay bounded reuse. This is a small first-party benchmark, not a promised reuse rate.
<!-- END GENERATED:PUBLIC-FACTS -->

**Avoid redundant expensive validation.**

Reuse eligible read-only validation locally or privately, use source-native checks when available, and consult shared SeenRelay evidence only when useful. The application's original validation remains the fallback.

> Reuse first. CHECK when useful. OBSERVE only fresh independent validation.

SeenRelay has exactly two domain operations: `CHECK` and `OBSERVE`. It reports recent observations, not universal truth.

JavaScript/TypeScript 0.2.3 is local-first. Python 0.2.3 and the classic JavaScript/TypeScript client remain shadow-first. Provider-specific adapters are optional.

## What it can avoid

Even with no shared observation:

- simultaneous identical eligible calls can be coalesced in-process;
- completed read-only results can be reused only inside an explicit caller-defined freshness window;
- optional encrypted caller-owned L1 storage can reuse values across workers or restarts;
- ETag / Last-Modified can support source-native conditional confirmation without a shared CHECK;
- shared CHECK is optional in Zero-State and is not placed on the hot path merely because SeenRelay is installed;
- after a genuinely fresh independent validation, OBSERVE can add evidence that may help later callers.

Access is **currently free** and requires no account or API key.

## Start here

- Public install: `npm install seenrelay` or `pip install seenrelay`
- JavaScript / TypeScript Zero-State: [`clients/typescript/README.md`](clients/typescript/README.md)
- Fleet economics and measured examples: `https://seenrelay.com/economics`
- Client overview: [`clients/README.md`](clients/README.md)
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

For eligible JavaScript/TypeScript Zero-State calls, the preferred order is:

1. exact in-process reuse / coalescing when safe;
2. optional caller-owned private reuse;
3. source-native conditional confirmation when available;
4. optional shared SeenRelay CHECK when configured and useful;
5. the application's original validation as fallback;
6. OBSERVE only after a fresh independent validation that is eligible for contribution.

For direct REST/MCP or the classic wrapper, CHECK and OBSERVE remain available exactly as before.

Possible CHECK statuses are `SAME_OBSERVED`, `CHANGED_OBSERVED`, `CONTESTED`, `STALE`, and `UNKNOWN`.

`SAME_OBSERVED` means the same value was recently observed for the same deterministic fact identity. It is not a truth verdict. The consuming agent decides whether the evidence is sufficient for its own policy.

## JavaScript / TypeScript Zero-State

```js
import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  localMaxAgeMs: 30_000
});

const result = await edge.guard({
  coordinate: {
    tool: 'catalog.read',
    arguments: { id: 42 }
  },
  validate: async () => expensiveRead()
});

console.log(result.value);
```

The default completed-result freshness window is `0`. SeenRelay does not invent a TTL for arbitrary calls. Mutation/destructive operations must not be suppressed; generic core does not infer read-only safety from tool names, descriptions or untrusted annotations.

For MCP clients, `seenrelay/mcp-auto` can bind once around explicitly allowlisted `callTool()` operations. Unlisted tools pass through unchanged.

## Classic shadow-first path

The original JavaScript/TypeScript and Python APIs remain available. Without an explicit reuse policy they CHECK, keep the original validation, and OBSERVE the independently obtained result best-effort.

```js
const relay = new SeenRelayClient();

const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) => existingValidation(conditionalHeaders)
});

const value = await validatePrice(knownValue);
```

Python exposes the equivalent `protect_validation(...)` path. Use Shadow Proof when you specifically want to measure public CHECK evidence before enabling classic bounded reuse.

## Source-native revalidation

Source-native validators are preferable to guessing freshness. When a retained response carries a safe ETag or Last-Modified validator, a later eligible validation can try `If-None-Match` or `If-Modified-Since`. A `304 Not Modified` response is confirmation from the source, not from SeenRelay.

The classic CHECK/OBSERVE path can also carry observer-supplied ETag / Last-Modified metadata as an explicitly unverified conditional-request hint. The caller still decides whether source confirmation is required.

## Optional private L1

JavaScript/TypeScript Zero-State can use a caller-supplied private store plus codec for reuse across workers or restarts. SeenRelay provides an AES-256-GCM codec helper; the caller owns the key, storage and namespace.

Private values are not sent to the public SeenRelay service merely because private L1 is enabled. Store or codec failure fails open into the application's normal validation path.

## Fact identity

SeenRelay uses the versioned `seenrelay-fact-v3` identity contract. Identity precedence is:

1. stable source-native locator (`json_pointer`, `element_id`, `source_key`);
2. canonical machine predicate when no stable locator exists.

Human-readable `subject` text and mutable observed content do not enter the fact key. Source URLs are canonicalized deterministically without browsing. Credential- or signature-bearing source URLs are rejected before stateful admission.

See [`docs/PROTOCOL.md`](docs/PROTOCOL.md) for the complete contract.

## Observer provenance

`OBSERVE` supports optional transport-independent `ed25519-v1` proof-of-possession. A valid proof establishes key possession, continuity, and payload integrity. It does not establish legal identity, independent real-world actor identity, or truth.

An intermediary provider-cache hit is not re-labeled as a new independent OBSERVE merely because a different caller received it.

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

SeenRelay itself does not browse or search fact sources, perform on-demand external verification, call an LLM to decide truth, or expose a shared general-agent memory. `UNKNOWN` simply means no sufficiently recent reusable shared observation is available.

Client-side adapters can use source-native validation or integrate with existing providers, but provider adapters are optional and cannot become dependencies of the provider-independent core.

## Architecture

- Vercel managed deployment
- Neon Postgres state store
- Hono + TypeScript / Node 22
- REST/OpenAPI
- MCP `2026-07-28` through the official v2 server SDK
- provider-independent JavaScript/TypeScript Zero-State client plus classic JavaScript/TypeScript and Python wrappers
- authenticated human-only Control Room for runtime operations and incident controls

A2A is monitored but is not advertised as an implemented product interface.

## Verification

`npm run check` performs TypeScript checks, product guardrails, production dependency auditing, structural tests, and runtime tests. Package Validation clean-installs built npm/PyPI artifacts. The Preview Release Gate additionally exercises REST, MCP, fact identity, security boundaries, runtime controls, and reuse accounting against the exact Preview deployment SHA before Production promotion.

Builds use the committed lockfile and `npm ci`.

## Maintenance

Dependabot and Standards Watch prepare isolated maintenance work. Production changes remain subject to compatibility, security, CI, and Preview verification gates.

## Bootstrap

```bash
npm ci
npm run check
# DATABASE_ADMIN_URL must be set only for this migration command
npm run db:migrate
```

Deployment details are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
