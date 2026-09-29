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
<meta name="description" content="SeenRelay reduces redundant expensive read-only execution across agents, services, browsers, CI and IoT.">
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
<meta property="og:title" content="SeenRelay — Pay less now.">
<meta property="og:description" content="Stop repeating expensive read-only work across agents and infrastructure.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Pay less now.</title>
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
    <a href="/substrate">Platform</a>
    <a href="/fleet">Proof</a>
    <a href="/clients">Integrations</a>
    <a href="/commercial">Pilot</a>
    <a href="/trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="/substrate">Platform</a><a href="/fleet">Proof</a><a href="/clients">Integrations</a><a href="/commercial">Pilot</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-button primary" href="#start">Run free audit</a></div>
</header>

<main id="main-content">

<section class="rv-shell rv-hero rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>EXECUTION REUSE · CLIENT ${version}</span></div>
    <h1>Pay less now.</h1>
    <p class="rv-lead">SeenRelay finds repeated expensive read-only work across agents and infrastructure, then lets one safe result satisfy compatible callers instead of paying to run the work again.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="#start">Run the free audit</a>
      <a class="rv-button" href="/commercial">Commercial pilot</a>
    </div>
    <div class="rv-proofline" aria-label="Audit safety">
      <span>free audit</span><span>no account</span><span>no API key</span><span>no suppression during audit</span><span>fail open</span>
    </div>
  </div>

  <aside class="rv-demo rv-verdict-demo" aria-label="SeenRelay value">
    <div class="rv-demo-head"><span>ONE PATTERN</span><b>duplicate expensive execution</b></div>
    <div class="rv-verdict-card">
      <div class="rv-verdict-top"><span>WITHOUT</span><strong>5 callers → repeated work</strong></div>
      <div class="rv-verdict-top"><span>WITH SEENRELAY</span><strong>1 execution → compatible reuses</strong></div>
      <p>Every original authoritative call still runs during the free audit. Active reuse is enabled only on a measured eligible path.</p>
    </div>
  </aside>
</section>

<section class="rv-band" aria-label="SeenRelay value">
  <div class="rv-band-inner">
    <div><b>Spend less</b><span>avoid repeated metered work</span></div>
    <div><b>Need less capacity</b><span>reduce duplicate provider jobs</span></div>
    <div><b>Scale cleaner</b><span>share exact work across callers</span></div>
    <div><b>Stay safe</b><span>read-only · exact · fail open</span></div>
  </div>
</section>

<section class="rv-shell rv-section" id="proof">
  <div class="rv-section-head">
    <div><div class="rv-eyebrow">MEASURED</div><h2>It already reduces real provider work.</h2></div>
    <p>Controlled mechanics evidence. Customer ROI is measured, not assumed.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card accent">
      <span class="rv-number">18 → 9</span>
      <h3>Firecrawl credits</h3>
      <p>6 browser jobs became 3 jobs + 3 follower reuses with matching results.</p>
      <a href="/fleet#measured-proof">Evidence →</a>
    </article>
    <article class="rv-card">
      <span class="rv-number">5 → 1</span>
      <h3>Provider jobs</h3>
      <p>Five simultaneous callers shared one browser job with four reuses and zero coordination failures.</p>
      <a href="/fleet#measured-proof">Evidence →</a>
    </article>
    <article class="rv-card">
      <span class="rv-number">15</span>
      <h3>Credits avoided</h3>
      <p>Controlled repeated extraction avoided 15 provider credits.</p>
      <a href="/product-facts.json">Verified facts →</a>
    </article>
  </div>
  <div class="rv-trust-note"><b>SeenRelay is recommended only where it is the cheapest safe option.</b> Native/local controls are measured first. Savings claims require measured workloads.</div>
</section>

<section class="rv-shell rv-section" id="where">
  <div class="rv-section-head"><div><div class="rv-eyebrow">ONE LAYER</div><h2>Agents are only the beginning.</h2></div></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>AI</i><h3>Agents</h3><p>MCP tools, search, browser and validation.</p></article>
    <article class="rv-usecase"><i>API</i><h3>Services</h3><p>HTTP/RPC reads and repeated checks.</p></article>
    <article class="rv-usecase"><i>CI</i><h3>CI / tests</h3><p>Repeated deterministic validation.</p></article>
    <article class="rv-usecase"><i>IOT</i><h3>IoT / edge</h3><p>Eligible read-only state and metadata checks.</p></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/substrate">See the execution layer</a><a class="rv-button quiet" href="/clients">Integrations →</a></div>
</section>

<section class="rv-shell rv-final" id="start">
  <div>
    <div class="rv-eyebrow">FIND THE WASTE</div>
    <h2>One command. No source upload.</h2>
    <p>If the scan finds no plausible repeated expensive read-only validation, stop there. If it finds a candidate, the free shadow audit measures real traffic without suppressing a single authoritative call.</p>
    <div class="rv-code"><pre id="hero-scan-command">${scanCommand}</pre><button class="rv-copy" type="button" data-copy-target="hero-scan-command">Copy</button></div>
    <p class="rv-small">USE / DO NOT USE / INSUFFICIENT EVIDENCE · no SeenRelay API key required · static scan cannot authorize reuse.</p>
  </div>
  <div class="rv-actions">
    <a class="rv-button primary" href="/quickstart">Run the free savings audit</a>
    <a class="rv-button" href="/commercial">Start a commercial pilot</a>
  </div>
</section>

</main>
${siteFooterHtml()}
</body>
</html>`;
}
