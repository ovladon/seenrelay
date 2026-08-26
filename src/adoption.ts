import { machinePublicFactsText, publicInstallHtml } from './public-facts-view.js';

export function clientsPage(origin: string): string {
  const cursorInstall = 'https://cursor.com/install-mcp?name=seenrelay&config=eyJ1cmwiOiJodHRwczovL3NlZW5yZWxheS5jb20vbWNwIn0%3D';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Put SeenRelay directly around repeated paid or slow validation with deterministic zero-dependency JavaScript and Python clients, or expose CHECK and OBSERVE through MCP.">
<link rel="canonical" href="${origin}/clients">
<meta property="og:type" content="website">
<meta property="og:title" content="Connect SeenRelay to MCP clients">
<meta property="og:description" content="MCP integrations plus deterministic fail-open JavaScript and Python wrappers for existing validation workflows.">
<meta property="og:url" content="${origin}/clients">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Client integrations</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/openapi.json">OpenAPI</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">CLIENT INTEGRATIONS</div>
<h1>Put CHECK directly in the expensive call path.</h1>
<p class="lead">For repeated paid search, scraping, browser/extraction or other costly validation, the deterministic JavaScript or Python client is the recommended application path. Bind one existing validator once; later calls supply only the value already known. MCP remains available for discovery and model-selected tool routing.</p>
<div class="cta"><a class="primary" href="#install">Install SeenRelay</a><a class="secondary" href="/economics">See fleet savings</a><a class="secondary" href="${cursorInstall}">Add MCP to Cursor</a><a class="secondary" href="/quickstart">Pilot safely</a></div>
<div class="contract"><span>2 operations</span><b>check_fact</b><b>observe_fact</b><span>Observations, not universal truth</span></div>
</section>
${publicInstallHtml()}
<section class="section split decision">
<div><div class="eyebrow">DETERMINISTIC CLIENTS</div><h2>Do not depend on a model remembering to call MCP.</h2><p>The clients place a bounded SeenRelay preflight around validation your application already performs. <code>protectValidation</code> / <code>protect_validation</code> binds a fixed-fact validator once so every later revalidation becomes one protected call. Relay-side timeout, 429, malformed response, or outage fails open into the original validation path.</p><p>Shadow mode is the default. Reuse requires an explicit caller-supplied policy.</p></div>
<div class="proof-grid"><article><b>JavaScript / TypeScript</b><span><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">Zero-dependency runtime wrapper</a></span></article><article><b>Python</b><span><a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Standard-library-only wrapper</a></span></article><article><b>No local TTL cache</b><span>Only overlapping equivalent CHECKs can share one in-flight request.</span></article><article><b>Local measurement</b><span>Telemetry and caller-supplied cost estimates remain local unless the application exports them.</span></article></div>
</section>
<section class="section split">
<div><div class="eyebrow">CLAUDE CODE</div><h2>Remote Streamable HTTP.</h2><p>Anthropic documents remote HTTP MCP servers through <code>claude mcp add</code>.</p></div>
<div class="terminal"><pre>claude mcp add --transport http seenrelay \\
  ${origin}/mcp

claude mcp list</pre></div>
</section>
<section class="section split">
<div><div class="eyebrow">CURSOR</div><h2>One click or normal MCP configuration.</h2><p>Cursor documents MCP install links. The button below encodes only <code>{"url":"${origin}/mcp"}</code>; Cursor still shows its installation prompt before adding the server.</p><p><a href="${cursorInstall}">Add SeenRelay to Cursor →</a></p></div>
<div class="terminal"><pre>{
  "mcpServers": {
    "seenrelay": {
      "url": "${origin}/mcp"
    }
  }
}</pre></div>
</section>
<section class="section split">
<div><div class="eyebrow">VS CODE / COPILOT</div><h2>Remote HTTP MCP server.</h2><p>VS Code supports remote MCP servers through <code>mcp.json</code> and its documented <code>--add-mcp</code> CLI flow.</p></div>
<div class="terminal"><pre>{
  "servers": {
    "seenrelay": {
      "type": "http",
      "url": "${origin}/mcp"
    }
  }
}

code --add-mcp '{"name":"seenrelay","type":"http","url":"${origin}/mcp"}'</pre></div>
</section>
<section class="section split">
<div><div class="eyebrow">CHATGPT CUSTOM MCP APPS</div><h2>Use the same remote endpoint where your plan and workspace permit it.</h2><p>Create a custom app, provide <code>${origin}/mcp</code>, scan the tools, and review permissions before enabling it. Full MCP availability and administrative controls vary by plan and can change.</p></div>
<div class="proof-grid"><article><b>Endpoint</b><span>${origin}/mcp</span></article><article><b>Tool policy</b><span>CHECK before potentially redundant validation; OBSERVE only after independent observation.</span></article></div>
</section>
<section class="section decision">
<div class="section-head"><div><div class="eyebrow">DEPLOY SAFELY</div><h2>Start in shadow mode.</h2></div><p>Do not let SeenRelay suppress existing validation on day one. Measure what CHECK would have saved, while continuing the original workflow.</p></div>
<div class="cta"><a class="primary" href="/quickstart">Run the quickstart</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/CLIENTS.md">Full client guide</a></div>
</section>
</main>
<footer><span>SeenRelay</span><span>Observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
</body>
</html>`;
}

export function robotsText(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin: string): string {
  const urls = ['/', '/economics', '/quickstart', '/clients', '/data-practices'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function llmsText(origin: string): string {
  return `# SeenRelay

> Cost-avoidance freshness infrastructure for AI-agent fleets. Use CHECK before repeated paid or slow source-backed revalidation; use OBSERVE only after the caller independently validated the source.

SeenRelay reports recent observations, not universal truth. It does not browse, search, externally verify facts, or use an LLM as a truth arbiter.

${machinePublicFactsText(origin)}

## Use SeenRelay when

- the caller already has a known value and is about to revalidate it;
- the same exact source-backed fact repeats across runs, workers, agents, or teams;
- the validation consumes paid web search, metered scraping/proxies, browser/extraction, rate-limited API capacity, model work, or a multi-step validation chain;
- a cheap preflight can plausibly cost less than the full validation it may avoid.

## Do not use SeenRelay when

- the operation is a cheap one-off GET with little repeat probability;
- an equivalent authoritative shared cache already solves the problem;
- policy requires authoritative live source confirmation on every call and conditional confirmation provides no useful shortcut.

## Canonical interfaces

- Website: ${origin}/
- Fleet economics and current price examples: ${origin}/economics
- Quickstart: ${origin}/quickstart
- Client integrations: ${origin}/clients
- Canonical install/version/benchmark facts: ${origin}/product-facts.json
- Deterministic client source and examples: https://github.com/ovladon/seenrelay/tree/main/clients
- Shadow Proof / Economics Lab: https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md
- Machine descriptor: ${origin}/service.json
- OpenAPI: ${origin}/openapi.json
- MCP endpoint: ${origin}/mcp
- MCP Registry: io.github.ovladon/seenrelay
- Data practices: ${origin}/data-practices.json
- Public aggregate metrics: ${origin}/public-stats.json

## Operations

- CHECK / check_fact: compare a caller-known value with recent observations for the same deterministic source-backed fact; fresh evidence may also carry an observer-supplied unverified ETag or Last-Modified conditional-request hint.
- OBSERVE / observe_fact: contribute a value only after the caller independently observed it while doing its own work; later CHECKs from the same integration or fleet can benefit before any public network effect exists.

## Deterministic application integration

Use remote MCP when model/tool routing is appropriate. For application code, first install \`seenrelay\` from npm or PyPI, then bind the zero-dependency JavaScript or Python client around one existing fixed-fact validator with protectValidation / protect_validation. After binding, every later revalidation supplies only the value already known. Relay failures fail open into the application's existing validation.

## Fleet economics

First-order usage-based model:

without SeenRelay ~= N * C
with reusable evidence ~= N * (1 - r) * C
gross provider spend avoided ~= N * r * C

N = protected validations, C = marginal full-validation cost, r = measured reusable rate accepted by caller policy. Then subtract CHECK network/compute overhead and any fixed provider plan minimums.

Current provider-price snapshots and measured benchmark evidence are maintained in ${origin}/product-facts.json and ${origin}/economics. Provider prices are freshness-gated in CI; do not treat a copied historical price as current. Use Shadow Proof on the actual workload before enabling reuse or making a savings claim.

## Cost path

Use CHECK as a cheap preflight before work that is more expensive to repeat. If source confirmation is still required and CHECK supplies a conditional-request hint, try the conditional request before browser/render/extraction/model work. Conditional-request savings must be measured separately.

## Adoption policy

Start in shadow mode. Keep the existing validation policy, measure potential avoided work, and enable bounded reuse only when the consuming application's own economics and risk policy permit it.
`;
}
