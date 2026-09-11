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
<meta name="description" content="SeenRelay measures and reduces repeated expensive read-only validation in AI agent fleets while preserving source authority and authoritative fallback.">
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
<meta property="og:title" content="SeenRelay — validation reuse for AI agent fleets">
<meta property="og:description" content="Measure repeated expensive read-only validation first. Reuse only where the measured workload is safe and economic.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Validation reuse for AI agent fleets</title>
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
    <a href="/fleet">Product</a>
    <a href="#audit">Measure savings</a>
    <a href="/economics">Economics</a>
    <a href="/clients">Integrations</a>
    <a href="/trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="/fleet">Product</a><a href="#audit">Measure savings</a><a href="/economics">Economics</a><a href="/clients">Integrations</a><a href="/trust">Trust</a><a href="/readiness">Free site tool</a><a href="/quickstart">Docs</a><a href="/service.json">Machine JSON</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-chip" href="/readiness">Free site tool</a><a class="rv-button" href="#audit">Run shadow audit</a></div>
</header>

<main id="main-content">
<section class="rv-shell rv-hero rv-hero-factual rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>VALIDATION REUSE FOR AGENT FLEETS · CLIENT ${version}</span></div>
    <h1>Stop repaying for the same expensive read-only validation.</h1>
    <p class="rv-lead">SeenRelay sits around validation work your agents already perform. It measures exact repetition first, keeps stronger local and source-native controls ahead, and can reuse bounded results across workers only when your policy allows it. The original validation remains the authoritative fallback.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="#audit">Measure my workload</a>
      <a class="rv-button" href="/fleet">See the fleet runtime</a>
      <a class="rv-button quiet" href="/economics">See the economics →</a>
    </div>
    <div class="rv-proofline" aria-label="Current product facts">
      <span>free today</span><span>no account</span><span>no API key</span><span>shadow-first</span><span>authoritative calls stay on</span><span>fail open</span><span>npm + PyPI verified</span>
    </div>
  </div>
  <aside class="rv-demo rv-mechanism" aria-label="SeenRelay runtime order">
    <div class="rv-demo-head"><span>runtime order</span><b>cheapest safe path first</b></div>
    <div class="rv-flow-list">
      <div><span>1</span><p><b>Local / in-flight</b><small>Coalesce exact duplicate work inside the process where policy permits.</small></p></div>
      <div><span>2</span><p><b>Caller-owned private L1</b><small>Reuse encrypted state across workers or restarts under an explicit freshness policy.</small></p></div>
      <div><span>3</span><p><b>Source / provider native</b><small>Prefer ETag, Last-Modified or another authoritative mechanism when it answers the same question better.</small></p></div>
      <div><span>4</span><p><b>Optional shared CHECK → validate</b><small>Shared evidence is optional. Unknown or ineligible work falls through to the original validation.</small></p></div>
    </div>
  </aside>
</section>

<section class="rv-shell rv-section rv-compact-section" id="product">
  <div class="rv-section-head"><div class="rv-eyebrow">ONE PRODUCT</div><h2>SeenRelay is a validation-reuse layer. The audit is how you decide whether to use it.</h2><p>It is not a browser, search engine, truth oracle or general agent memory. It targets repeated, deterministic, expensive, read-only validation. Native controls win whenever they solve the same problem better.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Measure</h3><p>Shadow mode watches the validation path while every authoritative call still runs. It finds exact recurrence and the cost surface before any suppression is enabled.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Reuse safely</h3><p>Eligible work can use exact local/in-flight reuse, caller-owned private L1 and source-native confirmation before optional shared evidence.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Fail open</h3><p>If freshness, identity, policy or infrastructure is insufficient, the application performs the original validation normally.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="audit">
  <div class="rv-section-head">
    <div class="rv-eyebrow">FREE SHADOW AUDIT</div>
    <h2>Find out where your agent fleet is wasting time or provider spend on repeated validation.</h2>
    <p>Run the free shadow audit on the workload you already have. Every original call remains authoritative. The report must return <b>USE · DO NOT USE · INSUFFICIENT EVIDENCE</b> rather than forcing an integration.</p>
  </div>
  <div class="rv-flow-list" aria-label="Shadow audit sequence">
    <div><span>1</span><p><b>Run normally</b><small>Keep the workload and every authoritative validation unchanged.</small></p></div>
    <div><span>2</span><p><b>Measure recurrence</b><small>Identify deterministic read-only work that repeats enough to matter.</small></p></div>
    <div><span>3</span><p><b>Price the waste</b><small>Compare full validation cost and latency with stronger local/source/provider-native controls and SeenRelay overhead.</small></p></div>
    <div><span>4</span><p><b>Promote narrowly</b><small>Enable reuse only on workloads that preserve outcomes and show positive economics.</small></p></div>
  </div>
  <div class="rv-adopt">
    <div class="rv-mode-card">
      <div class="rv-segment" role="tablist" aria-label="Audit installation mode"><button type="button" role="tab" aria-selected="true" data-mode-button="human">Developer</button><button type="button" role="tab" aria-selected="false" data-mode-button="agent">Coding agent</button></div>
      <div class="rv-mode-copy"><h3>Install measurement, not faith.</h3><p>The first deployment does not suppress the authoritative operation. Shared CHECK is optional and caller-owned local/private or source-native controls stay ahead whenever they are stronger or cheaper.</p></div>
    </div>
    <div class="rv-console" aria-live="polite">
      <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>free shadow audit</span></div>
      <div class="rv-install-view active" data-install-view="human">
        <div class="rv-step"><span>1</span><div><h4>Install</h4><div class="rv-code"><pre id="npm-install">${npmCommand}</pre><button class="rv-copy" type="button" data-copy-target="npm-install">Copy</button></div><div class="rv-code"><pre id="pip-install">${pipCommand}</pre><button class="rv-copy" type="button" data-copy-target="pip-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Wrap one existing MCP-style client</h4><div class="rv-code"><pre id="ambient-example">import { ambientMcpClient } from 'seenrelay/ambient';\n\nconst client = ambientMcpClient(rawMcpClient);\n// run the existing workload normally\nconsole.log(client.seenRelayAmbient.getReport());</pre><button class="rv-copy" type="button" data-copy-target="ambient-example">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Promote only a measured winner</h4><p>Use Shadow Proof / the hostile economics evaluator before enabling bounded reuse.</p></div></div></div>
      </div>
      <div class="rv-install-view" data-install-view="agent" id="agent-audit">
        <div class="rv-step"><span>1</span><div><h4>Install the SeenRelay Agent Skill</h4><div class="rv-code"><pre id="skill-install">${esc(skillCommand)}</pre><button class="rv-copy" type="button" data-copy-target="skill-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Give it to your coding agent</h4><div class="rv-code"><pre id="agent-prompt">${esc(auditPrompt)}</pre><button class="rv-copy" type="button" data-copy-target="agent-prompt">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Keep only measured value</h4><p>The skill must leave unsupported paths unchanged and should return DO NOT USE when native controls or sparse recurrence make SeenRelay uneconomic.</p></div></div></div>
      </div>
    </div>
  </div>
</section>

<section class="rv-shell rv-section rv-compact-section" id="resources">
  <div class="rv-section-head"><div class="rv-eyebrow">FREE DIAGNOSTIC TOOL</div><h2>Own a site or API instead of an agent fleet?</h2><p>The AI Visit Efficiency checker is a separate free diagnostic. It inspects one bounded root response and recommends native HTTP fixes first. A surface scan never establishes SeenRelay workload fit.</p></div>
  <div class="rv-path-grid">
    <article class="rv-path-card"><span class="rv-number">A</span><div class="rv-eyebrow">I own a site or API</div><h3>Check the public HTTP surface.</h3><p>Use the free readiness tool for Cache-Control, validators and machine-facing evidence. It is not the SeenRelay runtime product.</p><div class="rv-actions"><a class="rv-button" href="/readiness">Open free site tool</a></div></article>
    <article class="rv-path-card primary-path"><span class="rv-number">B</span><div class="rv-eyebrow">I run agents or a fleet</div><h3>Measure repeated expensive validation.</h3><p>This is the product path: audit the real workload, prove economics, then promote only eligible read-only validation.</p><div class="rv-actions"><a class="rv-button primary" href="#audit">Run the free shadow audit</a></div></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">BOUNDARY</div><h2>Validation reuse for agent fleets — not a replacement for the source.</h2><p>Hosted SeenRelay still exposes exactly CHECK and OBSERVE. It does not independently browse or decide truth. Caller-owned private L1 can create fleet value without public network coverage, and the original validation remains the fallback.</p></div>
  <div class="rv-contract-list">
    <article><b>Source authority preserved</b><span>Unknown, stale, contested or ineligible work runs the authoritative path.</span></article>
    <article><b>Native-first</b><span>ETag, Last-Modified, provider caches and equivalent authoritative controls beat SeenRelay whenever they solve the same problem better.</span></article>
    <article><b>Optional network</b><span>Shared CHECK can add evidence where permitted, but the product does not require external network coverage to start.</span></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="/fleet">Product details</a><a class="rv-button" href="/clients">Integrations</a><a class="rv-button" href="/trust">Trust model</a></div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">START WITH YOUR OWN COST</div><h2>Measure one expensive repeated validation. Keep SeenRelay only if the math wins.</h2><p>No network effect is required for the first value: exact local/in-flight reuse, caller-owned private L1 and source-native confirmation can already sit ahead of the original validation.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="#audit">Measure my workload</a><a class="rv-button" href="/economics">See economics</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
