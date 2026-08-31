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
<meta name="description" content="Choose the shortest SeenRelay integration for coding agents, MCP, JavaScript/TypeScript, Python, LangChain, PydanticAI and agent frameworks.">
<title>SeenRelay — Integration chooser</title>
<link rel="stylesheet" href="/revamp.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/economics">Evidence</a><a href="/trust">Trust</a><a href="/openapi.json">OpenAPI</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/.well-known/agent-skills/seenrelay/SKILL.md">Agent Skill</a><a class="rv-button" href="/quickstart">Start</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">INTEGRATION CHOOSER · CLIENT ${version}</div>
  <h1>Pick what you already use.</h1>
  <p>SeenRelay should fit around the validation path you already have. Choose the closest surface below; start behavior-preserving, then enable bounded optimization only where real repetition justifies it.</p>
  <div class="rv-actions"><a class="rv-button primary" href="#choices">Choose my stack</a><a class="rv-button" href="/quickstart">3-minute quickstart</a></div>
</section>

<section class="rv-shell rv-section" id="choices">
  <div class="rv-section-head"><div class="rv-eyebrow">FAST PATHS</div><h2>Six common entry points.</h2><p>If your exact framework is not listed, the core client, MCP and REST surfaces remain provider-independent.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Coding agent</b><span>Lowest effort</span></header><p>Install the Agent Skill and let a compatible coding agent inspect the project and choose the conservative integration path.</p><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><a href="/.well-known/agent-skills/seenrelay/SKILL.md">Inspect the skill →</a></article>

    <article class="rv-choice"><header><b>Existing MCP client</b><span>JS / TS</span></header><p>Wrap the client once in Ambient mode. Calls continue normally while exact repetition is measured locally.</p><div class="rv-code"><pre>import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient, {
  serverKey: 'docs'
});</pre></div><p style="margin-top:14px">When the measured tool is reviewed as eligible, move the same client to local-first protection with <code>protectMcpClient</code> from <code>seenrelay/mcp-auto</code>. Shared CHECK stays off by default unless you explicitly enable it.</p><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">JS / TS guide →</a></article>

    <article class="rv-choice"><header><b>Plain read-only function</b><span>JS / TS</span></header><p>Use Zero-State when your application directly controls the validation function and can define a defensible freshness window.</p><div class="rv-code"><pre>import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  localMaxAgeMs: 30_000
});</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">Zero-State guide →</a></article>

    <article class="rv-choice"><header><b>Python MCP</b><span>Shadow first</span></header><p>Wrap the existing MCP client. Python preserves the authoritative call and reports exact repetition locally.</p><div class="rv-code"><pre>from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(
    raw_mcp_client,
    server_key="docs",
)</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Python guide →</a></article>

    <article class="rv-choice"><header><b>LangChain / PydanticAI</b><span>Framework adapters</span></header><p>Use the Ambient adapters shipped in client ${version}; no framework is a core runtime dependency.</p><div class="rv-code"><pre>// JavaScript / TypeScript
ambientLangChainMcpHooks()

# Python
ambient_langchain_mcp_client(client)
ambient_pydantic_ai_toolset(toolset)</pre></div><a href="/quickstart">See adapter examples →</a></article>

    <article class="rv-choice"><header><b>Remote protocol</b><span>MCP / REST</span></header><p>When you do not need a client adapter, use the hosted protocol directly. The service exposes CHECK and OBSERVE.</p><div class="rv-code"><pre>MCP Registry  io.github.ovladon/seenrelay
MCP           ${origin}/mcp
REST          ${origin}/v1/check
REST          ${origin}/v1/observe</pre></div><a href="/openapi.json">OpenAPI →</a></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">CHOOSING THE MODE</div><h2>Start with the least authority SeenRelay needs.</h2></div>
  <div class="rv-stack">
    <article><h3>Ambient / shadow</h3><p>Best first step. The original operation still runs. SeenRelay measures exact repetition and produces local evidence without authorizing automatic reuse.</p></article>
    <article><h3>Local-first protection</h3><p>For reviewed read-only work, JavaScript/TypeScript can coalesce in-flight duplicates and apply explicit local/private freshness policy before the original validation.</p></article>
    <article><h3>Shared CHECK</h3><p>Shared CHECK is off by default. Enable shared freshness evidence only when it can add value beyond local/private and source-native controls; it remains an optional accelerator, not a prerequisite.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-contract">
    <div class="rv-contract-main"><div class="rv-eyebrow">ONE RULE</div><h3>Protect read-only work you can identify exactly.</h3><p>Do not infer safety from a tool name alone. Review the operation and its freshness contract, then keep the original validation available when the shortcut does not apply.</p></div>
    <div class="rv-contract-list"><article><b>No account or API key</b><span>The current public service can be tried without provisioning credentials.</span></article><article><b>Zero third-party client runtime dependencies</b><span>The published client keeps the core dependency surface small.</span></article><article><b>Machine-readable integration metadata</b><span>Agent Skill discovery and the local integration catalog help tooling choose supported adapters.</span></article></div>
  </div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">READY</div><h2>Choose one repeated validation and wire it once.</h2><p>For most new adopters, the Agent Skill or Ambient MCP wrapper is the shortest path to useful measurement.</p></div><div class="rv-actions"><a class="rv-button primary" href="/quickstart">Open quickstart</a><a class="rv-button" href="https://github.com/ovladon/seenrelay">GitHub</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
