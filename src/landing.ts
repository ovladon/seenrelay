import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function publicLandingPage(origin: string): string {
  const f = publicProductFacts;
  const version = esc(f.install.client_version);
  const npmCommand = esc(f.install.npm_command);
  const pipCommand = esc(f.install.pypi_command);
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;
  const auditPrompt = 'Run a SeenRelay shadow audit on this project. Find repeated expensive read-only validations, preserve every authoritative call, measure stronger local/source/provider-native controls first, do not enable reuse, and return USE / DO NOT USE / INSUFFICIENT EVIDENCE for each measured workload.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay finds repeated expensive read-only validation in AI agent workloads and helps reuse it safely when the measured economics justify it.">
<link rel="canonical" href="${origin}/">
<link rel="service-desc" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<link rel="service-desc" type="application/json" href="${origin}/openapi.json" title="SeenRelay OpenAPI description">
<link rel="service-meta" type="application/json" href="${origin}/product-facts.json" title="SeenRelay verified product facts">
<link rel="service-doc" href="${origin}/quickstart" title="SeenRelay integration documentation">
<link rel="alternate" type="application/json" href="${origin}/.well-known/agent-skills/index.json" title="SeenRelay Agent Skill discovery">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — stop repeating expensive agent validation">
<meta property="og:description" content="Run your workload normally. SeenRelay measures exact repetition, safety and economics before reuse is enabled.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Stop repeating expensive agent validation</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/revamp-factual.css">
<link rel="stylesheet" href="/funnel.css">
<script src="/revamp.js" defer></script>
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/" aria-label="SeenRelay home"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation">
    <a href="#how">How it works</a>
    <a href="#start">Try it</a>
    <a href="/fleet">Product</a>
    <a href="/clients">Integrations</a>
    <a href="/trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="#how">How it works</a><a href="#start">Try it</a><a href="/fleet">Product</a><a href="/clients">Integrations</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a><a href="/readiness">Free site tool</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-chip" href="/clients">Integrations</a><a class="rv-button primary" href="#start">Try SeenRelay free</a></div>
</header>

<main id="main-content">
<section class="rv-shell rv-hero rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>FREE · NO ACCOUNT · CLIENT ${version}</span></div>
    <h1>Your agents repeat expensive checks. <em>SeenRelay finds the ones you can stop repaying for.</em></h1>
    <p class="rv-lead">Install SeenRelay around the validation work your agents already perform. Run normally. It measures exact repetition, compares safer native controls first, and tells you whether reuse is worth enabling. Until then, every authoritative call still runs.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="#start">Run the free shadow audit</a>
      <a class="rv-button" href="/quickstart">2-minute quickstart</a>
    </div>
    <div class="rv-proofline" aria-label="Current product facts">
      <span>free</span><span>no account</span><span>no SeenRelay API key</span><span>shadow-first</span><span>fail open</span><span>npm + PyPI</span>
    </div>
  </div>
  <aside class="rv-demo rv-verdict-demo" aria-label="Example SeenRelay audit output">
    <div class="rv-demo-head"><span>what you get</span><b>one decision per workload</b></div>
    <div class="rv-verdict-card">
      <div class="rv-verdict-top"><span>WORKLOAD VERDICT</span><strong>USE / DO NOT USE / INSUFFICIENT EVIDENCE</strong></div>
      <div class="rv-verdict-grid">
        <div><span>Repetition</span><b>Measured from your real run</b></div>
        <div><span>Safety</span><b>Compared with the authoritative result</b></div>
        <div><span>Economics</span><b>Native controls + SeenRelay overhead included</b></div>
        <div><span>Next step</span><b>Exact path to keep, enable or reject</b></div>
      </div>
      <p>No guessed hit rate. No benchmark-derived promise. Your workload decides.</p>
    </div>
  </aside>
</section>

<section class="rv-band" aria-label="SeenRelay principles"><div class="rv-band-inner">
  <div><b>Measure first</b><span>No reuse during the first audit</span></div>
  <div><b>Native first</b><span>ETag/cache wins when it is better</span></div>
  <div><b>Reuse narrowly</b><span>Only explicit read-only candidates</span></div>
  <div><b>Fall back safely</b><span>The original validation remains authoritative</span></div>
</div></section>

<section class="rv-shell rv-section" id="how">
  <div class="rv-section-head"><div class="rv-eyebrow">HOW IT WORKS</div><h2>Three steps. No platform migration.</h2><p>SeenRelay wraps an existing validation boundary. You do not move your agents, data or source of truth into SeenRelay.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Wrap one validation path</h3><p>Start with an existing MCP client, supported agent framework or read-only function. The original operation still runs exactly as before.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Run your normal workload</h3><p>SeenRelay measures exact recurrence and candidate savings locally. It does not authorize reuse merely because a repeat exists.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Keep only measured value</h3><p>Get a USE, DO NOT USE or INSUFFICIENT EVIDENCE verdict. Enable the narrowest safe reuse path only where the math wins.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="start">
  <div class="rv-section-head">
    <div class="rv-eyebrow">TRY IT FREE</div>
    <h2>The easiest path is to give SeenRelay to your coding agent.</h2>
    <p>Or install the client directly. Either way, the first run is measurement-only and every authoritative validation stays enabled.</p>
  </div>
  <div class="rv-adopt">
    <div class="rv-mode-card">
      <div class="rv-segment" role="tablist" aria-label="Installation mode"><button type="button" role="tab" aria-selected="true" data-mode-button="agent">Coding agent</button><button type="button" role="tab" aria-selected="false" data-mode-button="human">Developer</button></div>
      <div class="rv-mode-copy"><h3>Start without learning SeenRelay first.</h3><p>The Agent Skill inspects the project, uses only a supported integration boundary and returns a decision instead of blindly enabling reuse.</p></div>
      <div class="rv-mode-note">No SeenRelay account or API key is required. Your existing providers may still require their own credentials.</div>
    </div>
    <div class="rv-console rv-funnel-console" aria-live="polite">
      <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>free shadow audit</span></div>
      <div class="rv-console-body">
        <div class="rv-install-view active" data-install-view="agent" id="agent-audit">
          <div class="rv-step"><span>1</span><div><h4>Install the SeenRelay Agent Skill</h4><div class="rv-code"><pre id="skill-install">${esc(skillCommand)}</pre><button class="rv-copy" type="button" data-copy-target="skill-install">Copy</button></div></div></div>
          <div class="rv-step"><span>2</span><div><h4>Give your coding agent this task</h4><div class="rv-code"><pre id="agent-prompt">${esc(auditPrompt)}</pre><button class="rv-copy" type="button" data-copy-target="agent-prompt">Copy</button></div></div></div>
          <div class="rv-step"><span>3</span><div><h4>Read the verdict</h4><p>Keep SeenRelay only on workloads that show safe repetition and positive net economics after stronger native controls.</p></div></div></div>
        </div>
        <div class="rv-install-view" data-install-view="human" id="developer-audit">
          <div class="rv-step"><span>1</span><div><h4>Install</h4><div class="rv-code"><pre id="npm-install">${npmCommand}</pre><button class="rv-copy" type="button" data-copy-target="npm-install">Copy</button></div><div class="rv-code"><pre id="pip-install">${pipCommand}</pre><button class="rv-copy" type="button" data-copy-target="pip-install">Copy</button></div></div></div>
          <div class="rv-step"><span>2</span><div><h4>Wrap an existing MCP-style client</h4><div class="rv-code"><pre id="ambient-example">import { ambientMcpClient } from 'seenrelay/ambient';\n\nconst client = ambientMcpClient(rawMcpClient);\n// run your existing workload normally\nconsole.log(client.seenRelayAmbient.getReport());</pre><button class="rv-copy" type="button" data-copy-target="ambient-example">Copy</button></div></div></div>
          <div class="rv-step"><span>3</span><div><h4>Evaluate before enabling reuse</h4><p>The local report finds exact repeat candidates. Shadow Proof and the economics evaluator can then test safety and net value on the real workload.</p></div></div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="rv-shell rv-section" id="fit">
  <div class="rv-section-head"><div class="rv-eyebrow">GOOD FIT</div><h2>SeenRelay is for repeated checks that are expensive enough to matter.</h2><p>It is deliberately narrow. Cheap one-off reads and mutating operations should stay exactly as they are.</p></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>01</i><h3>Paid web search</h3><p>Repeated source-backed searches where provider spend is meaningful.</p></article>
    <article class="rv-usecase"><i>02</i><h3>Browser / portal checks</h3><p>Read-only browser work with proxy, rendering or navigation cost.</p></article>
    <article class="rv-usecase"><i>03</i><h3>Metered extraction</h3><p>Repeated scraping, extraction or model-assisted parsing with deterministic identity.</p></article>
    <article class="rv-usecase"><i>04</i><h3>Agent fleets</h3><p>Multiple workers or restarts that may otherwise repay for the same bounded validation.</p></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/fleet">See the product architecture</a><a class="rv-button quiet" href="/clients">Browse integrations →</a></div>
</section>

<section class="rv-shell rv-section" id="safety">
  <div class="rv-section-head"><div class="rv-eyebrow">SAFE BY DEFAULT</div><h2>SeenRelay does not replace your source of truth.</h2><p>It sits in front of eligible read-only validation and gets out of the way whenever the evidence or policy is insufficient.</p></div>
  <div class="rv-contract">
    <article class="rv-contract-main"><div class="rv-eyebrow">DEFAULT</div><h3>When in doubt, validate normally.</h3><p>Unknown, stale, contested, unsupported or ineligible work falls through to the operation your application was already going to run.</p></article>
    <div class="rv-contract-list">
      <article><b>No truth oracle</b><span>SeenRelay reports recent compatible observations; it does not decide reality.</span></article>
      <article><b>No mutation suppression</b><span>Mutating or destructive operations are outside the reuse target.</span></article>
      <article><b>Caller-owned private reuse</b><span>Private L1 values, keys and retention stay under caller control.</span></article>
      <article><b>Optional shared evidence</b><span>Hosted SeenRelay still exposes exactly CHECK and OBSERVE; shared CHECK is optional.</span></article>
    </div>
  </div>
</section>

<section class="rv-shell rv-section rv-compact-section" id="resources">
  <div class="rv-section-head"><div class="rv-eyebrow">INTEGRATIONS</div><h2>Use the stack you already have.</h2><p>SeenRelay currently supports JavaScript/TypeScript and Python clients plus supported Ambient adapters for MCP-style clients and selected agent frameworks. Unsupported paths are left unchanged rather than guessed.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">MCP</span><h3>MCP clients</h3><p>Measure an existing <code>callTool()</code> / <code>call_tool()</code> path without rewriting the agent.</p><a href="/clients">Integration chooser →</a></article>
    <article class="rv-card"><span class="rv-number">AGENTS</span><h3>Agent frameworks</h3><p>Supported Ambient adapters include OpenAI Agents and other published framework boundaries documented by the installed client.</p><a href="/clients">See supported adapters →</a></article>
    <article class="rv-card"><span class="rv-number">CODE</span><h3>Plain read-only work</h3><p>Use provider-independent Zero-State around explicitly eligible deterministic validation functions.</p><a href="/quickstart">Open quickstart →</a></article>
  </div>
</section>

<section class="rv-shell rv-section rv-compact-section">
  <div class="rv-section-head"><div class="rv-eyebrow">SEPARATE FREE TOOL</div><h2>Own a site or API?</h2><p>The AI Visit Efficiency checker audits a public HTTP surface and recommends native HTTP fixes first. It is separate from the SeenRelay runtime product.</p></div>
  <div class="rv-actions"><a class="rv-button" href="/readiness">Open the free site tool</a></div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">START SMALL</div><h2>Measure one expensive repeated validation today.</h2><p>If SeenRelay cannot demonstrate value on your workload, leave it out. If it can, promote only that measured path.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="#start">Try SeenRelay free</a><a class="rv-button" href="/quickstart">Quickstart</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}