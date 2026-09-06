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
<meta name="description" content="Install SeenRelay, measure repeated expensive read-only validation, then use caller-owned fleet reuse only where the workload earns it.">
<title>SeenRelay — Integration quickstart</title>
<link rel="stylesheet" href="/revamp.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/fleet">Fleet</a><a href="/clients">Integrations</a><a href="/economics">Tests</a><a href="/trust">Trust</a><a href="/openapi.json">OpenAPI</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="/fleet">Fleet deployment</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">INTEGRATION QUICKSTART · CLIENT ${esc(clientVersion)}</div>
  <h1>Measure first. Reuse only where the fleet earns it.</h1>
  <p>The first SeenRelay integration keeps the existing read-only validation authoritative. Ambient measures exact repetition locally while the original operation still runs. If a costly workload repeats materially across workers, the JavaScript/TypeScript client can then use caller-owned encrypted private L1 before optional shared evidence.</p>
  <div class="rv-actions"><a class="rv-button" href="#agent">Coding agent</a><a class="rv-button" href="#manual">Manual integration</a><a class="rv-button" href="#fleet">Fleet path</a><a class="rv-button quiet" href="/clients">All supported surfaces →</a></div>
</section>

<section class="rv-shell rv-section" id="agent">
  <div class="rv-section-head"><div class="rv-eyebrow">CODING-AGENT INTEGRATION</div><h2>Give the agent the SeenRelay integration contract, not a long setup guide.</h2><p>The Agent Skill is published through the SeenRelay domain. The first task preserves the authoritative call, selects only a supported adapter, runs the project's existing tests and reports exact repeated workloads rather than automatically enabling reuse.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>1. Install the skill</b><span>Agent Skills</span></header><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><p>The skill contains the protocol boundary, supported integrations and fail-closed rules.</p></article>
    <article class="rv-choice"><header><b>2. Give the integration task</b><span>Prompt</span></header><div class="rv-code"><pre>Find repeated expensive read-only validations across this agent fleet. Integrate SeenRelay only through a supported adapter, start in shadow mode, preserve the authoritative call and stronger native controls, run the existing tests, and report the exact workloads that repeat. Where workers already share a caller-owned store, evaluate encrypted private L1 before optional shared CHECK.</pre></div></article>
  </div>
</section>

<section class="rv-shell rv-section" id="manual">
  <div class="rv-section-head"><div class="rv-eyebrow">MANUAL INTEGRATION</div><h2>The first deployment needs no reuse policy.</h2><p>Install the package and wrap the client you already have. Continue using it normally. The report is local; the wrapper does not authorize automatic reuse.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>JavaScript/TypeScript ${esc(clientVersion)}</b><span>MCP AMBIENT</span></header>
      <div class="rv-code"><pre>npm install seenrelay</pre></div>
      <div class="rv-code"><pre>import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient);

// use client.callTool(...) normally
console.log(client.seenRelayAmbient.getReport());</pre></div>
      <p>That wrapper is shadow-first. When a specific read-only tool is explicitly reviewed as eligible, <code>seenrelay/mcp-auto</code> provides the separate local-first bind-once path. Shared SeenRelay CHECK is off by default.</p>
      <a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">JavaScript / TypeScript guide →</a>
    </article>
    <article class="rv-choice">
      <header><b>Python ${esc(clientVersion)}</b><span>MCP AMBIENT</span></header>
      <div class="rv-code"><pre>pip install seenrelay</pre></div>
      <div class="rv-code"><pre>from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(raw_mcp_client)

# await client.call_tool(...) normally
print(client.get_report())</pre></div>
      <p>Python Ambient is local shadow measurement only in client ${esc(clientVersion)}. It does not suppress the authoritative call.</p>
      <a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Python guide →</a>
    </article>
  </div>
  <div class="rv-note"><b>Protocol boundary:</b> SeenRelay's local-first client integrations sit around the application's validation path. Hosted SeenRelay exposes exactly CHECK and OBSERVE, and the original validation remains the fallback.</div>
</section>

<section class="rv-shell rv-section" id="fleet">
  <div class="rv-section-head"><div class="rv-eyebrow">FLEET PATH · JAVASCRIPT / TYPESCRIPT</div><h2>Share encrypted reuse state through infrastructure the caller already controls.</h2><p>Private L1 is designed for reuse across workers or process restarts. The backing store sees an opaque SHA-256 coordinate and encrypted payload; the encryption key stays outside the store contract.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Caller-owned private L1</b><span>AES-256-GCM</span></header>
      <div class="rv-code"><pre>import {
  SeenRelayZeroState,
  createAesGcmPrivateCodec
} from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  privateStore: fleetStore,
  privateCodec: createAesGcmPrivateCodec(keyBytes),
  privateMaxAgeMs: 30_000
});</pre></div>
      <p>Use a positive <code>privateMaxAgeMs</code> only when the caller has an explicit freshness policy that permits a completed result to suppress source validation.</p>
    </article>
    <article class="rv-choice">
      <header><b>Keep stronger controls ahead</b><span>ORDER</span></header>
      <p>Preferred order: exact local/in-flight reuse → caller-owned private L1 → source-native ETag/Last-Modified or stronger authoritative mechanism → optional shared CHECK → original validation.</p>
      <p>With <code>privateMaxAgeMs = 0</code>, a private completed result is not treated as fresh enough to suppress validation; retained source validators can still support conditional confirmation.</p>
      <a href="/fleet">Full fleet deployment and boundaries →</a>
    </article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">OTHER SURFACES</div><h2>Do not rewrite an application to adopt SeenRelay.</h2><p>Use the surface the application already owns: plain JavaScript/TypeScript, LangChain, PydanticAI, OpenAI Agents, Vercel AI SDK, MCP or REST/OpenAPI.</p></div>
  <div class="rv-stack">
    <article><h3>Plain JS / TS function</h3><p><code>SeenRelayZeroState</code> can apply exact in-flight reuse, explicit local/private freshness policy and source-native confirmation before the original validation.</p></article>
    <article><h3>Framework adapters</h3><p>Ambient adapters preserve existing framework/tool behavior while measuring exact repetition locally by default.</p></article>
    <article><h3>Remote MCP clients</h3><p>Official MCP Registry identifier: <code>io.github.ovladon/seenrelay</code>. The Integrations page provides copy-ready Cursor, VS Code/GitHub Copilot and Claude Code connection paths for <code>https://seenrelay.com/mcp</code>. Connecting the protocol alone does not instrument existing validation work.</p></article>
    <article><h3>REST / OpenAPI</h3><p>Direct integrations can use <code>POST /v1/check</code> and <code>POST /v1/observe</code>; the full schema is published at <code>/openapi.json</code>.</p></article>
  </div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">AFTER THE FIRST RUN</div><h2>Promote only the expensive paths that actually repeat.</h2><p>If exact repetition is rare, or an equivalent source/provider-native path is already cheaper, leave it alone. If repetition is material across workers, select the narrowest bounded private or optional shared-evidence policy appropriate to that operation.</p></div><div class="rv-actions"><a class="rv-button primary" href="/fleet">Fleet deployment</a><a class="rv-button" href="/clients">Integration options</a><a class="rv-button" href="/economics">Measured tests</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
