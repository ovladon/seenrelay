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
<meta name="description" content="Get SeenRelay into an agent or application in minutes, starting with behavior-preserving shadow measurement.">
<title>SeenRelay — 3-minute quickstart</title>
<link rel="stylesheet" href="/revamp.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/clients">Integrations</a><a href="/economics">Evidence</a><a href="/trust">Trust</a><a href="/openapi.json">OpenAPI</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="/clients">Choose integration</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">3-MINUTE QUICKSTART · CLIENT ${esc(clientVersion)}</div>
  <h1>Start by measuring repeats, not changing behavior.</h1>
  <p>The safest first integration keeps the authoritative validation exactly where it is and lets SeenRelay identify exact repeated read-only work. Once repetition is real, you can decide whether bounded reuse belongs there.</p>
  <div class="rv-actions"><a class="rv-button primary" href="#agent">Give it to an agent</a><a class="rv-button" href="#manual">Wire it yourself</a><a class="rv-button quiet" href="/clients">All integrations →</a></div>
</section>

<section class="rv-shell rv-section" id="agent">
  <div class="rv-section-head"><div class="rv-eyebrow">FASTEST PATH</div><h2>Let your coding agent do the integration.</h2><p>SeenRelay publishes an Agent Skill through standard well-known discovery. Install it once in the project, then ask the agent to protect repeated expensive read-only validations conservatively.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>1. Install the skill</b><span>Agent Skills</span></header><p>Use the open skills CLI. Compatible agents can discover the SeenRelay skill directly from this domain.</p><div class="rv-code"><pre>${esc(skillCommand)}</pre></div></article>
    <article class="rv-choice"><header><b>2. Give one clear instruction</b><span>Prompt</span></header><p>Keep the first pass behavior-preserving.</p><div class="rv-code"><pre>Integrate SeenRelay into repeated expensive read-only validations in this project. Start in shadow mode, preserve the authoritative call, and report which exact workloads repeat enough to justify further optimization.</pre></div></article>
  </div>
</section>

<section class="rv-shell rv-section" id="manual">
  <div class="rv-section-head"><div class="rv-eyebrow">MANUAL PATH</div><h2>Install, wrap, observe.</h2><p>The original operation still runs. These smallest examples measure exact repetition without suppressing it, so the original validation remains the fallback while you decide whether reuse belongs here.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>JavaScript / TypeScript ${esc(clientVersion)}</b><span>MCP BIND-ONCE</span></header>
      <p>Works well when your application already has an MCP client. Start with Ambient measurement; if the workload proves eligible, the integration chooser shows the reviewed local-first protection path.</p>
      <div class="rv-code"><pre>npm install seenrelay</pre></div>
      <div class="rv-code"><pre>import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient, {
  serverKey: 'docs'
});

// use client.callTool(...) normally
console.log(client.seenRelayAmbient.getReport());</pre></div>
      <a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">Full JS / TS guide →</a>
    </article>
    <article class="rv-choice">
      <header><b>Python ${esc(clientVersion)}</b><span>Ambient MCP</span></header>
      <p>Python starts in local-only shadow mode and keeps the original tool call authoritative.</p>
      <div class="rv-code"><pre>pip install seenrelay</pre></div>
      <div class="rv-code"><pre>from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(
    raw_mcp_client,
    server_key="docs",
)

# await client.call_tool(...) normally
print(client.get_report())</pre></div>
      <a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Full Python guide →</a>
    </article>
  </div>
  <div class="rv-note" style="margin-top:12px"><b>Protocol boundary:</b> MCP remains the standard discovery and model/tool-routing interface for existing MCP stacks. SeenRelay's hosted protocol still has exactly two operations: CHECK and OBSERVE. Shared SeenRelay CHECK is off by default in Zero-State.</div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">NO MCP?</div><h2>There is still a direct path.</h2><p>Use Zero-State around an eligible JavaScript/TypeScript read-only function, or the classic Python helper around a known validation. The integration chooser shows the shortest correct form for each stack.</p></div>
  <div class="rv-stack">
    <article><h3>Plain JS / TS function</h3><p><code>SeenRelayZeroState</code> can coalesce identical in-flight work and apply explicit local/private freshness policy before the original validation.</p></article>
    <article><h3>LangChain</h3><p>Ambient framework routing is available in JavaScript/TypeScript and Python, preserving the authoritative call by default.</p></article>
    <article><h3>PydanticAI</h3><p>Python includes an Ambient toolset adapter for measurement-first integration.</p></article>
    <article><h3>OpenAI Agents / AI SDK</h3><p>Optional Ambient adapters let existing agent stacks keep their current tool behavior while SeenRelay measures exact repetition.</p></article>
  </div>
  <div class="rv-note" style="margin-top:18px"><b>MCP Registry:</b> <code>io.github.ovladon/seenrelay</code>. You can also use the hosted MCP endpoint directly when a client adapter is unnecessary.</div>
  <div class="rv-actions" style="margin-top:24px"><a class="rv-button primary" href="/clients">Open integration chooser</a><a class="rv-button" href="${origin}/mcp">MCP endpoint</a><a class="rv-button quiet" href="/openapi.json">REST / OpenAPI →</a></div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">NEXT</div><h2>Measure one real workload.</h2><p>If exact repetition is rare or the original validation is already cheap, stop there. If repetition is material, the client guide shows the bounded local-first and shared-evidence paths available for that integration.</p></div><div class="rv-actions"><a class="rv-button primary" href="/clients">Choose integration</a><a class="rv-button" href="/economics">See economics</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
