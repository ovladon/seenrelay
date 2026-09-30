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
  const version = esc(publicProductFacts.install.client_version);
  const scanCommand = esc(publicProductFacts.install.scan_command);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay measures repeated expensive read-only execution, keeps stronger native controls first, and avoids only the work that proves safe positive value.">
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
<meta property="og:title" content="SeenRelay — Stop paying twice for the same read-only work.">
<meta property="og:description" content="Measure what repeats, keep native controls first, and skip only the calls that earn a safe economic shortcut.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Stop paying twice for the same read-only work.</title>
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
    <a href="/clients">Integrations</a>
    <a href="/fleet">Proof</a>
    <a href="/trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="#how">How it works</a><a href="/clients">Integrations</a><a href="/fleet">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-button primary" href="#start">Start locally</a></div>
</header>

<main id="main-content">

<section class="rv-shell rv-hero rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>EXECUTION ECONOMICS · CLIENT ${version}</span></div>
    <h1>Stop paying twice for the same read-only work.</h1>
    <p class="rv-lead">SeenRelay sits around expensive read-only calls, measures what actually repeats, keeps stronger native controls first, and avoids only the work that proves worth avoiding.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="#start">Start locally</a>
      <a class="rv-button" href="/clients#instrument">Install with an agent</a>
    </div>
    <div class="rv-proofline" aria-label="SeenRelay operating boundary">
      <span>local first</span><span>native controls first</span><span>fail open</span><span>exact read-only paths</span><span>remove if net value ≤ 0</span>
    </div>
  </div>

  <aside class="rv-demo rv-verdict-demo" aria-label="SeenRelay execution decision">
    <div class="rv-demo-head"><span>ONE DECISION</span><b>execute again or reuse safely?</b></div>
    <div class="rv-verdict-card">
      <div class="rv-verdict-top"><span>BASELINE</span><strong>repeat the provider work</strong></div>
      <div class="rv-verdict-top"><span>SEENRELAY</span><strong>execute only when the shortcut has not earned trust</strong></div>
      <p>Shadow measurement keeps the original authoritative call. Active protection is bounded, reversible and audited.</p>
    </div>
  </aside>
</section>

<section class="rv-band" aria-label="SeenRelay value">
  <div class="rv-band-inner">
    <div><b>Measure first</b><span>find real recurrence</span></div>
    <div><b>Prefer native</b><span>keep cheaper built-in controls</span></div>
    <div><b>Protect narrowly</b><span>skip only qualified work</span></div>
    <div><b>Prove value</b><span>record avoided execution and overhead</span></div>
  </div>
</section>

<section class="rv-shell rv-section" id="how">
  <div class="rv-section-head">
    <div><div class="rv-eyebrow">AUTOMATIC LOOP</div><h2>Observe. Learn. Decide. Receipt.</h2></div>
    <p>The goal is one control loop, not a collection of manual benchmark steps. <a href="/substrate">Detailed execution model →</a></p>
  </div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>01</i><h3>Observe</h3><p>Run the application normally and measure exact read-only work without changing behavior.</p></article>
    <article class="rv-usecase"><i>02</i><h3>Learn</h3><p>Compare recurrence, provider cost, native controls, freshness and authoritative agreement.</p></article>
    <article class="rv-usecase"><i>03</i><h3>Qualify</h3><p>Only a bounded path with positive measured economics can advance beyond shadow.</p></article>
    <article class="rv-usecase"><i>04</i><h3>Execute or skip</h3><p>Unsafe, stale, changing or native-dominated work still executes normally. Qualified work can avoid the repeated call.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="where">
  <div class="rv-section-head"><div><div class="rv-eyebrow">WHERE COST HIDES</div><h2>Optimize execution, not just tokens.</h2></div></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>WEB</i><h3>Browser / scrape / extract</h3><p>Metered rendering and extraction jobs.</p></article>
    <article class="rv-usecase"><i>TOOL</i><h3>Agent tool calls</h3><p>Exact read-only calls across workers and runtimes.</p></article>
    <article class="rv-usecase"><i>API</i><h3>Paid APIs</h3><p>Repeated status, metadata, search and validation reads.</p></article>
    <article class="rv-usecase"><i>OPS</i><h3>Polling / CI / monitors</h3><p>Recurring deterministic checks where native controls do not already win.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="proof">
  <div class="rv-section-head">
    <div><div class="rv-eyebrow">CONTROLLED MECHANICS PROOF</div><h2>We can reduce provider work when exact overlap exists.</h2></div>
    <p>These are bounded first-party mechanism tests, not customer ROI or a universal savings claim.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card accent">
      <span class="rv-number">18 → 9</span>
      <h3>Firecrawl credits</h3>
      <p>Controlled cross-worker browser evidence reduced provider credits while matching authoritative results. In the bounded browser overlap run, 6 browser jobs became 3 jobs + 3 follower reuses.</p>
      <a href="/fleet#measured-proof">Evidence →</a>
    </article>
    <article class="rv-card">
      <span class="rv-number">5 → 1</span>
      <h3>Concurrent provider jobs</h3>
      <p>Five simultaneous compatible callers shared one provider execution in a controlled test.</p>
      <a href="/fleet#measured-proof">Evidence →</a>
    </article>
    <article class="rv-card">
      <span class="rv-number">USE / DO NOT USE</span>
      <h3>SeenRelay may reject itself</h3>
      <p>If recurrence is weak, native controls win, safety fails or economics are negative, the correct result is not to deploy it.</p>
      <a href="/quickstart">Decision path →</a>
    </article>
  </div>
  <div class="rv-trust-note"><b>Controlled proof is not customer savings.</b> Net value requires a measured workload, explicit provider-cost provenance and SeenRelay overhead.</div>
</section>

<section class="rv-shell rv-section" id="reject">
  <div class="rv-section-head">
    <div><div class="rv-eyebrow">SELF-REJECTING BY DESIGN</div><h2>Sometimes the right answer is not to use SeenRelay.</h2></div>
    <p>That is a valid result, not a failed sale.</p>
  </div>
  <div class="rv-stack">
    <article><h3>Native control already wins</h3><p>Provider cache, ETag / 304, batching or a local exact cache removes the same cost more cheaply.</p></article>
    <article><h3>The calls do not actually repeat</h3><p>Structural traffic is not enough. Exact compatible recurrence must exist.</p></article>
    <article><h3>The operation must stay independent</h3><p>Mutations and required independent samples remain outside generic reuse.</p></article>
    <article><h3>Audit disagrees</h3><p>A mismatch, contested evidence or unsafe freshness state keeps the original authoritative execution.</p></article>
  </div>
</section>

<section class="rv-shell rv-final" id="start">
  <div>
    <div class="rv-eyebrow">START LOCALLY</div>
    <h2>One command. No source upload.</h2>
    <p>The scanner is a local prescreen, not a savings verdict. If it finds a plausible candidate, instrument the narrowest supported path, run normal traffic in shadow, then keep SeenRelay only when the measured verdict and economics justify it.</p>
    <div class="rv-code"><pre id="hero-scan-command">${scanCommand}</pre><button class="rv-copy" type="button" data-copy-target="hero-scan-command">Copy</button></div>
    <p class="rv-small">USE / DO NOT USE / INSUFFICIENT EVIDENCE · no SeenRelay API key currently required · static scan cannot authorize reuse.</p>
  </div>
  <div class="rv-actions">
    <a class="rv-button primary" href="/quickstart">Start locally</a>
    <a class="rv-button" href="/clients#instrument">Install with an agent</a>
  </div>
</section>

</main>
${siteFooterHtml()}
</body>
</html>`;
}
