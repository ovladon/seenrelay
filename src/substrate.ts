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
<meta name="description" content="SeenRelay is execution-reuse infrastructure below agents: measure exact repeated read-only work across tools, HTTP/RPC, browsers, CI, services and IoT before coordinating it.">
<link rel="canonical" href="${origin}/substrate">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Execution reuse below agents</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/fleet">Evidence</a><a href="/clients">Integrations</a><a href="/commercial">Commercial</a><a href="/trust">Trust</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/">Home</a><a href="/fleet">Evidence</a><a href="/clients">Integrations</a><a href="/commercial">Commercial</a><a href="/quickstart">Docs</a></nav></details>
  <div class="rv-nav-actions"><a class="rv-chip" href="/commercial">Commercial pilot</a><a class="rv-button primary" href="/#start">Run free audit</a></div>
</header>

<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">EXECUTION-REUSE INFRASTRUCTURE · CLIENT ${version}</div>
  <h1>SeenRelay belongs below the agent layer.</h1>
  <p>Agents are one source of repeated work. The same execution boundary is also reached by services, CI workers, browser jobs, scheduled processes, edge gateways and IoT applications. SeenRelay measures exact repeated read-only execution there, keeps stronger native controls first, and coordinates only the reviewed paths whose own evidence shows value.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Audit a workload</a><a class="rv-button" href="/commercial">Run a measured pilot</a></div>
</section>

<section class="rv-band" aria-label="Execution boundary"><div class="rv-band-inner">
  <div><b>CALLERS</b><span>agents · services · humans · CI · cron · edge</span></div>
  <div><b>BOUNDARY</b><span>tool · HTTP/RPC · browser · test · validation · telemetry read</span></div>
  <div><b>SEENRELAY</b><span>measure · native-control check · exact claim/join</span></div>
  <div><b>UPSTREAM</b><span>provider · browser · API · compute · device fleet</span></div>
</div></section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">ONE PRODUCT · MULTIPLE MARKETS</div><h2>Optimize the work, not the brand of agent that requested it.</h2></div><p>The reusable unit is a semantically reviewed execution coordinate. SeenRelay should not need a separate product identity for Claude, Codex, OpenCode, a cron worker or a service if they converge on the same underlying read-only work.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">AI</span><h3>Agent and tool fleets</h3><p>Exact tool calls, MCP operations, search/extraction, browser jobs and validation paths repeated across concurrent agents or workers.</p></article>
    <article class="rv-card"><span class="rv-number">API</span><h3>HTTP / RPC / services</h3><p>Repeated deterministic reads and validation calls across services or processes, with ETag, conditional requests and provider-native caches measured first.</p></article>
    <article class="rv-card"><span class="rv-number">CI</span><h3>Tests and validation jobs</h3><p>Build, test, analysis and audit work only where the full tree/toolchain/config identity is exact and a stronger build cache does not already solve it.</p></article>
    <article class="rv-card"><span class="rv-number">WEB</span><h3>Browser and scraping</h3><p>Metered browser, extraction and proxy work. SeenRelay already has controlled evidence for provider-unit reduction and cross-worker concurrency headroom.</p></article>
    <article class="rv-card"><span class="rv-number">IOT</span><h3>IoT and edge fleets</h3><p>Repeated read-only device state, metadata, inventory and health validation after device shadows, subscriptions, retained state and protocol-native mechanisms are considered first.</p></article>
    <article class="rv-card"><span class="rv-number">OTEL</span><h3>Existing observability</h3><p>Use OpenTelemetry as an agent-agnostic observation boundary. Export opaque exact coordinates and policy locally; do not ship raw prompts, URLs or device payloads into the census.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="otel">
  <div class="rv-section-head"><div><div class="rv-eyebrow">SUBSTRATE DISCOVERY</div><h2>Already have OpenTelemetry? Measure before integrating.</h2></div><p>The local OTLP adapter converts explicitly annotated spans into the same conservative fleet overlap census. It does not contact SeenRelay, execute the workload or infer safety from span type.</p></div>
  <div class="rv-console">
    <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>local OTLP census</span></div>
    <div class="rv-console-body">
      <div class="rv-code"><pre id="otel-command">npx seenrelay otel-trace-census traces.otlp.json --json</pre><button class="rv-copy" type="button" data-copy-target="otel-command">Copy</button></div>
      <p>Admission requires an opaque <code>seenrelay.coordinate_hash</code> plus explicit side-effect/shareability policy. OTel operation type alone never authorizes reuse.</p>
    </div>
  </div>
</section>

<section class="rv-shell rv-section" id="iot">
  <div class="rv-section-head"><div><div class="rv-eyebrow">IOT / EDGE</div><h2>Do not turn stale device state into a cache product.</h2></div><p>IoT is attractive because fleets create huge read volume and constrained links, but freshness and safety are stricter. SeenRelay should target redundant validation around device state, not control commands.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Native state first</h3><p>If a device shadow, broker-retained state, subscription/monitored item, edge cache or conditional protocol already answers the same question safely, use it.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Read-only residual work</h3><p>Good candidates are exact repeated health, inventory, firmware metadata, configuration-read or telemetry-validation operations whose freshness window is explicit.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>No control suppression</h3><p>Actuation, safety-critical commands, independent sensing, alarms and operations requiring a fresh physical-world observation stay outside automatic coordination.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">DECISION RULE</div><h2>Instrument broad. Coordinate narrow.</h2></div><p>SeenRelay can observe many execution surfaces. Active coordination remains intentionally narrower.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">A</span><h3>Native control exists?</h3><p>Use it first and return <b>DO NOT USE</b> when it already dominates SeenRelay on the same objective.</p></article>
    <article class="rv-card"><span class="rv-number">B</span><h3>Natural exact recurrence?</h3><p>Measure real traffic. Do not manufacture collisions to justify deployment.</p></article>
    <article class="rv-card accent"><span class="rv-number">C</span><h3>Positive measured economics?</h3><p>Only actual follower reuse counts as avoided execution. Net savings also subtract coordination/store overhead.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-cta-panel">
    <div><div class="rv-eyebrow">TURN OBSERVED WASTE INTO A DECISION</div><h2>Start free. Pay for deployment work only after the workload survives the audit.</h2><p>Commercial pilots scope one eligible production path, measure the best native baseline, and activate only when the measured path remains safe and economically useful.</p></div>
    <div class="rv-actions"><a class="rv-button primary" href="/commercial">Commercial pilot</a><a class="rv-button" href="/#start">Free self-service audit</a></div>
  </div>
</section>
</main>
${siteFooterHtml(origin)}
<script src="/revamp.js" defer></script>
</body></html>`;
}
