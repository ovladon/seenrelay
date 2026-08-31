import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function quickstartPage(origin: string): string {
  const clientVersion = publicProductFacts.install.client_version;
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Install SeenRelay and measure repeated read-only validation without changing authoritative application behavior.">
<title>SeenRelay — Integration quickstart</title>
<link rel="stylesheet" href="/revamp.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/clients">Integrations</a><a href="/economics">Tests</a><a href="/trust">Trust</a><a href="/openapi.json">OpenAPI</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="/clients">Integrations</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">INTEGRATION QUICKSTART · CLIENT ${esc(clientVersion)}</div>
  <h1>Start with shadow measurement.</h1>
  <p>Keep the existing read-only validation authoritative. SeenRelay measures exact repetition while the original operation still runs, so you can decide from your own workload whether any bounded reuse should be enabled.</p>
  <div class="rv-actions"><a class="rv-button" href="#agent">Coding agent</a><a class="rv-button" href="#manual">Manual integration</a><a class="rv-button quiet" href="/clients">All supported surfaces →</a></div>
</section>

<section class="rv-shell rv-section" id="agent">
  <div class="rv-section-head"><div class="rv-eyebrow">CODING-AGENT INTEGRATION</div><h2>Install the SeenRelay skill, then ask the agent for a behavior-preserving integration.</h2><p>The Agent Skill is published through the SeenRelay domain. The first task should preserve the authoritative call, run the project's existing tests, and report exact repeated workloads rather than automatically enabling reuse.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>1. Install the skill</b><span>Agent Skills</span></header><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><p>The skill contains the SeenRelay protocol and supported integration rules.</p></article>
    <article class="rv-choice"><header><b>2. Give the integration task</b><span>Prompt</span></header><div class="rv-code"><pre>Integrate SeenRelay into repeated expensive read-only validations in this project. Start in shadow mode, preserve the authoritative call, run the existing tests, and report which exact workloads repeat enough to justify bounded reuse.</pre></div></article>
  </div>
</section>

<section class="rv-shell rv-section" id="manual">
  <div class="rv-section-head"><div class="rv-eyebrow">MANUAL INTEGRATION</div><h2>Install the package and wrap one existing read-only validation path.</h2><p>These examples keep the existing MCP call authoritative and expose a local report. No reuse is authorized by the wrapper itself.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>JavaScript/TypeScript ${esc(clientVersion)}</b><span>MCP AMBIENT</span></header>
      <div class="rv-code"><pre>npm install seenrelay</pre></div>
      <div class="rv-code"><pre>import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient, {
  serverKey: 'docs'
});

// use client.callTool(...) normally
console.log(client.seenRelayAmbient.getReport());</pre></div>
      <p>When a tool is explicitly reviewed as eligible, <code>seenrelay/mcp-auto</code> provides the local-first bind-once path. Shared CHECK remains optional.</p>
      <a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">JavaScript / TypeScript guide →</a>
    </article>
    <article class="rv-choice">
      <header><b>Python ${esc(clientVersion)}</b><span>MCP AMBIENT</span></header>
      <div class="rv-code"><pre>pip install seenrelay</pre></div>
      <div class="rv-code"><pre>from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(
    raw_mcp_client,
    server_key="docs",
)

# await client.call_tool(...) normally
print(client.get_report())</pre></div>
      <p>Python Ambient remains measurement-only in client ${esc(clientVersion)}.</p>
      <a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Python guide →</a>
    </article>
  </div>
  <div class="rv-note" style="margin-top:12px"><b>Protocol boundary:</b> SeenRelay's hosted domain protocol still exposes exactly CHECK and OBSERVE. The Ambient examples above are client-side measurement integrations; the original validation remains the fallback.</div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">OTHER SURFACES</div><h2>Use the integration surface that matches the application you already have.</h2><p>SeenRelay also supports a plain JavaScript/TypeScript Zero-State guard, classic JS/TS and Python clients, LangChain adapters, PydanticAI, OpenAI Agents, Vercel AI SDK, remote MCP and REST/OpenAPI.</p></div>
  <div class="rv-stack">
    <article><h3>Plain JS / TS function</h3><p><code>SeenRelayZeroState</code> can apply exact in-flight reuse, explicit local/private freshness policy and source-native confirmation before the original validation.</p></article>
    <article><h3>Framework adapters</h3><p>Ambient adapters preserve existing framework/tool behavior while measuring exact repetition locally by default.</p></article>
    <article><h3>Remote MCP</h3><p>Endpoint: <code>${origin}/mcp</code>. Official Registry identifier: <code>io.github.ovladon/seenrelay</code>.</p></article>
    <article><h3>REST / OpenAPI</h3><p>Direct integrations can use <code>POST /v1/check</code> and <code>POST /v1/observe</code>; the full schema is published at <code>/openapi.json</code>.</p></article>
  </div>
  <div class="rv-actions" style="margin-top:24px"><a class="rv-button" href="/clients">Integration chooser</a><a class="rv-button" href="${origin}/mcp">MCP endpoint</a><a class="rv-button quiet" href="/openapi.json">OpenAPI →</a></div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">AFTER THE FIRST RUN</div><h2>Read the local report before enabling reuse.</h2><p>If exact repetition is rare, or the original validation is already cheaper than an alternative path, leave it alone. If repetition is material, select the bounded local-first or optional shared-evidence policy appropriate to that operation.</p></div><div class="rv-actions"><a class="rv-button" href="/clients">Integration options</a><a class="rv-button" href="/economics">Measured tests</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
