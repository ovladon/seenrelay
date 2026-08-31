import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function listItems(items: readonly string[]): string {
  return items.map((item) => `<li>${esc(item)}</li>`).join('');
}

function evidenceCards(): string {
  return publicProductFacts.verified_benchmarks
    .filter((item) => 'matrix' in item)
    .slice(0, 3)
    .map((item) => {
      if (!('matrix' in item)) return '';
      const matrix = item.matrix;
      const latencyOutcome = String(matrix.latency_outcome);
      const latency = latencyOutcome === 'better' ? 'faster' : 'slower';
      return `<article class="evidence-card">
<div class="evidence-top"><span class="fit fit-${esc(matrix.fit)}">${esc(String(matrix.fit).toUpperCase())} FIT</span><span>${esc(item.provider)}</span></div>
<h3>${esc(matrix.surface)}</h3>
<p>${esc(matrix.configuration)}</p>
<div class="evidence-numbers"><b>${esc(matrix.provider_calls_avoided)}/${esc(item.samples)}</b><span>provider-path calls avoided</span></div>
<div class="evidence-numbers"><b>${esc(item.reuse_median_ms)} ms</b><span>bounded reuse · ${esc(latency)} than measured provider path</span></div>
<small>${esc(item.caveat)}</small>
<a href="${esc(item.evidence_url)}" rel="noreferrer">Evidence ↗</a>
</article>`;
    })
    .join('');
}

function latestCards(): string {
  return publicProductFacts.latest_verified_updates
    .slice(0, 3)
    .map((item) => `<article><span>${esc(item.date)}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p></article>`)
    .join('');
}

export function publicLandingPage(origin: string): string {
  const f = publicProductFacts;
  const version = esc(f.install.client_version);
  const verifiedDate = esc(f.install.registry_install_verified_at.slice(0, 10));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay helps AI agents avoid redundant expensive read-only validation by preferring local/private reuse, source-native checks and optional shared freshness evidence.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<link rel="alternate" type="application/json" href="${origin}/product-facts.json" title="SeenRelay verified product facts">
<link rel="alternate" type="application/json" href="${origin}/.well-known/agent-skills/index.json" title="SeenRelay Agent Skill discovery">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Don't pay twice for the same validation">
<meta property="og:description" content="Put cheaper controls ahead of repeated expensive validation. Keep the original authoritative path as fallback.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Validation cost avoidance for AI agents</title>
<link rel="stylesheet" href="/site.css">
<script src="/site.js" defer></script>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/" aria-label="SeenRelay home"><span class="brand-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav aria-label="Primary navigation">
    <a href="#install">Install</a>
    <a href="#integrate">Integrate</a>
    <a href="#fit">Fit</a>
    <a href="#evidence">Evidence</a>
    <a href="#trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <a class="nav-cta" href="/.well-known/agent-skills/seenrelay/SKILL.md">Agent Skill</a>
</header>

<main>
<section class="hero-shell">
  <div class="hero-copy">
    <div class="kicker"><span>VALIDATION INFRASTRUCTURE</span><span class="status-dot"></span><span>CLIENT v${version} VERIFIED</span></div>
    <h1>Don't pay twice for the same validation.</h1>
    <p class="hero-lead">SeenRelay puts cheaper, safer controls ahead of repeated expensive read-only validation: local/private reuse, source-native checks, then optional shared <b>CHECK</b> evidence. If reuse is not justified, your original validation still runs.</p>
    <div class="hero-actions">
      <a class="button button-primary" href="#install">Install SeenRelay</a>
      <a class="button" href="/quickstart">Protect a validation</a>
      <a class="button button-quiet" href="/economics">See measured economics →</a>
    </div>
    <div class="proof-strip" aria-label="Current release facts">
      <div><b>${version}</b><span>npm + PyPI</span></div>
      <div><b>${esc(f.install.runtime_dependencies)}</b><span>runtime dependencies</span></div>
      <div><b>2</b><span>hosted operations</span></div>
      <div><b>$0</b><span>current API fee</span></div>
      <div><b>No</b><span>account required</span></div>
    </div>
  </div>

  <aside class="hero-panel" aria-label="SeenRelay decision path">
    <div class="panel-head"><span>READ-ONLY VALIDATION PATH</span><span>FAIL OPEN</span></div>
    <ol class="decision-stack">
      <li><span>01</span><div><b>Local / private</b><small>Reuse exact eligible work you already own.</small></div><i>cheapest</i></li>
      <li><span>02</span><div><b>Source native</b><small>Prefer ETag, Last-Modified or stronger authoritative controls.</small></div><i>stronger</i></li>
      <li><span>03</span><div><b>Shared CHECK</b><small>Ask whether recent compatible evidence can help.</small></div><i>optional</i></li>
      <li><span>04</span><div><b>Original validation</b><small>Run it normally whenever evidence is insufficient.</small></div><i>fallback</i></li>
      <li class="observe"><span>05</span><div><b>OBSERVE</b><small>Contribute only a fresh independently obtained result.</small></div><i>after</i></li>
    </ol>
  </aside>
</section>

<section class="band" aria-label="Protocol boundary">
  <span>CHECK asks about recent evidence.</span>
  <span>OBSERVE contributes fresh evidence.</span>
  <span>SeenRelay does not decide truth.</span>
</section>

<section class="section install-section" id="install">
  <div class="section-intro">
    <div class="eyebrow">INSTALL · PUBLIC CLIENT ${version}</div>
    <h2>Two commands. Start without an account.</h2>
    <p>${esc(f.install.verification)}</p>
  </div>
  <div class="install-grid">
    <article class="command-card">
      <div><span>JavaScript / TypeScript</span><b>npm</b></div>
      <pre>${esc(f.install.npm_command)}</pre>
      <a href="/clients">Choose JS/TS integration →</a>
    </article>
    <article class="command-card">
      <div><span>Python</span><b>PyPI</b></div>
      <pre>${esc(f.install.pypi_command)}</pre>
      <a href="/clients">Choose Python integration →</a>
    </article>
  </div>
  <p class="verification-line">Registry clean-install verification published ${verifiedDate} · canonical facts: <a href="/product-facts.json">product-facts.json</a></p>
</section>

<section class="section" id="integrate">
  <div class="section-intro compact-intro">
    <div class="eyebrow">INTEGRATION SURFACES</div>
    <h2>Meet the caller where it already works.</h2>
    <p>${esc(f.positioning.subheadline)}</p>
  </div>
  <div class="surface-grid">
    <article class="surface-card featured">
      <span>01</span><div class="surface-icon">{ }</div><h3>Client libraries</h3>
      <p>Local-first and shadow-first client paths for applications that control the validation call.</p>
      <a href="/clients">Open client integrations →</a>
    </article>
    <article class="surface-card">
      <span>02</span><div class="surface-icon">MCP</div><h3>Remote MCP</h3>
      <p>Expose exactly CHECK and OBSERVE through the implemented MCP surface.</p>
      <code>${origin}/mcp</code>
    </article>
    <article class="surface-card">
      <span>03</span><div class="surface-icon">SK</div><h3>Agent Skill</h3>
      <p>Let compatible coding agents discover the integration instructions directly.</p>
      <a href="/.well-known/agent-skills/seenrelay/SKILL.md">Open SKILL.md →</a>
    </article>
    <article class="surface-card">
      <span>04</span><div class="surface-icon">HTTP</div><h3>REST / OpenAPI</h3>
      <p>Use the hosted protocol directly when framework adapters are unnecessary.</p>
      <a href="/openapi.json">Open OpenAPI →</a>
    </article>
  </div>
</section>

<section class="section fit-section" id="fit">
  <div class="section-intro compact-intro">
    <div class="eyebrow">WORKLOAD FIT</div>
    <h2>Use it where the avoided work matters.</h2>
    <p>SeenRelay is an optimization layer, not a reason to add network overhead to cheap or unsafe work.</p>
  </div>
  <div class="fit-grid">
    <div class="fit-column fit-yes">
      <div class="fit-title"><span>GOOD CANDIDATE</span><b>Use when</b></div>
      <ul>${listItems(f.fit.use_when)}</ul>
    </div>
    <div class="fit-column fit-no">
      <div class="fit-title"><span>NEGATIVE CONTROL</span><b>Do not use when</b></div>
      <ul>${listItems(f.fit.do_not_use_when)}</ul>
    </div>
  </div>
</section>

<section class="section evidence-section" id="evidence">
  <div class="section-intro compact-intro">
    <div class="eyebrow">MEASURED EVIDENCE</div>
    <h2>Show the wins. Publish the losses too.</h2>
    <p>The current benchmark set is first-party smoke evidence for provider-path mechanics. It is not a promised hit rate, and the tested synthetic facts are explicitly classified as poor workload fit where stronger source-native paths existed.</p>
  </div>
  <div class="evidence-grid">${evidenceCards()}</div>
  <div class="evidence-footer"><span>Every row keeps its caveat and source.</span><a href="/economics">Full economics and break-even model →</a></div>
</section>

<section class="section network-section" id="network">
  <div class="section-intro compact-intro">
    <div class="eyebrow">LIVE NETWORK</div>
    <h2>Activity, not vanity.</h2>
    <p>Privacy-safe aggregate operational metrics. These numbers describe use of the hosted network; they are not truth scores and are not presented as external adoption unless independently classified as such.</p>
  </div>
  <div class="metrics-grid">
    <article><span>Facts tracked</span><b data-stat="facts">—</b><small>deterministic source-backed identities</small></article>
    <article><span>Recent observations</span><b data-stat="recent_observations">—</b><small>retained freshness evidence</small></article>
    <article><span>CHECKs this month</span><b data-stat="checks_month">—</b><small>shared evidence requests</small></article>
    <article><span>Useful reuses</span><b data-stat="useful_reuse_month">—</b><small>qualifying prior evidence</small></article>
    <article><span>Useful reuse rate</span><b data-stat-pct="qualified_reuse_rate">—</b><small>activity metric, not truth</small></article>
    <article><span>Active callers · 5m</span><b data-stat="active_hive_leases_5m">—</b><small>pseudonymous operational leases</small></article>
  </div>
  <div class="metrics-time">Aggregate snapshot · <span id="stats-time">loading</span></div>
</section>

<section class="section trust-section" id="trust">
  <div class="section-intro compact-intro">
    <div class="eyebrow">TRUST BOUNDARY</div>
    <h2>Useful because it knows what it is not.</h2>
  </div>
  <div class="trust-grid">
    <article><span>01</span><h3>No truth oracle</h3><p>Recent compatible observations can support a decision. They do not certify reality.</p></article>
    <article><span>02</span><h3>No hidden research</h3><p>The hosted service does not browse, search or independently verify arbitrary facts on demand.</p></article>
    <article><span>03</span><h3>No fake provenance</h3><p>Cache hits and reused values are never re-labelled as fresh independent OBSERVE evidence.</p></article>
    <article><span>04</span><h3>No mutation suppression</h3><p>Mutating or destructive operations are outside the intended reuse path.</p></article>
    <article><span>05</span><h3>Fail open</h3><p>If SeenRelay cannot justify reuse, the application's original validation remains the fallback.</p></article>
    <article><span>06</span><h3>Machine-readable</h3><p>Service JSON, product facts, OpenAPI, MCP and Agent Skill discovery expose the same narrow protocol.</p></article>
  </div>
  <div class="trust-links"><a href="/trust">Trust model →</a><a href="/data-practices">Data practices →</a><a href="/service.json">Machine descriptor →</a></div>
</section>

<section class="section latest-section" id="latest">
  <div class="section-intro compact-intro">
    <div class="eyebrow">LATEST VERIFIED</div>
    <h2>Recent shipped state.</h2>
  </div>
  <div class="latest-grid">${latestCards()}</div>
</section>

<section class="final-cta">
  <div><div class="eyebrow">START IN SHADOW. MEASURE FIRST.</div><h2>Protect one expensive read-only validation.</h2><p>Keep the authoritative call. Measure whether repeat work actually exists. Enable bounded reuse only when your evidence and policy justify it.</p></div>
  <div class="hero-actions"><a class="button button-primary" href="/quickstart">Open quickstart</a><a class="button" href="/clients">Choose integration</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
