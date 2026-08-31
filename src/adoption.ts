import { machinePublicFactsText, publicInstallHtml, siteFooterHtml } from './public-facts-view.js';

export function clientsPage(origin: string): string {
  const cursorInstall = 'https://cursor.com/install-mcp?name=seenrelay&config=eyJ1cmwiOiJodHRwczovL3NlZW5yZWxheS5jb20vbWNwIn0%3D';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="JavaScript/TypeScript local-first. Python shadow-first. CHECK/OBSERVE over MCP or REST.">
<link rel="canonical" href="${origin}/clients">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay client integrations">
<meta property="og:description" content="JavaScript/TypeScript local-first. Python shadow-first. CHECK/OBSERVE over MCP or REST.">
<meta property="og:url" content="${origin}/clients">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Client integrations</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/openapi.json">OpenAPI</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">CLIENT 0.2.1</div>
<h1>Choose how to integrate SeenRelay.</h1>
<p class="lead">JavaScript/TypeScript: local-first Zero-State. Python: shadow-first. MCP/REST: hosted CHECK/OBSERVE.</p>
<div class="cta"><a class="primary" href="#install">Install SeenRelay</a><a class="secondary" href="/quickstart">Quickstart</a><a class="secondary" href="${cursorInstall}">Add MCP to Cursor</a><a class="secondary" href="/economics">Measured savings</a></div>
<div class="contract"><span>Exactly 2 hosted operations</span><b>CHECK</b><b>OBSERVE</b><span>Provider-independent core · no truth verdict</span></div>
</section>
${publicInstallHtml()}

<section class="section split decision">
<div><div class="eyebrow">JAVASCRIPT / TYPESCRIPT ZERO-STATE</div><h2>Works without shared observations.</h2><p>Eligible read-only calls can use in-flight coalescing, explicit-TTL local reuse, optional encrypted caller-owned L1 and source-native ETag / Last-Modified confirmation. Shared CHECK is off by default and remains an optional accelerator.</p><p>The original validation remains the fallback. Fresh independent validations may contribute OBSERVE evidence; intermediary cache reuse does not become a new independent observation.</p></div>
<div class="proof-grid"><article><b>L0</b><span>Exact in-process reuse and concurrent-call coalescing.</span></article><article><b>L1</b><span>Optional caller-owned encrypted private reuse across workers/restarts.</span></article><article><b>Source native</b><span>ETag / Last-Modified can confirm unchanged content directly.</span></article><article><b>L2 optional</b><span>Shared SeenRelay evidence only where it can add value.</span></article></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">MCP AUTO</div><h2>Protect only explicitly allowlisted tools.</h2><p><code>seenrelay/mcp-auto</code> wraps <code>callTool()</code> for explicitly allowlisted operations. Unlisted tools pass through unchanged. The generic core never decides that a tool is read-only from its name, description or an untrusted hint.</p></div>
<div class="terminal"><pre>import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(rawMcpClient, {
  serverKey: 'catalog-server',
  tools: {
    'catalog.read': { maxAgeMs: 30_000 }
  }
});</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">CLASSIC CLIENTS</div><h2>Classic clients remain shadow-first.</h2><p>The classic JavaScript/TypeScript and Python APIs continue to CHECK a known fact, perform the original validation unless explicit caller policy permits reuse, and OBSERVE the independently obtained result best-effort.</p><p>Python behavior remains shadow-first in 0.2.1.</p></div>
<div class="proof-grid"><article><b>JavaScript / TypeScript</b><span><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">Zero-State plus classic APIs</a></span></article><article><b>Python</b><span><a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Classic shadow-first API</a></span></article><article><b>Shadow Proof</b><span>Measure public CHECK evidence without suppressing validation.</span></article><article><b>Fail open</b><span>Relay/store failures return to the existing validation path.</span></article></div>
</section>

<section class="section split">
<div><div class="eyebrow">CLAUDE CODE</div><h2>Remote MCP over HTTP.</h2><p>Anthropic documents remote HTTP MCP servers through <code>claude mcp add</code>.</p></div>
<div class="terminal"><pre>claude mcp add --transport http seenrelay \
  ${origin}/mcp

claude mcp list</pre></div>
</section>

<section class="section split">
<div><div class="eyebrow">CURSOR</div><h2>One-click MCP install.</h2><p>The install link encodes only the SeenRelay remote MCP URL. Cursor still shows its installation prompt.</p><p><a href="${cursorInstall}">Add SeenRelay to Cursor →</a></p></div>
<div class="terminal"><pre>{
  "mcpServers": {
    "seenrelay": {
      "url": "${origin}/mcp"
    }
  }
}</pre></div>
</section>

<section class="section split">
<div><div class="eyebrow">VS CODE / COPILOT</div><h2>Remote MCP over HTTP.</h2><p>VS Code supports remote MCP servers through <code>mcp.json</code> and its documented <code>--add-mcp</code> flow.</p></div>
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
<div><div class="eyebrow">CHATGPT CUSTOM MCP APPS</div><h2>Use the same MCP endpoint.</h2><p>Create a custom app, provide <code>${origin}/mcp</code>, scan the tools and review permissions before enabling it. MCP availability and administrative controls vary by plan and can change.</p></div>
<div class="proof-grid"><article><b>Endpoint</b><span>${origin}/mcp</span></article><article><b>Protocol rule</b><span>CHECK shared evidence when useful; OBSERVE only after independent observation.</span></article></div>
</section>

<section class="section decision">
<div class="section-head"><div><div class="eyebrow">DEPLOY SAFELY</div><h2>Use only safe read-only operations. Measure before reuse.</h2></div><p>Keep TTL zero unless a defensible freshness window exists. Preserve the original validation as fallback.</p></div>
<div class="cta"><a class="primary" href="/quickstart">Run the quickstart</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/CLIENTS.md">Full client guide</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}

export function robotsText(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin: string): string {
  const urls = ['/', '/economics', '/quickstart', '/clients', '/trust', '/data-practices'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function llmsText(origin: string): string {
  return `# SeenRelay

> Avoid redundant expensive validation. JavaScript/TypeScript 0.2.1 uses local/private reuse, source-native checks, then optional shared CHECK. OBSERVE only fresh independent source-backed results.

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

Python 0.2.1 remains shadow-first. The classic JavaScript / TypeScript API also remains available for CHECK-first measurement and explicit bounded shared-evidence reuse.

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
