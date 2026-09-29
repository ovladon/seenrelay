import { siteFooterHtml } from './public-facts-view.js';

export function commercialPage(origin: string): string {
  const issueUrl = 'https://github.com/ovladon/seenrelay/issues/new?template=commercial-pilot.yml';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay commercial pilots: measure one real workload, compare native controls, activate only if exact safe reuse produces positive economics.">
<link rel="canonical" href="${origin}/commercial">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Commercial pilots</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/substrate">Platform</a><a href="/fleet">Evidence</a><a href="/clients">Integrations</a><a href="/trust">Trust</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/">Home</a><a href="/substrate">Platform</a><a href="/fleet">Evidence</a><a href="/clients">Integrations</a><a href="/quickstart">Docs</a></nav></details>
  <div class="rv-nav-actions"><a class="rv-button primary" href="${issueUrl}">Start a pilot inquiry</a></div>
</header>

<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">COMMERCIAL PATH · MEASURED BEFORE ACTIVATION</div>
  <h1>Buy a measured result, not a savings promise.</h1>
  <p>SeenRelay's hosted CHECK/OBSERVE service remains free during bootstrap. Commercial work is a separate pilot/integration engagement: identify one expensive read-only path, measure native controls and real overlap, then activate only if the workload proves safe positive value.</p>
  <div class="rv-actions"><a class="rv-button primary" href="${issueUrl}">Start a commercial pilot inquiry</a><a class="rv-button" href="/#start">Run the free audit first</a></div>
  <p class="rv-small">The GitHub inquiry is public. Do not include secrets or customer data. For private contact, use the repository owner's contact options on <a href="https://github.com/ovladon">GitHub</a>.</p>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">TWO PATHS</div><h2>Free discovery. Paid implementation when there is something worth implementing.</h2></div><p>This keeps the commercial incentive aligned with the product's evidence discipline.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">$0</span><h3>Self-service savings audit</h3><p>Static scan, trace census, OTLP census and shadow measurement remain available without a SeenRelay account or API fee. The output may correctly be <b>DO NOT USE</b>.</p><a href="/#start">Start free →</a></article>
    <article class="rv-card"><span class="rv-number">PILOT</span><h3>Measured production evaluation</h3><p>Scope one read-only workload, instrument natural traffic, compare the strongest native/local baseline, establish exact result compatibility and quantify provider/capacity economics.</p></article>
    <article class="rv-card"><span class="rv-number">DEPLOY</span><h3>Bounded integration</h3><p>If evidence is positive, integrate only the reviewed operation, retain fail-open fallback, capture actual follower-reuse receipts and measure net value after overhead.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">PILOT DELIVERABLE</div><h2>A commercial pilot ends with an auditable decision.</h2></div><p>No universal percentage is promised.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><h3>Baseline</h3><p>Protected call volume, native/source/provider controls, latency, provider units and marginal cost where provenance exists.</p></article>
    <article class="rv-card"><h3>Safety</h3><p>Exact coordinate definition, side-effect class, result compatibility, freshness policy and explicit excluded operations.</p></article>
    <article class="rv-card accent"><h3>Economics</h3><p>Actual avoided executions after activation, gross avoided provider cost or capacity, coordination overhead and net result.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">BEST-FIT PILOTS</div><h2>Start where another look is expensive.</h2></div><p>Browser/extraction, paid APIs, agent fleets, rate-limited providers, CI validation and selected IoT/edge reads are stronger candidates than cheap one-off fetches.</p></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>01</i><h3>Cross-worker overlap</h3><p>Separate processes can issue the same exact read while the leader is still running.</p></article>
    <article class="rv-usecase"><i>02</i><h3>Metered work</h3><p>Each provider call consumes credits, money, rate limit or constrained concurrency.</p></article>
    <article class="rv-usecase"><i>03</i><h3>Expensive validation chains</h3><p>Browser, extraction, parsing, models or multi-step downstream work can be avoided by one safe authoritative result.</p></article>
    <article class="rv-usecase"><i>04</i><h3>IoT / edge validation</h3><p>Read-only state or metadata checks where device-native retained/subscription state does not already solve the same freshness question.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-trust-note"><b>Current billing boundary:</b> self-serve service billing is disabled in the runtime. A commercial pilot is a separately agreed engineering/evaluation engagement, not a hidden per-CHECK fee. SeenRelay will not silently turn a free protocol call into billable usage.</div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="${issueUrl}">Open pilot inquiry</a><a class="rv-button" href="/economics">Review economics method</a><a class="rv-button" href="/trust">Review trust posture</a></div>
</section>
</main>
${siteFooterHtml()}
</body></html>`;
}
