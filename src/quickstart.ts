import { publicInstallHtml, siteFooterHtml } from './public-facts-view.js';

export function quickstartPage(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Avoid redundant validation with local/private reuse, source-native checks and optional shared CHECK evidence.">
<title>SeenRelay Quickstart</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/clients">Clients</a><a href="/openapi.json">OpenAPI</a><a href="/service.json">Machine JSON</a><a href="/data-practices">Data</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">INTEGRATION QUICKSTART</div>
<h1>Reuse first. Validate when needed.</h1>
<p class="lead">JavaScript/TypeScript 0.2.1: local/private reuse → source-native checks → optional CHECK → original validation. Python remains shadow-first.</p>
<div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Full quickstart</a><a class="secondary" href="/economics">Cost examples</a><a class="secondary" href="/clients">Client options</a><a class="secondary" href="/openapi.json">REST / OpenAPI</a><a class="secondary" href="/mcp">MCP endpoint</a></div>
<div class="contract"><span>Client 0.2.1</span><b>CHECK</b><b>OBSERVE</b><span>No account · no API key · currently free</span></div>
</section>

${publicInstallHtml()}

<section class="section split decision">
<div><div class="eyebrow">JAVASCRIPT / TYPESCRIPT</div><h2>Zero-State works without shared network data.</h2><p>For explicitly eligible read-only operations, Zero-State starts with exact in-flight reuse, explicit-TTL local reuse, optional encrypted caller-owned L1 and source-native validators. Shared SeenRelay CHECK is off by default.</p><p>The original validation remains the fallback whenever reuse cannot be justified. OBSERVE is eligible only after a genuinely fresh independent validation.</p></div>
<div class="terminal"><pre>import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  localMaxAgeMs: 30_000
});

const result = await edge.guard({
  coordinate: {
    tool: 'catalog.read',
    arguments: { id: 42 }
  },
  validate: async () =&gt; expensiveRead()
});</pre></div>
</section>

<section class="section split">
<div><div class="eyebrow">ORDER</div><h2>Local first. Shared CHECK only when useful.</h2><div class="flow"><span>L0 local</span><i>→</i><span>L1 private</span><i>→</i><span>source native</span><i>→</i><span>optional CHECK</span><i>→</i><span>validate</span></div><p>A completed-result TTL defaults to zero. Use a non-zero freshness window only when the caller/source contract can defend it.</p></div>
<div class="proof-grid"><article><b>Local first</b><span>Exact eligible work can be reused without any public network coverage.</span></article><article><b>Private L1</b><span>Caller-owned encrypted storage can span workers or restarts.</span></article><article><b>Source native</b><span>ETag / Last-Modified can confirm unchanged content at the source.</span></article><article><b>Shared optional</b><span>CHECK is an accelerator, not a prerequisite.</span></article></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">MCP BIND-ONCE</div><h2>Protect only explicitly allowlisted tools.</h2><p><code>seenrelay/mcp-auto</code> can intercept <code>callTool()</code> for exact tool names selected by the application. Unlisted tools pass through unchanged. SeenRelay does not infer read-only safety from names, descriptions or untrusted annotations.</p></div>
<div class="terminal"><pre>import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(rawMcpClient, {
  serverKey: 'catalog-server',
  tools: {
    'catalog.read': { maxAgeMs: 30_000 }
  }
});</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">CLASSIC CLIENTS</div><h2>Classic clients remain shadow-first.</h2><p>The classic JavaScript/TypeScript and Python clients still put CHECK around a known fact, keep the original validation unless caller policy explicitly permits bounded reuse, and OBSERVE the independently obtained result best-effort.</p><p>Python remains shadow-first in 0.2.1.</p></div>
<div class="proof-grid"><article><b>CHECK</b><span>Compare a known value with recent shared observations.</span></article><article><b>Validate</b><span>UNKNOWN, STALE, CONTESTED or policy requirements continue to the existing source check.</span></article><article><b>OBSERVE</b><span>Contribute only an independently obtained result.</span></article><article><b>Fail open</b><span>Relay/store failures return to the validation the application already planned.</span></article></div>
</section>

<section class="section split">
<div><div class="eyebrow">REMOTE MCP / REST</div><h2>The hosted protocol is unchanged.</h2><p>MCP remains the standard discovery and model/tool-routing interface. REST remains available for direct integrations.</p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>endpoints</b></div><pre>MCP
${origin}/mcp
io.github.ovladon/seenrelay

REST
POST ${origin}/v1/check
POST ${origin}/v1/observe</pre></div>
</section>

<section class="section final"><div><div class="eyebrow">IMPLEMENT</div><h2>Start with one safe read-only workload. Measure what you avoid.</h2></div><div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Open Quickstart</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/PROTOCOL.md">Protocol</a><a class="secondary" href="/clients">Clients</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
