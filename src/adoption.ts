import { machinePublicFactsText } from './public-facts-view.js';
import { publicProductFacts } from './public-facts.generated.js';
export { clientsPage } from './integrations.js';

export function robotsText(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin: string): string {
  const urls = ['/', '/fleet', '/economics', '/quickstart', '/clients', '/trust', '/data-practices'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function llmsText(origin: string): string {
  const clientVersion = publicProductFacts.install.client_version;
  return `# SeenRelay

SeenRelay is a provider-independent validation reuse layer for agent fleets and applications that repeatedly perform expensive read-only validation. SeenRelay is a reuse layer for repeated read-only validation: it puts caller-owned local/private reuse and stronger source-native confirmation ahead of optional shared evidence; when no eligible cheaper path is sufficient, the original validation runs normally.

The strongest current product fit is a fleet of workers or agents that repeatedly validates the same deterministic state while browser sessions, scraping/extraction, model work, paid search, rate-limited capacity or multi-step validation is materially expensive. SeenRelay should stay out of cheap one-off paths and paths already solved by an equivalent authoritative cache.

SeenRelay reports recent observations, not universal truth. It does not browse, search, externally verify arbitrary facts on demand, or use an LLM as a truth arbiter.

## First proof: measure without changing application behavior

JavaScript / TypeScript ${clientVersion}:

\`npm install seenrelay\`

\`import { ambientMcpClient } from 'seenrelay/ambient';\`
\`const client = ambientMcpClient(rawMcpClient);\`
\`console.log(client.seenRelayAmbient.getReport());\`

Python ${clientVersion}:

\`pip install seenrelay\`

\`from seenrelay_ambient import ambient_mcp_client\`
\`client = ambient_mcp_client(raw_mcp_client)\`
\`print(client.get_report())\`

Both Ambient entry points are shadow-first: run the existing workload normally and inspect the local report before enabling bounded reuse.

${machinePublicFactsText(origin)}

## Add SeenRelay to Cursor or another Agent Skills client

Install the published SeenRelay skill directly from the canonical domain:

\`npx skills add ${origin} --skill seenrelay --yes\`

For a fleet, ask the coding agent to find repeated expensive read-only validations across workers, start in shadow mode, preserve the authoritative call and stronger native controls, and evaluate caller-owned encrypted private L1 before optional shared CHECK when the workers already share an appropriate store.

## Fleet path

JavaScript / TypeScript private L1 is caller-owned storage for exact completed-result state across workers or process restarts. The store receives an opaque SHA-256 coordinate key and a sealed payload; the encryption key stays in the caller's secret-management boundary. This is not a claim that the public SeenRelay relay is a hosted private tenant store.

A positive \`privateMaxAgeMs\` is an explicit caller freshness decision. With \`privateMaxAgeMs = 0\`, a private result does not suppress source validation, while retained ETag/Last-Modified state can still support conditional source confirmation.

See ${origin}/fleet for the current deployment pattern.

## Preferred JavaScript / TypeScript order

- exact in-flight / explicit-TTL local reuse;
- optional encrypted caller-owned private L1 across workers/restarts;
- source-native ETag / Last-Modified confirmation or a stronger authoritative mechanism;
- optional shared SeenRelay CHECK when share policy permits and it adds value;
- original validation fallback;
- OBSERVE only after fresh independent validation.

For an existing MCP client, start with \`seenrelay/ambient\` for behavior-preserving measurement. After an eligible read-only tool is reviewed, \`seenrelay/mcp-auto\` provides the local-first bind-once protection path.

Shared CHECK is off by default in Zero-State. Completed-result TTL defaults to zero. Provider-specific adapters are optional integrations and are not dependencies of SeenRelay Core.

## Python / classic client

Python ${clientVersion} remains shadow-first. The classic JavaScript / TypeScript API also remains available for CHECK-first measurement and explicit bounded shared-evidence reuse.

## Use SeenRelay when

- a repeated read-only validation has deterministic identity and meaningful cost or latency;
- the same exact source-backed state repeats across runs, workers, agents or services;
- local/private/source-native reuse can avoid work before shared evidence exists;
- the validation consumes browser/proxy work, metered scraping or extraction, model work, paid search, rate-limited API capacity or a multi-step chain;
- the application can preserve the authoritative fallback and define an explicit freshness policy.

## Do not use SeenRelay when

- the operation is mutating or destructive;
- it is a cheap one-off request with little repeat probability;
- an equivalent authoritative cache or source-native validator already answers the same user-relevant question more cheaply;
- policy requires brand-new live source confirmation every time and no conditional shortcut is useful.

## Canonical interfaces

- Website: ${origin}/
- Fleet deployment: ${origin}/fleet
- Quickstart: ${origin}/quickstart
- Client integrations: ${origin}/clients
- Economics and measured examples: ${origin}/economics
- Product facts: ${origin}/product-facts.json
- Client source: https://github.com/ovladon/seenrelay/tree/main/clients
- Machine descriptor: ${origin}/service.json
- OpenAPI: ${origin}/openapi.json
- MCP endpoint: ${origin}/mcp
- Agent Skill index: ${origin}/.well-known/agent-skills/index.json
- Agent Skill: ${origin}/.well-known/agent-skills/seenrelay/SKILL.md
- Legacy Agent Skill discovery fallback: ${origin}/.well-known/skills/index.json
- MCP Registry: io.github.ovladon/seenrelay
- Trust: ${origin}/trust
- Data practices: ${origin}/data-practices.json
- Public aggregate metrics: ${origin}/public-stats.json

## Hosted operations

- CHECK / check_fact: compare a caller-known value with recent observations for the same deterministic source-backed fact.
- OBSERVE / observe_fact: contribute a value only after the caller independently observed it while doing its own work.

The hosted service has no third domain operation. Intermediary cache reuse must not be re-labeled as a fresh independent OBSERVE.
`;
}
