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
  const productionMcp = 'https://seenrelay.com/mcp';
  const cursorInstall = 'https://cursor.com/link/mcp/install?name=seenrelay&config=eyJ1cmwiOiJodHRwczovL3NlZW5yZWxheS5jb20vbWNwIn0%3D';
  const vscodeInstall = 'vscode:mcp/install?%7B%22name%22%3A%22seenrelay%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fseenrelay.com%2Fmcp%22%7D';
  const vscodeCommand = `code --add-mcp '{"name":"seenrelay","type":"http","url":"${productionMcp}"}'`;
  const claudeCommand = `claude mcp add --transport http --scope user seenrelay ${productionMcp}`;

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
  <h1>Put SeenRelay around the validation path you already have.</h1>
  <p>The lowest-friction first step is behavior-preserving measurement: install the package, wrap the existing client once, run the workload normally, then read the local report. Connecting the hosted MCP protocol is separate and does not by itself enable reuse.</p>
  <div class="rv-actions"><a class="rv-button primary" href="#instrument">Instrument an application</a><a class="rv-button" href="#connect">Connect CHECK + OBSERVE</a></div>
</section>

<section class="rv-shell rv-section" id="instrument">
  <div class="rv-section-head"><div class="rv-eyebrow">INSTRUMENT AN APPLICATION</div><h2>Start with one behavior-preserving wrapper.</h2><p>No tool is automatically treated as safe to suppress. Ambient integrations keep the authoritative call and measure exact repetition locally first.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Coding agent</b><span>Agent Skill</span></header><p>Install the published SeenRelay skill, then ask the coding agent to inspect the project, select a supported adapter, preserve the authoritative call, run existing tests and report repeated eligible workloads.</p><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><a href="/.well-known/agent-skills/seenrelay/SKILL.md">Inspect the skill →</a></article>

    <article class="rv-choice"><header><b>Existing MCP client</b><span>JavaScript / TypeScript</span></header><p>One wrapper line adds local shadow measurement. Existing <code>callTool(...)</code> usage stays unchanged.</p><div class="rv-code"><pre>import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient);

// use client.callTool(...) normally
console.log(client.seenRelayAmbient.getReport());</pre></div><p>Only after a specific read-only tool is reviewed should <code>seenrelay/mcp-auto</code> be considered for local-first protection. Shared CHECK remains off by default.</p><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">JavaScript / TypeScript guide →</a></article>

    <article class="rv-choice"><header><b>Python MCP</b><span>Ambient / shadow</span></header><p>Python has the same one-wrapper measurement entry point and remains measurement-only.</p><div class="rv-code"><pre>from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(raw_mcp_client)

# await client.call_tool(...) normally
print(client.get_report())</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/python">Python guide →</a></article>

    <article class="rv-choice"><header><b>OpenAI Agents / AI SDK</b><span>Ambient adapters</span></header><p>Wrap the framework-owned MCP surface rather than rewriting the agent.</p><div class="rv-code"><pre>// OpenAI Agents JS
const server = ambientOpenAIAgentsMcpServer(rawMcpServer);

// Vercel AI SDK
const { tools, seenRelayAmbient } =
  ambientAiSdkMcpTools(await mcpClient.tools());</pre></div><a href="/quickstart">Integration quickstart →</a></article>

    <article class="rv-choice"><header><b>LangChain / PydanticAI</b><span>Framework adapters</span></header><p>Client ${version} ships local-shadow integration helpers without adding a hosted operation or authorizing reuse.</p><div class="rv-code"><pre>// LangChain JS
ambientLangChainMcpHooks()

# LangChain / PydanticAI Python
ambient_langchain_mcp_client(client)
ambient_pydantic_ai_toolset(toolset)</pre></div><a href="/quickstart">Integration quickstart →</a></article>

    <article class="rv-choice"><header><b>Plain read-only function</b><span>JavaScript / TypeScript</span></header><p>Use Zero-State when the application directly controls the validation function and can define exact identity and a defensible freshness policy.</p><div class="rv-code"><pre>import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  localMaxAgeMs: 30_000
});</pre></div><a href="https://github.com/ovladon/seenrelay/tree/main/clients/typescript">Zero-State guide →</a></article>
  </div>
</section>

<section class="rv-shell rv-section" id="connect">
  <div class="rv-section-head"><div class="rv-eyebrow">CONNECT THE HOSTED PROTOCOL</div><h2>Use CHECK and OBSERVE from the MCP client you already use.</h2><p>This only connects the SeenRelay protocol. It does not instrument an application's existing validation path and does not automatically authorize reuse.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Cursor</b><span>One click</span></header><p>Open Cursor's official MCP install flow with the SeenRelay remote endpoint prefilled.</p><div class="rv-actions"><a class="rv-button primary" href="${cursorInstall}">Add SeenRelay to Cursor</a></div><div class="rv-code"><pre>${productionMcp}</pre></div></article>

    <article class="rv-choice"><header><b>VS Code / GitHub Copilot</b><span>One click + CLI</span></header><p>Use VS Code's MCP install URL, or the CLI fallback below.</p><div class="rv-actions"><a class="rv-button primary" href="${vscodeInstall}">Install in VS Code</a></div><div class="rv-code"><pre>${esc(vscodeCommand)}</pre></div></article>

    <article class="rv-choice"><header><b>Claude Code</b><span>One command</span></header><p>Add the public Streamable HTTP endpoint at user scope.</p><div class="rv-code"><pre>${esc(claudeCommand)}</pre></div><p>No account or SeenRelay API key is currently required.</p></article>

    <article class="rv-choice"><header><b>Other MCP / REST clients</b><span>Open protocol</span></header><p>Any compatible client can connect directly. The hosted domain surface remains exactly CHECK and OBSERVE.</p><div class="rv-code"><pre>MCP Registry  io.github.ovladon/seenrelay
MCP           ${productionMcp}
REST          https://seenrelay.com/v1/check
REST          https://seenrelay.com/v1/observe</pre></div><a href="/openapi.json">OpenAPI →</a></article>
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

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">FIRST DEPLOYMENT</div><h2>Wrap one existing validation path and run it normally.</h2><p>Read the local report before changing any reuse policy. If exact repetition is not material, no optimization needs to be enabled.</p></div><div class="rv-actions"><a class="rv-button" href="/quickstart">Integration quickstart</a><a class="rv-button" href="https://github.com/ovladon/seenrelay">GitHub</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}