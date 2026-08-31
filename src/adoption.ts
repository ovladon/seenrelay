import { machinePublicFactsText, siteFooterHtml } from './public-facts-view.js';
import { publicProductFacts } from './public-facts.generated.js';
export { clientsPage } from './integrations.js';

export function robotsText(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin: string): string {
  const urls = ['/', '/economics', '/quickstart', '/clients', '/trust', '/data-practices'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function llmsText(origin: string): string {
  const clientVersion = publicProductFacts.install.client_version;
  return `# SeenRelay

> Avoid redundant expensive validation. JavaScript/TypeScript ${clientVersion} uses local/private reuse, source-native checks, then optional shared CHECK. OBSERVE only fresh independent source-backed results.

SeenRelay reports recent observations, not universal truth. It does not browse, search, externally verify arbitrary facts on demand, or use an LLM as a truth arbiter.

${machinePublicFactsText(origin)}

## Preferred JavaScript / TypeScript order

- exact in-flight / explicit-TTL local reuse;
- optional encrypted caller-owned private L1;
- source-native ETag / Last-Modified confirmation;
- optional shared SeenRelay CHECK;
- original validation fallback;
- OBSERVE only after fresh independent validation.

Shared CHECK is off by default in Zero-State. Completed-result TTL defaults to zero. Provider-specific adapters are optional integrations and are not dependencies of SeenRelay Core.

## Python / classic client

Python ${clientVersion} remains shadow-first. The classic JavaScript / TypeScript API also remains available for CHECK-first measurement and explicit bounded shared-evidence reuse.

## Use SeenRelay when

- a repeated read-only validation has deterministic identity and meaningful cost or latency;
- local/private/source-native reuse can avoid work before shared evidence exists;
- the same exact source-backed fact repeats across runs, workers, agents, or teams;
- the validation consumes paid search, scraping/proxies, browser/extraction, rate-limited API capacity, model work, or a multi-step chain.

## Do not use SeenRelay when

- the operation is mutating or destructive;
- it is a cheap one-off request with little repeat probability;
- an equivalent authoritative cache already solves the problem;
- policy requires brand-new live source confirmation every time and no conditional shortcut is useful.

## Canonical interfaces

- Website: ${origin}/
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
