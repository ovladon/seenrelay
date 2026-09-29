import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function substratePage(origin: string): string {
  const version = esc(publicProductFacts.install.client_version);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay is execution-reuse infrastructure below agents, services, CI, browsers and IoT.">
<link rel="canonical" href="${origin}/substrate">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Execution reuse below agents</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
<script src="/revamp.js" defer></script>
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/commercial">Pilot</a><a href="/trust">Trust</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/">Home</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/commercial">Pilot</a><a href="/quickstart">Docs</a></nav></details>
  <div class="rv-nav-actions"><a class="rv-button primary" href="/#start">Run free audit</a></div>
</header>

<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">EXECUTION REUSE · CLIENT ${version}</div>
  <h1>One reuse layer below every caller.</h1>
  <p>Agents are only one source of duplicate work. SeenRelay targets the expensive read-only execution underneath them.</p>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">AI</span><h3>Agents + MCP tools</h3><p>Exact repeated tool and browser work.</p></article>
    <article class="rv-card"><span class="rv-number">API</span><h3>HTTP / RPC / services</h3><p>Repeated deterministic reads.</p></article>
    <article class="rv-card"><span class="rv-number">CI</span><h3>Tests and validation jobs</h3><p>Exact deterministic validation.</p></article>
    <article class="rv-card"><span class="rv-number">WEB</span><h3>Browser and scraping</h3><p>Metered extraction and browser jobs.</p></article>
    <article class="rv-card"><span class="rv-number">IOT</span><h3>IoT and edge fleets</h3><p>Eligible read-only state and metadata checks.</p></article>
    <article class="rv-card"><span class="rv-number">OTEL</span><h3>OpenTelemetry</h3><p>Measure overlap before integrating.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="otel">
  <div class="rv-section-head"><div><div class="rv-eyebrow">DISCOVER</div><h2>Already have traces?</h2></div><p>Use the local OTLP census. Raw prompts, URLs and payloads stay out of the report.</p></div>
  <div class="rv-code"><pre id="otel-command">npx seenrelay otel-trace-census traces.otlp.json --json</pre><button class="rv-copy" type="button" data-copy-target="otel-command">Copy</button></div>
</section>

<section class="rv-shell rv-section" id="iot">
  <div class="rv-section-head"><div><div class="rv-eyebrow">IOT / EDGE</div><h2>Native state first.</h2></div></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><h3>Native state first</h3><p>Device shadow, retained state and subscription win when they already solve the same freshness question.</p></article>
    <article class="rv-card"><h3>Read-only residual work</h3><p>Health, inventory, firmware and metadata validation are the target.</p></article>
    <article class="rv-card"><h3>No control suppression</h3><p>Actuation, safety-critical commands, independent sensing and fresh physical-world observation stay outside automatic coordination.</p></article>
  </div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">RULE</div><h2>Instrument broad. Coordinate narrow.</h2><p>Native control first. Natural exact recurrence second. Positive measured economics before activation.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Run free audit</a><a class="rv-button" href="/commercial">Commercial pilot</a></div>
</section>
</main>
${siteFooterHtml()}
</body></html>`;
}
