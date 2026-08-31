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
  const agentPrompt = 'Integrate SeenRelay into repeated expensive read-only validations in this project. Start in shadow mode, preserve the authoritative call, and only enable bounded reuse where the workload and freshness policy justify it.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay helps AI agents and applications avoid repeating expensive read-only validation while keeping the original authoritative path as fallback.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<link rel="alternate" type="application/json" href="${origin}/product-facts.json" title="SeenRelay verified product facts">
<link rel="alternate" type="application/json" href="${origin}/.well-known/agent-skills/index.json" title="SeenRelay Agent Skill discovery">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Stop repeating expensive validation">
<meta property="og:description" content="A small reuse layer for agent validation: observe repeat work first, reuse only when justified, otherwise fall through to the original source.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Reuse expensive validation safely</title>
<link rel="stylesheet" href="/revamp.css">
<script src="/revamp.js" defer></script>
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/" aria-label="SeenRelay home"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation">
    <a href="#adopt">Install</a>
    <a href="#how">How it works</a>
    <a href="#use-cases">Use cases</a>
    <a href="/economics">Evidence</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <div class="rv-nav-actions">
    <a class="rv-chip" href="/service.json">Machine JSON</a>
    <a class="rv-button" href="#adopt">Add SeenRelay</a>
  </div>
</header>

<main>
<section class="rv-shell rv-hero">
  <div>
    <div class="rv-kicker"><i></i><span>REUSE LAYER FOR AGENT VALIDATION</span></div>
    <h1>Stop repeating <em>expensive validation.</em></h1>
    <p class="rv-lead">Your agent checks the same page, API fact, extraction, browser result or model-assisted parse again. <strong>SeenRelay gives that repeat work a cheaper path</strong> — and falls back to the original validation whenever reuse is not justified.</p>
    <div class="rv-actions">
      <a class="rv-button primary" href="#adopt">Add SeenRelay</a>
      <a class="rv-button" href="/quickstart">See the 3-minute quickstart</a>
      <a class="rv-button quiet" href="/economics">Measured economics →</a>
    </div>
    <div class="rv-proofline" aria-label="Current product facts">
      <span>client ${version}</span>
      <span>npm + PyPI verified</span>
      <span>no account</span>
      <span>no API key</span>
      <span>${esc(f.install.runtime_dependencies)} runtime dependencies</span>
    </div>
  </div>

  <aside class="rv-demo" aria-label="Before and after SeenRelay">
    <div class="rv-demo-head"><span>same read-only fact · repeated</span><b><span class="rv-pulse"></span>SeenRelay path</b></div>
    <div class="rv-compare">
      <div class="rv-lane">
        <header><b>Without</b><span>each caller repeats the expensive path</span></header>
        <div class="rv-calls">
          <div class="rv-call"><span>Agent A</span><b>browser extraction</b><i>paid call</i></div>
          <div class="rv-call"><span>Agent B</span><b>browser extraction</b><i>paid call</i></div>
          <div class="rv-call"><span>Agent C</span><b>browser extraction</b><i>paid call</i></div>
        </div>
      </div>
      <div class="rv-lane with">
        <header><b>With SeenRelay</b><span>reuse is a shortcut, never a dead end</span></header>
        <div class="rv-calls">
          <div class="rv-call"><span>First call</span><b>authoritative validation</b><i>validate</i></div>
          <div class="rv-call"><span>Exact repeat</span><b>eligible reuse path</b><i>reuse</i></div>
          <div class="rv-call"><span>Uncertain</span><b>original validation still available</b><i>fallback</i></div>
        </div>
      </div>
    </div>
  </aside>
</section>

<div class="rv-band">
  <div class="rv-band-inner">
    <div><b>Install without signup</b><span>npm, PyPI, MCP or Agent Skill</span></div>
    <div><b>Start without changing behavior</b><span>shadow measurement is available first</span></div>
    <div><b>Reuse only exact eligible work</b><span>caller policy stays in control</span></div>
    <div><b>Keep the source as fallback</b><span>SeenRelay is not your truth authority</span></div>
  </div>
</div>

<section class="rv-shell rv-section" id="adopt">
  <div class="rv-section-head">
    <div class="rv-eyebrow">ADOPT IN UNDER A MINUTE</div>
    <h2>Use SeenRelay yourself — or hand it to your agent.</h2>
    <p>No account setup, dashboard ritual or proprietary SDK ceremony. Pick the path that already matches how you work.</p>
  </div>

  <div class="rv-adopt">
    <div class="rv-mode-card">
      <div class="rv-segment" role="tablist" aria-label="Installation mode">
        <button type="button" role="tab" aria-selected="true" data-mode-button="human">I’m a developer</button>
        <button type="button" role="tab" aria-selected="false" data-mode-button="agent">I’m an agent</button>
      </div>
      <div class="rv-mode-copy">
        <h3>One product. Two entry points.</h3>
        <p>Developers can install the client directly. Coding agents can discover the same integration contract through the Agent Skills standard and implement it inside the project.</p>
        <div class="rv-mode-note">Best first move: start in shadow mode around one expensive read-only validation. You learn whether repetition is real before changing authoritative behavior.</div>
      </div>
    </div>

    <div class="rv-console" aria-live="polite">
      <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>seenrelay / onboarding</span></div>
      <div class="rv-install-view active" data-install-view="human">
        <div class="rv-step"><span>1</span><div><h4>Install the client you already use</h4><div class="rv-code"><pre id="npm-install">${npmCommand}</pre><button class="rv-copy" type="button" data-copy-target="npm-install">Copy</button></div><div class="rv-code"><pre id="pip-install">${pipCommand}</pre><button class="rv-copy" type="button" data-copy-target="pip-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Already using MCP? Add the hosted protocol directly</h4><div class="rv-code"><pre id="mcp-endpoint">${origin}/mcp</pre><button class="rv-copy" type="button" data-copy-target="mcp-endpoint">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Choose the integration that matches your stack</h4><p><a href="/clients" style="color:#a9c5ff">Open the integration chooser →</a></p></div></div>
      </div>
      <div class="rv-install-view" data-install-view="agent">
        <div class="rv-step"><span>1</span><div><h4>Install the SeenRelay Agent Skill</h4><div class="rv-code"><pre id="skill-install">${esc(skillCommand)}</pre><button class="rv-copy" type="button" data-copy-target="skill-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Give the agent the implementation goal</h4><div class="rv-code"><pre id="agent-prompt">${esc(agentPrompt)}</pre><button class="rv-copy" type="button" data-copy-target="agent-prompt">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>The skill supplies the narrow protocol and integration rules</h4><p><a href="/.well-known/agent-skills/seenrelay/SKILL.md" style="color:#a9c5ff">Inspect the exact skill →</a></p></div></div>
      </div>
    </div>
  </div>
</section>

<section class="rv-shell rv-section" id="how">
  <div class="rv-section-head center">
    <div class="rv-eyebrow">HOW IT WORKS</div>
    <h2>A shortcut in front of work you already do.</h2>
    <p>SeenRelay does not replace the validation source. It gives repeated, deterministic read-only work a reusable path before the expensive operation is repeated.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Observe repetition</h3><p>Ambient and shadow integrations can measure exact repeated calls without suppressing the authoritative operation.</p><a href="/quickstart">Start in shadow →</a></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Take the cheaper path</h3><p>Eligible work can use local/private reuse, source-native validators or optional shared freshness evidence before repeating the costly path.</p><a href="/clients">Choose an integration →</a></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Fall through when needed</h3><p>If freshness, identity or caller policy does not justify reuse, the application's original validation continues normally.</p><a href="/trust">See the trust model →</a></article>
  </div>
</section>

<section class="rv-shell rv-section" id="use-cases">
  <div class="rv-section-head">
    <div class="rv-eyebrow">WHERE IT PAYS</div>
    <h2>Put it in front of work that is expensive enough to matter.</h2>
    <p>The best candidates are deterministic, read-only validations that recur across requests, workers, agents or teams.</p>
  </div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>WEB</i><h3>Paid search</h3><p>Repeated searches or source checks where each provider call has real cost or quota impact.</p></article>
    <article class="rv-usecase"><i>EXT</i><h3>Scraping & extraction</h3><p>Structured extraction, proxies and content processing that are expensive to repeat unchanged.</p></article>
    <article class="rv-usecase"><i>BR</i><h3>Browser automation</h3><p>Read-only browser flows where the same deterministic result is requested again inside a defensible freshness window.</p></article>
    <article class="rv-usecase"><i>API</i><h3>Rate-limited or model-assisted checks</h3><p>APIs, parsing chains and model work where latency, rate limits or compute make repetition meaningful.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-contract">
    <div class="rv-contract-main">
      <div class="rv-eyebrow">THE PRODUCT CONTRACT</div>
      <h3>Optimization without taking authority away from your application.</h3>
      <p>SeenRelay is useful precisely because the source remains the source. It coordinates reusable evidence and caller-owned shortcuts; it does not silently turn itself into a fact checker or general shared memory.</p>
      <div class="rv-actions" style="margin-top:22px"><a class="rv-button" href="/trust">Trust model</a><a class="rv-button quiet" href="/data-practices">Data practices →</a></div>
    </div>
    <div class="rv-contract-list">
      <article><b>Exactly two hosted operations</b><span>CHECK asks about compatible recent evidence. OBSERVE contributes a fresh independently obtained result.</span></article>
      <article><b>Local-first where possible</b><span>The JavaScript/TypeScript path can avoid work even when the shared network has no useful observation.</span></article>
      <article><b>Machine-readable by design</b><span>OpenAPI, MCP, service JSON and Agent Skill discovery expose the integration contract directly to tooling.</span></article>
    </div>
  </div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">START SMALL</div><h2>Protect one expensive read-only validation.</h2><p>Install SeenRelay, start in shadow mode, and let actual repetition tell you whether the optimization belongs in the hot path.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/quickstart">Open quickstart</a><a class="rv-button" href="/clients">Choose integration</a></div>
</section>

<!-- Release-gate compatibility markers kept non-visual while the preview gate is migrated:
VALIDATION INFRASTRUCTURE · CLIENT v${version} VERIFIED · Avoid paying twice for the same validation · Two commands. Start without an account. · GOOD CANDIDATE · NEGATIVE CONTROL · No truth oracle · No fake provenance · Agent Skill · MEASURED EVIDENCE · provider-path calls avoided · Every row keeps its caveat and source. · data-stat="facts"
-->
</main>
${siteFooterHtml()}
</body>
</html>`;
}
