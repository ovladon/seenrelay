import { siteFooterHtml } from './public-facts-view.js';

function shell(title: string, description: string, canonical: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<title>${title}</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/substrate">Platform</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/commercial">Pilot</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/">Home</a><a href="/substrate">Platform</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/commercial">Pilot</a></nav></details>
  <div class="rv-nav-actions"><a class="rv-button primary" href="/#start">Run free audit</a></div>
</header>
<main id="main-content">${body}</main>
${siteFooterHtml()}
</body>
</html>`;
}

export function aiAgentCostOptimizationPage(origin: string): string {
  const body = `
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">AI AGENT COST OPTIMIZATION</div>
  <h1>Cut the tool work your agents pay for twice.</h1>
  <p>Token optimization is only part of the bill. Agents also spend money and capacity on browser jobs, search, extraction, APIs and repeated validation. SeenRelay measures exact repeated read-only execution and coordinates only the paths that prove safe positive value.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Run free audit</a><a class="rv-button" href="/commercial">Commercial pilot</a></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">18 → 9</span><h3>Measured provider credits</h3><p>Controlled cross-worker browser evidence cut Firecrawl credits from 18 to 9 with matching authoritative results.</p></article>
    <article class="rv-card"><span class="rv-number">5 → 1</span><h3>Concurrent provider jobs</h3><p>Five simultaneous callers shared one provider execution with four follower reuses.</p></article>
    <article class="rv-card"><span class="rv-number">$0</span><h3>Audit first</h3><p>The audit preserves authoritative calls. If the workload does not justify SeenRelay, the correct result is DO NOT USE.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">WHERE THE COST HIDES</div><h2>Optimize execution, not just tokens.</h2></div></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>01</i><h3>Duplicate tool calls</h3><p>Same exact read-only tool call across agents or workers.</p></article>
    <article class="rv-usecase"><i>02</i><h3>Browser / extraction</h3><p>Metered browsing, scraping, rendering and extraction.</p></article>
    <article class="rv-usecase"><i>03</i><h3>Paid API validation</h3><p>Search, status, metadata and other repeatable reads.</p></article>
    <article class="rv-usecase"><i>04</i><h3>Rate-limited capacity</h3><p>Repeated jobs that consume scarce concurrency even when cash cost is low.</p></article>
  </div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">START WITH EVIDENCE</div><h2>Find the repeated work before changing the runtime.</h2><p>Native caches, request coalescing and provider controls stay first. SeenRelay is for the residual exact work that still repeats.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Run free audit</a><a class="rv-button" href="/duplicate-tool-calls">Duplicate tool calls →</a></div>
</section>`;
  return shell(
    'AI Agent Cost Optimization — SeenRelay',
    'AI agent cost optimization for repeated tool calls, browser jobs, paid APIs and validation. Measure exact redundant read-only execution before enabling reuse.',
    `${origin}/ai-agent-cost-optimization`,
    body
  );
}

export function duplicateToolCallsPage(origin: string): string {
  const body = `
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">DUPLICATE TOOL CALLS · TOOL CALL DEDUPLICATION</div>
  <h1>Do not execute the same expensive read twice.</h1>
  <p>When separate agents or workers issue the same exact read-only tool call while the first execution is still in flight, SeenRelay can measure that overlap and let one authoritative result satisfy compatible callers.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Find duplicate calls</a><a class="rv-button" href="/fleet">See measured proof</a></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">1</span><h3>Exact coordinate</h3><p>Tool name alone is not enough. Every result-affecting input must be part of the execution identity.</p></article>
    <article class="rv-card"><span class="rv-number">RO</span><h3>Read-only policy</h3><p>Mutations, control actions and independent-sample requirements are not generic deduplication targets.</p></article>
    <article class="rv-card"><span class="rv-number">NATIVE</span><h3>Native control first</h3><p>Local single-flight, provider cache or framework-native memoization wins when it already solves the same problem.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">CROSS-WORKER</div><h2>Local memoization is not always enough.</h2></div><p>If identical calls originate in different processes, machines or agent workers, a process-local cache cannot join work that is already running elsewhere.</p></div>
  <div class="rv-actions"><a class="rv-button" href="/fleet">Cross-worker evidence →</a><a class="rv-button" href="/ai-agent-cost-optimization">Agent cost optimization →</a></div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">MEASURE FIRST</div><h2>Natural recurrence decides whether deduplication is worth it.</h2><p>The free audit keeps every authoritative execution on and returns USE / DO NOT USE / INSUFFICIENT EVIDENCE for the measured workload.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Run free audit</a><a class="rv-button" href="/commercial">Commercial pilot</a></div>
</section>`;
  return shell(
    'Duplicate Tool Calls and Tool Call Deduplication — SeenRelay',
    'Measure and reduce duplicate tool calls across AI agents and workers. SeenRelay coordinates exact read-only execution only after native controls and real recurrence are measured.',
    `${origin}/duplicate-tool-calls`,
    body
  );
}
