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
  const auditCommand = esc('npx seenrelay audit .');

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
<meta property="og:title" content="SeenRelay — Decide when you actually need to look again.">
<meta property="og:description" content="Measure what repeats, keep native controls first, and skip only the calls that earn a safe economic shortcut.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Decide when you actually need to look again.</title>
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
    <a href="/proof">Proof</a>
    <a href="/trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-button primary" href="#start">Start locally</a></div>
</header>

<main id="main-content">

<section class="rv-shell rv-hero rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>EXECUTION ECONOMICS · CLIENT ${version}</span></div>
    <h1>Decide when you actually need to look again.</h1>
    <p class="rv-lead">SeenRelay sits around expensive read-only calls, measures what actually repeats, keeps stronger native controls first, and avoids only the work that proves worth avoiding.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="#start">Start locally</a>
      <a class="rv-button" href="/clients#instrument">Install with an agent</a>
    </div>
    <div class="rv-proofline" aria-label="SeenRelay operating boundary">
      <span>local first</span><span>native controls first</span><span>fail open</span><span>exact read-only paths</span><span>remove if net value ≤ 0</span>
    </div>
  </div>

  <aside class="rv-demo rv-verdict-demo" aria-label="SeenRelay real live monitoring proof">
    <div class="rv-demo-head"><span>REAL LIVE MONITORING TEST</span><b>same event state · paid briefing fan-out</b></div>
    <div class="rv-verdict-card">
      <div class="rv-verdict-top"><span>BASELINE</span><strong>4 paid OpenAI web-search briefings · $0.11220531</strong></div>
      <div class="rv-verdict-top"><span>SEENRELAY</span><strong>1 paid briefing · $0.01122502</strong></div>
      <div class="rv-verdict-top"><span>AVOIDED</span><strong>$0.10098029 · 89.996%</strong></div>
      <p>Real Hacker News event state, controlled first-party run. Across 3/3 repeats the gross reduction was 70.95%–90.00%. When the event fingerprint changed, a fresh paid briefing was forced before reuse resumed.</p>
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
    <div><div class="rv-eyebrow">AUTOMATIC LOOP</div><h2>Observe. Learn. Decide. Savings Report.</h2></div>
    <p>The goal is one control loop, not a collection of manual benchmark steps. <a href="/substrate">Detailed execution model →</a></p>
  </div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>01</i><h3>Observe</h3><p>Run the application normally and measure exact read-only work without changing behavior.</p></article>
    <article class="rv-usecase"><i>02</i><h3>Learn</h3><p>Compare recurrence, provider cost, native controls, freshness and authoritative agreement.</p></article>
    <article class="rv-usecase"><i>03</i><h3>Qualify</h3><p>Only a bounded path with positive measured economics can advance beyond shadow.</p></article>
    <article class="rv-usecase"><i>04</i><h3>Execute or skip</h3><p>Unsafe, stale, changing or native-dominated work still executes normally. Qualified work can avoid the repeated call.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="savings-report-terms">
  <div class="rv-trust-note"><b>Currently free:</b> SeenRelay billing is OFF and there is no checkout or payment obligation. A <b>Savings Report</b> is measurement evidence showing avoided work and its cost provenance; it is <b>not</b> an invoice, bill, charge or payment receipt.</div>
</section>

<section class="rv-shell rv-section" id="where">
  <div class="rv-section-head"><div><div class="rv-eyebrow">WHERE COST HIDES</div><h2>Optimize execution, not just tokens.</h2></div></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>WEB</i><h3>Browser / scrape / extract</h3><p>Metered rendering and extraction jobs.</p></article>
    <article class="rv-usecase"><i>TOOL</i><h3>Agent tool calls</h3><p>Exact read-only calls across workers and runtimes.</p></article>
    <article class="rv-usecase"><i>API</i><h3>Paid APIs</h3><p>Repeated status, metadata, search and validation reads.</p></article>
    <article class="rv-usecase"><i>OPS</i><h3>Polling / CI / monitors</h3><p>Recurring deterministic checks where native controls do not already win.</p></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/use-cases">Explore the full use-case atlas</a></div>
</section>

<section class="rv-shell rv-section" id="proof">
  <div class="rv-section-head">
    <div><div class="rv-eyebrow">REAL PROVIDER PROOF</div><h2>Shared evidence. Independent reasoning. Lower provider spend.</h2></div>
    <p>Our strongest current first-party operating example keeps all department analyses independent while sharing the expensive evidence collection they are explicitly allowed to rely on. Live event monitoring remains the repeatability/freshness proof. Mechanism-only tests stay labeled separately from workload fit and customer ROI.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card accent">
      <span class="rv-number">66.30%</span>
      <h3>8-agent operating workload</h3>
      <p>Eight department agents across two tenant identities performed useful current ecosystem research. Baseline provider cost was $0.16499684. The SeenRelay arm preserved all eight role analyses, reduced paid web-search actions from 13 to 4, and cost $0.05560972 — $0.10938712 gross avoided.</p>
      <p class="rv-small">First-party real operating workload + explicitly synthetic external-client rehearsal. Not customer ROI or net customer savings; local coordination/integration overhead was not monetized.</p>
      <a href="/case-studies/company-fleet">Read the 8-agent case study →</a>
    </article>
    <article class="rv-card accent">
      <span class="rv-number">79.61%</span>
      <h3>Real live event monitoring</h3>
      <p>Across 3/3 runs on a real current Hacker News event, four paid OpenAI web-search briefings became one while the event fingerprint stayed unchanged. Gross avoided cost was $0.05462206–$0.10098029 per four-observation group.</p>
      <a href="/proof">Live-event evidence →</a>
    </article>
    <article class="rv-card">
      <span class="rv-number">3/3</span>
      <h3>Refresh when the event changes</h3>
      <p>Using two real current HN events in A,A,B,B order, the changed fingerprint forced a fresh paid briefing before reuse resumed. Four paid briefings became two; mean gross reduction was 49.93%.</p>
      <a href="/proof">Transition evidence →</a>
    </article>
    <article class="rv-card">
      <span class="rv-number">$1.44</span>
      <h3>Hosted-resource coalescing</h3>
      <p>Four compatible 64 GB sessions became one: $1.9241253 → $0.4820025. <b>Mechanism-only:</b> the exact SHA-256 benchmark could be done locally, so this card isolates resource coalescing rather than workload fit.</p>
      <a href="/proof">Mechanism evidence →</a>
    </article>
  </div>
  <div class="rv-trust-note"><b>Controlled proof is not customer savings.</b> First-party operating proof is not external customer ROI either. Mechanism proof is not best-baseline proof either. Proof Atlas now labels whether the tested expensive tool itself survived local/source/native alternatives. We also publish NO PASS results. <a href="/proof">See the complete Proof Atlas →</a></div>
</section>

<section class="rv-shell rv-section" id="trust">
  <div class="rv-section-head">
    <div><div class="rv-eyebrow">SAFE TO TRY · VERIFY BEFORE YOU TRUST</div><h2>Start with zero authority over your workload.</h2></div>
    <p>SeenRelay is designed so evaluation does not require a trust leap.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Shadow first</h3><p>Measurement keeps every authoritative operation running. Installing SeenRelay does not automatically authorize reuse.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Fail open</h3><p>If the wrapper, private store or relay fails, execution falls back to the validation your application already intended to perform.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>No hidden source access</h3><p>The SeenRelay service does not browse your source, fetch the fact for you, or use an LLM as a truth oracle. Credential-bearing source identities are rejected.</p></article>
    <article class="rv-card"><span class="rv-number">04</span><h3>Local scan uploads nothing</h3><p><code>npx seenrelay scan</code> runs locally, does not upload source code, does not modify the project and cannot enable reuse.</p></article>
    <article class="rv-card"><span class="rv-number">05</span><h3>Mutations stay authoritative</h3><p>Generic SeenRelay does not infer that destructive or mutating work is safe to suppress. Only explicitly reviewed read-only paths can qualify.</p></article>
    <article class="rv-card"><span class="rv-number">06</span><h3>Easy to remove</h3><p>Remove the wrapper/preflight and keep the original call. No application-state export is required to leave.</p></article>
  </div>
  <div class="rv-trust-note"><b>Security claim boundary:</b> these are verifiable technical controls, not a claim that vulnerabilities are impossible or a third-party security certification. Inspect <a href="/trust">Trust</a>, <a href="/trust.json">Trust JSON</a>, <a href="/data-practices">Data Practices</a>, the public <a href="https://github.com/ovladon/seenrelay/blob/main/SECURITY.md">security policy</a> and <a href="https://github.com/ovladon/seenrelay/blob/main/docs/THREAT_MODEL.md">threat model</a>.</div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/agents">For autonomous agents</a><a class="rv-button" href="/trust">Verify the security posture</a></div>
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
    <p>The audit command scans a project locally or evaluates an existing compatible trace or savings ledger. A project scan is only a prescreen, and trace candidates are not proven savings. Keep the original authoritative calls during shadow measurement and deploy SeenRelay only if it beats the strongest applicable native control after overhead.</p>
    <div class="rv-code"><pre id="hero-audit-command">${auditCommand}</pre><button class="rv-copy" type="button" data-copy-target="hero-audit-command">Copy</button></div>
    <p class="rv-small">USE / DO NOT USE / INSUFFICIENT EVIDENCE · no SeenRelay API key currently required · local audit cannot authorize reuse.</p>
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
