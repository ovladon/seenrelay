import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function evidenceCards(): string {
  return publicProductFacts.verified_benchmarks
    .filter((item) => 'matrix' in item)
    .map((item) => {
      if (!('matrix' in item)) return '';
      const matrix = item.matrix;
      return `<article class="rv-evidence-card">
        <header>
          <div><small>${esc(matrix.surface)}</small><b>${esc(matrix.configuration)}</b></div>
        </header>
        <div class="rv-evidence-metrics">
          <div><strong>${esc(matrix.provider_calls_avoided)}/${esc(item.samples)}</strong><span>provider calls avoided</span></div>
          <div><strong>${esc(matrix.provider_units_avoided)}</strong><span>${esc(matrix.provider_unit_label)} avoided</span></div>
          <div><strong>${esc(matrix.baseline_median_ms)} → ${esc(item.reuse_median_ms)} ms</strong><span>baseline → reuse median path latency</span></div>
        </div>
        <footer><span>n=${esc(item.samples)}</span></footer>
      </article>`;
    })
    .join('');
}

export function publicLandingPage(origin: string): string {
  const f = publicProductFacts;
  const version = esc(f.install.client_version);
  const npmCommand = esc(f.install.npm_command);
  const pipCommand = esc(f.install.pypi_command);
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;
  const agentPrompt = 'Find repeated expensive read-only validations across this agent fleet. Integrate SeenRelay only through a supported adapter, start in shadow mode, preserve the authoritative call and stronger native controls, run the existing tests, and report the exact workloads that repeat. Where workers already share a caller-owned store, evaluate encrypted private L1 before optional shared CHECK.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay is a provider-independent validation reuse layer for agent fleets that repeatedly perform expensive read-only work.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<link rel="alternate" type="application/json" href="${origin}/product-facts.json" title="SeenRelay verified product facts">
<link rel="alternate" type="application/json" href="${origin}/.well-known/agent-skills/index.json" title="SeenRelay Agent Skill discovery">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Validation reuse for agent fleets">
<meta property="og:description" content="Measure repeated expensive read-only validation, reuse caller-owned state across workers, preserve stronger native controls, and keep the authoritative fallback.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Validation reuse for agent fleets</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/revamp-factual.css">
<script src="/revamp.js" defer></script>
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/" aria-label="SeenRelay home"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation">
    <a href="#what">What it is</a>
    <a href="/fleet">Fleet</a>
    <a href="#install">Measure</a>
    <a href="#tests">Tests</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <div class="rv-nav-actions">
    <a class="rv-chip" href="/service.json">Machine JSON</a>
    <a class="rv-button" href="/fleet">Fleet deployment</a>
  </div>
</header>

<main>
<section class="rv-shell rv-hero rv-hero-factual" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>SEENRELAY · CLIENT ${version}</span></div>
    <h1>Validation reuse for agent fleets.</h1>
    <p class="rv-lead">SeenRelay is a reuse layer for repeated read-only validation. For agent fleets, it sits in front of repeated expensive work so workers can reuse caller-owned local/private state, prefer source-native freshness confirmation, optionally consult recent shared observations, and fall through to the original validation whenever a cheaper path is not justified.</p>
    <div class="rv-proofline" aria-label="Current product facts">
      <span>npm + PyPI verified</span>
      <span>caller-owned private L1</span>
      <span>no account</span>
      <span>no API key</span>
      <span>${esc(f.install.runtime_dependencies)} required base runtime dependencies</span>
      <span>CHECK + OBSERVE</span>
    </div>
  </div>

  <aside class="rv-demo rv-mechanism" aria-label="SeenRelay placement">
    <div class="rv-demo-head"><span>where SeenRelay sits</span><b>expensive read-only validation</b></div>
    <div class="rv-flow-list">
      <div><span>1</span><p><b>Existing worker request</b><small>An agent or service is about to repeat a source-backed validation.</small></p></div>
      <div><span>2</span><p><b>Exact identity + freshness policy</b><small>SeenRelay only considers work the caller can identify and bound.</small></p></div>
      <div><span>3</span><p><b>Cheaper eligible path</b><small>Local/private fleet reuse → source-native confirmation → optional shared CHECK.</small></p></div>
      <div><span>4</span><p><b>Original validation when needed</b><small>The existing provider/source remains the fallback and authority.</small></p></div>
      <div><span>5</span><p><b>OBSERVE after fresh validation</b><small>A fresh independently obtained result may contribute evidence for later callers.</small></p></div>
    </div>
  </aside>
</section>

<section class="rv-shell rv-section rv-compact-section" id="how">
  <div class="rv-section-head">
    <div class="rv-eyebrow">WHAT IT DOES</div>
    <h2>Keep repeated expensive validation from multiplying across workers.</h2>
    <p>The goal is not to replace the source. The goal is to put cheaper, bounded reuse and freshness paths ahead of work the fleet was already about to repeat.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Recognize the same work</h3><p>Use deterministic identity for an exact read-only fact or tool call instead of treating every worker invocation as unrelated.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Reuse inside the fleet</h3><p>Caller-owned encrypted private L1 can carry exact completed-result state across workers or restarts. Stronger source-native validation remains ahead of optional shared CHECK.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Keep normal validation available</h3><p>Unknown, stale, contested or otherwise ineligible work falls through to the authoritative validation the application already had.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="install">
  <div class="rv-section-head">
    <div class="rv-eyebrow">INSTALL AND USE</div>
    <h2>First run: measure repetition without changing application behavior.</h2>
    <p>Ambient/shadow integration is the lowest-risk entry point. The existing call remains authoritative while SeenRelay measures exact repetition locally. If the report shows no meaningful repeat work, leave the path alone.</p>
  </div>

  <div class="rv-adopt">
    <div class="rv-mode-card">
      <div class="rv-segment" role="tablist" aria-label="Installation mode">
        <button type="button" role="tab" aria-selected="true" data-mode-button="human">Developer</button>
        <button type="button" role="tab" aria-selected="false" data-mode-button="agent">Coding agent</button>
      </div>
      <div class="rv-mode-copy">
        <h3>Start on one expensive validation path.</h3>
        <p>Measure first. When a fleet workload genuinely repeats, connect caller-owned private storage or another bounded integration without changing the authoritative fallback.</p>
        <div class="rv-mode-note">Shared CHECK is optional. A stronger native validator wins when it answers the same user-relevant question more cheaply.</div>
      </div>
    </div>

    <div class="rv-console" aria-live="polite">
      <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>first integration</span></div>
      <div class="rv-install-view active" data-install-view="human">
        <div class="rv-step"><span>1</span><div><h4>Install</h4><div class="rv-code"><pre id="npm-install">${npmCommand}</pre><button class="rv-copy" type="button" data-copy-target="npm-install">Copy</button></div><div class="rv-code"><pre id="pip-install">${pipCommand}</pre><button class="rv-copy" type="button" data-copy-target="pip-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Existing JavaScript/TypeScript MCP client: wrap it once in shadow mode</h4><div class="rv-code"><pre id="ambient-example">import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient);

// use client.callTool(...) normally
console.log(client.seenRelayAmbient.getReport());</pre><button class="rv-copy" type="button" data-copy-target="ambient-example">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Fleet candidate?</h4><p><a class="rv-inline-link" href="/fleet">Use caller-owned encrypted private L1 across workers, with source-native validation ahead of optional shared CHECK →</a></p></div></div>
      </div>
      <div class="rv-install-view" data-install-view="agent">
        <div class="rv-step"><span>1</span><div><h4>Install the SeenRelay Agent Skill</h4><div class="rv-code"><pre id="skill-install">${esc(skillCommand)}</pre><button class="rv-copy" type="button" data-copy-target="skill-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Give the agent this task</h4><div class="rv-code"><pre id="agent-prompt">${esc(agentPrompt)}</pre><button class="rv-copy" type="button" data-copy-target="agent-prompt">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Review the measured report</h4><p>The skill preserves the existing validation and should reject cheap one-off or stronger-native-control paths rather than forcing SeenRelay into them.</p></div></div>
      </div>
    </div>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head">
    <div class="rv-eyebrow">FLEET DEPLOYMENT</div>
    <h2>Private reuse is caller-owned. The public relay stays optional.</h2>
    <p>JavaScript/TypeScript private L1 can share sealed state across workers or process restarts. The store sees an opaque SHA-256 coordinate and encrypted payload; the encryption key stays in the caller's secret-management boundary.</p>
  </div>
  <div class="rv-contract">
    <div class="rv-contract-main">
      <div class="rv-eyebrow">CURRENT PRODUCT PATH</div>
      <h3>Local → private fleet L1 → source native → optional shared CHECK → validate.</h3>
      <p>This gives a fleet value before the public network has coverage and avoids claiming that the public relay is a hosted private tenant store.</p>
    </div>
    <div class="rv-contract-list">
      <article><b>Across workers</b><span>Private L1 is explicitly designed for caller-owned reuse across workers or restarts.</span></article>
      <article><b>Explicit freshness</b><span>A positive private freshness window is a caller policy decision; zero does not let a completed result suppress live validation.</span></article>
      <article><b>Fail open</b><span>Store, codec or relay failures are optimization failures and fall through to the existing validation.</span></article>
    </div>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="/fleet">Open fleet deployment</a><a class="rv-button quiet" href="/data-practices">Data practices →</a></div>
</section>

<section class="rv-shell rv-section" id="tests">
  <div class="rv-section-head">
    <div class="rv-eyebrow">TESTS WE HAVE RUN</div>
    <h2>What the current measured tests show.</h2>
    <p>Mechanics are measured, but workload fit still has to earn its place. These are first-party smoke tests, not a universal ROI claim; a separate workload can be a poor fit even when the reuse mechanism works correctly.</p>
  </div>

  <div class="rv-evidence-cards" aria-label="SeenRelay benchmark results">${evidenceCards()}</div>

  <div class="rv-evidence-interpretation">
    <article><b>What these tests establish</b><p>SeenRelay's bounded reuse path can bypass equivalent provider work and can reduce provider-unit consumption. In the structured extraction and browser-interaction tests it also reduced measured path latency.</p></article>
    <article><b>What they do not establish</b><p>They do not establish a universal hit rate, guaranteed savings, or that SeenRelay should sit ahead of a cheaper authoritative/source-native mechanism. Natural-workload suitability is evaluated separately.</p></article>
    <article><b>How to test your own workload</b><p>For a fleet, start with Ambient/Shadow Proof while every authoritative validation still runs. Measure exact repetition before deciding whether private or shared reuse is appropriate.</p><a href="/quickstart">Open the measurement-first quickstart →</a></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/economics">Full benchmark details and caveats</a><a class="rv-button quiet" href="/product-facts.json">Machine-readable evidence →</a></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head">
    <div class="rv-eyebrow">WHEN TO USE IT</div>
    <h2>Repeated, deterministic, expensive read-only validation across workers.</h2>
    <p>Strong candidates include browser or portal validation, metered scraping/extraction, model-assisted parsing, paid search, rate-limited APIs and multi-step validation chains. Cheap one-off requests, mutating operations and paths already solved by an equivalent authoritative cache are not the target.</p>
  </div>
  <div class="rv-contract">
    <div class="rv-contract-main">
      <div class="rv-eyebrow">PROTOCOL BOUNDARY</div>
      <h3>CHECK and OBSERVE remain the only hosted domain operations.</h3>
      <p>CHECK asks about compatible recent evidence. OBSERVE contributes a freshly and independently obtained observation. SeenRelay does not browse or independently decide truth.</p>
    </div>
    <div class="rv-contract-list">
      <article><b>Source authority is preserved</b><span>The original validation remains available whenever reuse is not justified.</span></article>
      <article><b>Fleet value can stay private</b><span>Caller-owned private L1 can avoid repeat work without depending on public network coverage.</span></article>
      <article><b>Machine-readable integration</b><span>OpenAPI, MCP, service JSON, llms.txt, Agent Skill discovery and the local integration catalog expose supported surfaces to tooling.</span></article>
    </div>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/trust">Trust model</a><a class="rv-button" href="/data-practices">Data practices</a><a class="rv-button quiet" href="https://github.com/ovladon/seenrelay">GitHub →</a></div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">NEXT STEP</div><h2>Measure one expensive fleet validation.</h2><p>If the report shows material repetition, use the narrowest bounded reuse path that preserves the same outcome. If it does not, leave the original path alone.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/fleet">Fleet deployment</a><a class="rv-button" href="/quickstart">Quickstart</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
