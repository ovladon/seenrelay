import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

export function langfusePage(origin: string): string {
  const version=esc(publicProductFacts.install.client_version);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Use SeenRelay with a local Langfuse TOOL-observation export to find exact repeated tool calls, in-flight overlap and recorded repeat cost before changing runtime behavior.">
<link rel="canonical" href="${origin}/langfuse">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay for Langfuse — Find repeated TOOL spend</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  <div class="rv-nav-actions"><a class="rv-button primary" href="/#start">Start locally</a></div>
</header>
<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">LANGFUSE · CLIENT ${version}</div>
  <h1>Already have Langfuse? Find repeated TOOL spend.</h1>
  <p>Export TOOL observations, run one local command, and see exact recurrence, in-flight overlap and recorded repeat cost before you change runtime behavior.</p>
  <div class="rv-code"><pre>npx seenrelay langfuse-census observations.json --json</pre></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Exact repeats</h3><p>Canonical tool name + input identity. No fuzzy matching.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>In-flight overlap</h3><p>Find repeated calls that start while an identical call is still running.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Recorded cost</h3><p>Use Langfuse TOOL cost when present. It remains recorded spend, not automatic savings.</p></article>
  </div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">LOCAL-FIRST</div><h2>No Langfuse API key goes to SeenRelay.</h2><p>The command reads your local export. Raw tool input is hashed locally and does not appear in the report. Any repeat candidate remains NEEDS_POLICY_REVIEW until read-only semantics, native controls and shadow economics are verified.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Start locally</a><a class="rv-button" href="/clients">All integrations</a></div>
</section>
</main>
${siteFooterHtml()}
</body></html>`;
}
