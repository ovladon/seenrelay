import { siteFooterHtml } from './public-facts-view.js';

export function commercialPage(origin: string): string {
  const supportIssueUrl = 'https://github.com/ovladon/seenrelay/issues/new?template=deployment-support.yml';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Optional SeenRelay deployment support after local measurement shows a real workload candidate.">\n<meta name="robots" content="noindex,nofollow,noarchive">
<link rel="canonical" href="${origin}/commercial">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Optional deployment support</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav></details>
</header>

<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">OPTIONAL DEPLOYMENT SUPPORT</div>
  <h1>Start self-serve. Ask for help only if useful.</h1>
  <p>SeenRelay is self-serve by default. Measure locally first; use this public support path only when a real workload candidate remains worth deeper engineering help.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Start locally</a><a class="rv-button" href="${supportIssueUrl}">Open public support inquiry</a></div>
  <p class="rv-small">The GitHub inquiry is public. Do not include secrets or customer data.</p>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Measure first</h3><p>Use normal traffic and preserve the authoritative path.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Keep or remove</h3><p>Native controls, safety and net economics decide whether SeenRelay stays.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Ask only if needed</h3><p>Optional support can help with a bounded integration after evidence exists.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-trust-note"><b>Current billing boundary:</b> the hosted CHECK/OBSERVE service remains free during bootstrap and self-serve service billing is disabled. No paid deployment-support or engineering service is currently activated. The public GitHub support path is optional, non-commercial during this bootstrap phase, and not required to use SeenRelay.</div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="/#start">Start locally</a><a class="rv-button" href="/economics">Economics method</a></div>
</section>
</main>
${siteFooterHtml()}
</body></html>`;
}
