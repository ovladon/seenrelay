import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function clientsPage(origin: string): string {
  const version = esc(publicProductFacts.install.client_version);
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Supported SeenRelay integration surfaces for coding agents, MCP, JavaScript/TypeScript, Python and framework adapters.">
<title>SeenRelay — Integrations</title>
<link rel="stylesheet" href="/revamp.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/economics">Tests</a><a href="/trust">Trust</a><a href="/openapi.json">OpenAPI</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/.well-known/agent-skills/seenrelay/SKILL.md">Agent Skill</a><a class="rv-button" href="/quickstart">Quickstart</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">SUPPORTED INTEGRATIONS · CLIENT ${version}</div>
  <h1>Choose the surface that matches your existing application.</h1>
  <p>SeenRelay is designed to sit around validation work you already have. For a first integration, prefer an Ambient/shadow path when available; it measures repetition while preserving the authoritative call.</p>
</section>

<section class="rv-shell rv-section" id="choices">
  <div class="rv-section-head"><div class="rv-eyebrow">INTEGRATION SURFACES</div><h2>Current supported entry points.</h2><p>If a framework-specific adapter is unnecessary, use the provider-independent JavaScript/TypeScript client, Python client, MCP or REST surface directly.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Coding agent</b><span>Agent Skill</span></header><p>Install the published SeenRelay skill. Ask the coding agent to start in shadow mode, preserve the authoritative call, run the existing tests and report repeated eligible workloads.</p><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><a href="/.well-known/agent-skills/seenrelay/SKILL.md">Inspect the skill →</a></article>

    <article class="rv-choice"><header><b>Existing MCP client</b><span>JavaScript / TypeScript</span></header><p>Use Ambient for measurement without suppressing calls. After a specific read-only tool is reviewed as eligible, <code>protectMcpClient</code> from <code>seenrelay/mcp-auto</code> provides the local-first bind-once path. Shared CHECK is not enabled by default.</p><div class="rv-code"><pre>import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient, {
  serverKey: 'docs'
});

console.log(client.seenRelayAmbient.getReport());</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">JavaScript / TypeScript guide →</a></article>

    <article class="rv-choice"><header><b>Plain read-only function</b><span>JavaScript / TypeScript</span></header><p>Use Zero-State when the application directly controls the validation function and can define exact identity and a defensible freshness policy.</p><div class="rv-code"><pre>import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  localMaxAgeMs: 30_000
});</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">Zero-State guide →</a></article>

    <article class="rv-choice"><header><b>Python MCP</b><span>Ambient / shadow</span></header><p>Wrap the existing MCP client. Python keeps the authoritative call and reports exact repetition locally.</p><div class="rv-code"><pre>from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(
    raw_mcp_client,
    server_key="docs",
)

print(client.get_report())</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Python guide →</a></article>

    <article class="rv-choice"><header><b>LangChain / PydanticAI</b><span>Framework adapters</span></header><p>Client ${version} ships Ambient integration helpers for LangChain in JavaScript/TypeScript and Python, plus PydanticAI in Python. These adapters preserve authoritative behavior by default.</p><div class="rv-code"><pre>// JavaScript / TypeScript
ambientLangChainMcpHooks()

# Python
ambient_langchain_mcp_client(client)
ambient_pydantic_ai_toolset(toolset)</pre></div><a href="/quickstart">Integration quickstart →</a></article>

    <article class="rv-choice"><header><b>Remote protocol</b><span>MCP / REST</span></header><p>Use the hosted protocol directly when no local adapter is needed. The hosted domain surface remains CHECK and OBSERVE.</p><div class="rv-code"><pre>MCP Registry  io.github.ovladon/seenrelay
MCP           ${origin}/mcp
REST          ${origin}/v1/check
REST          ${origin}/v1/observe</pre></div><a href="/openapi.json">OpenAPI →</a></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">INTEGRATION MODES</div><h2>Choose authority deliberately.</h2><p>The modes differ in what they are allowed to do. A measurement integration can be adopted before any reuse policy is enabled.</p></div>
  <div class="rv-stack">
    <article><h3>Ambient / shadow</h3><p>The original operation still runs. SeenRelay measures exact repetition and local agreement without authorizing automatic reuse.</p></article>
    <article><h3>Local-first protection</h3><p>For explicitly reviewed read-only work, JavaScript/TypeScript can coalesce in-flight duplicates and apply explicit local/private or source-native freshness policy before the original validation.</p></article>
    <article><h3>Optional shared CHECK</h3><p>Shared freshness evidence can be enabled where it adds value beyond local/private and source-native controls. It is an optional accelerator, not a prerequisite.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-contract">
    <div class="rv-contract-main"><div class="rv-eyebrow">ELIGIBILITY</div><h3>Only exact, reviewed read-only work should be considered for suppression.</h3><p>Do not infer safety from a tool name, description or untrusted annotation. Define the operation, exact identity and freshness contract, and keep the original validation available when the shortcut does not apply.</p></div>
    <div class="rv-contract-list"><article><b>No account or API key currently required</b><span>The public service can be tested without provisioning credentials.</span></article><article><b>Zero third-party client runtime dependencies</b><span>The core public package keeps its runtime dependency surface at zero.</span></article><article><b>Machine-readable integration metadata</b><span>Agent Skill discovery and the local integration catalog expose supported adapters to compatible tooling.</span></article></div>
  </div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">FIRST DEPLOYMENT</div><h2>Measure one existing validation path before changing its reuse policy.</h2><p>The local report should show whether exact repetition is material. If it is not, no optimization needs to be enabled.</p></div><div class="rv-actions"><a class="rv-button" href="/quickstart">Integration quickstart</a><a class="rv-button" href="https://github.com/ovladon/seenrelay">GitHub</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
