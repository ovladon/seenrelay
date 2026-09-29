import { siteFooterHtml } from './public-facts-view.js';

export function commercialPage(origin: string): string {
  const issueUrl = 'https://github.com/ovladon/seenrelay/issues/new?template=commercial-pilot.yml';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay commercial pilots measure one real workload and deploy only when the economics are positive.">
<link rel="canonical" href="${origin}/commercial">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Commercial pilot</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/substrate">Platform</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/trust">Trust</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/">Home</a><a href="/substrate">Platform</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/quickstart">Docs</a></nav></details>
</header>

<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">COMMERCIAL PILOT</div>
  <h1>Prove savings. Then deploy.</h1>
  <p>Buy a measured result, not a savings promise.</p>
  <div class="rv-actions"><a class="rv-button primary" href="${issueUrl}">Start pilot inquiry</a><a class="rv-button" href="/#start">Run free audit first</a></div>
  <p class="rv-small">This GitHub inquiry is public. Do not include secrets or customer data.</p>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Measure</h3><p>One expensive read-only workload on real traffic.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Compare</h3><p>Native controls vs SeenRelay, including overhead.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Deploy</h3><p>Only the safe path with positive measured economics.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-trust-note"><b>Current billing boundary:</b> the hosted CHECK/OBSERVE service remains free during bootstrap and self-serve service billing is disabled. Commercial pilots are separately agreed engineering/evaluation work.</div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="${issueUrl}">Open commercial-pilot.yml intake</a><a class="rv-button" href="/economics">Economics method</a></div>
</section>
</main>
${siteFooterHtml()}
</body></html>`;
}
