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
        <header><div><small>${esc(matrix.surface)}</small><b>${esc(matrix.configuration)}</b></div></header>
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
  const auditPrompt = 'Run a SeenRelay shadow audit on this project. Find repeated expensive read-only validations, preserve every authoritative call, measure stronger local/source/provider-native controls first, do not enable reuse, and return USE / DO NOT USE / INSUFFICIENT EVIDENCE for each measured workload.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Check how efficiently AI agents can revisit your site, or measure repeated expensive validation in your agent fleet. Native fixes first; SeenRelay only where measured evidence justifies it.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<link rel="alternate" type="application/json" href="${origin}/product-facts.json" title="SeenRelay verified product facts">
<link rel="alternate" type="application/json" href="${origin}/.well-known/agent-skills/index.json" title="SeenRelay Agent Skill discovery">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — AI visit readiness and validation reuse">
<meta property="og:description" content="Start with evidence: check a public site surface or audit a real agent workload. Prefer native controls first and use SeenRelay only when the measured workload earns it.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — AI visit readiness and validation reuse</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/revamp-factual.css">
<link rel="stylesheet" href="/funnel.css">
<script src="/revamp.js" defer></script>
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/" aria-label="SeenRelay home"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation">
    <a href="/readiness">Check a site</a>
    <a href="#audit">Audit a workload</a>
    <a href="/fleet">Fleet reuse</a>
    <a href="#tests">Evidence</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <div class="rv-nav-actions">
    <a class="rv-chip" href="/service.json">For machines</a>
    <a class="rv-button" href="/readiness">Check AI readiness</a>
  </div>
</header>

<main>
<section class="rv-shell rv-hero rv-hero-factual rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>AI-READY SURFACES + VALIDATION REUSE · CLIENT ${version}</span></div>
    <h1>Make repeated AI visits cheaper before you add another layer.</h1>
    <p class="rv-lead">SeenRelay gives you two evidence-first starting points. Site and API owners can check whether public AI visits already have efficient native freshness and discovery. Agent builders can measure whether a real fleet is repeating expensive read-only validation. Native controls win whenever they solve the same problem better.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="/readiness">I own a site or API</a>
      <a class="rv-button" href="#audit">I run agents or a fleet</a>
      <a class="rv-button quiet" href="/service.json">Machine entrypoint →</a>
    </div>
    <div class="rv-proofline" aria-label="Current product facts">
      <span>free</span>
      <span>no account</span>
      <span>no API key</span>
      <span>native-first</span>
      <span>authoritative calls stay on</span>
      <span>npm + PyPI verified</span>
    </div>
  </div>

  <aside class="rv-demo rv-mechanism" aria-label="Evidence-first path">
    <div class="rv-demo-head"><span>start here</span><b>choose the evidence you need</b></div>
    <div class="rv-flow-list">
      <div><span>1</span><p><b>Own a public site?</b><small>Check the native HTTP and machine-facing surface first. Fix standards-native gaps before considering another reuse layer.</small></p></div>
      <div><span>2</span><p><b>Run an agent workload?</b><small>Keep the real workload unchanged and measure exact repeated validation, stronger controls and prospective economics.</small></p></div>
      <div><span>3</span><p><b>Only connect the paths when justified</b><small>A surface scan never establishes SeenRelay workload fit. A workload audit can recommend USE, DO NOT USE or INSUFFICIENT EVIDENCE.</small></p></div>
    </div>
  </aside>
</section>

<section class="rv-shell rv-section rv-compact-section" id="paths">
  <div class="rv-section-head">
    <div class="rv-eyebrow">CHOOSE YOUR STARTING POINT</div>
    <h2>Get value before you install anything.</h2>
    <p>The first question is not “How do I integrate SeenRelay?” It is “What kind of avoidable validation work do I actually have?”</p>
  </div>
  <div class="rv-path-grid">
    <article class="rv-path-card primary-path">
      <span class="rv-number">01</span>
      <div class="rv-eyebrow">SITE / API OWNER</div>
      <h3>How efficiently can AI agents revisit your public surface?</h3>
      <p>Run the free native-first readiness check. It looks for bounded HTTP freshness and machine-facing evidence, recommends native fixes first, and does not label your site a SeenRelay candidate from a surface scan.</p>
      <div class="rv-actions"><a class="rv-button primary" href="/readiness">Check AI readiness</a></div>
    </article>
    <article class="rv-path-card">
      <span class="rv-number">02</span>
      <div class="rv-eyebrow">AGENT / FLEET DEVELOPER</div>
      <h3>Find out where your agent fleet is wasting time or provider spend on repeated validation.</h3>
      <p>Run a behavior-preserving shadow audit on the workload you already have. Every authoritative validation stays enabled while SeenRelay measures recurrence, stronger native/cache paths, safety equivalence and prospective economics.</p>
      <div class="rv-actions"><a class="rv-button" href="#audit">Run the free shadow audit</a></div>
    </article>
  </div>
  <p class="rv-path-bridge"><b>The handoff is conditional.</b> If the site audit says native HTTP already solves the problem, stop there. If expensive repeated validation remains elsewhere in the agent workload, measure that workload next.</p>
</section>

<section class="rv-shell rv-section" id="audit">
  <div class="rv-section-head">
    <div class="rv-eyebrow">FREE SHADOW AUDIT</div>
    <h2>Run your real workload. Measure repeated validation without changing behavior.</h2>
    <p>No signup and no synthetic hit-rate promise. Start with measurement; every original call remains authoritative. A negative result is useful because it tells you not to add another layer.</p>
  </div>

  <div class="rv-adopt">
    <div class="rv-mode-card">
      <div class="rv-segment" role="tablist" aria-label="Audit installation mode">
        <button type="button" role="tab" aria-selected="true" data-mode-button="human">Developer</button>
        <button type="button" role="tab" aria-selected="false" data-mode-button="agent">Coding agent</button>
      </div>
      <div class="rv-mode-copy">
        <h3>Measure first. Optimize only the workload that earns it.</h3>
        <p>The audit looks for repeated deterministic read-only work and compares SeenRelay with the strongest equivalent native path before recommending reuse.</p>
        <div class="rv-mode-note">Shared CHECK is optional. Caller-owned local/private reuse and source/provider-native controls stay ahead whenever they are stronger or cheaper.</div>
      </div>
    </div>

    <div class="rv-console" aria-live="polite">
      <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>free shadow audit</span></div>
      <div class="rv-install-view active" data-install-view="human">
        <div class="rv-step"><span>1</span><div><h4>Install</h4><div class="rv-code"><pre id="npm-install">${npmCommand}</pre><button class="rv-copy" type="button" data-copy-target="npm-install">Copy</button></div><div class="rv-code"><pre id="pip-install">${pipCommand}</pre><button class="rv-copy" type="button" data-copy-target="pip-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Start with a supported shadow adapter</h4><div class="rv-code"><pre id="ambient-example">import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient);
// run the existing workload normally
console.log(client.seenRelayAmbient.getReport());</pre><button class="rv-copy" type="button" data-copy-target="ambient-example">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Review the report before enabling anything</h4><p>Measure recurrence and best-native controls. For full safety/economics evidence, use Shadow Proof / the hostile evaluator documented in the client package.</p></div></div></div>
      </div>
      <div class="rv-install-view" data-install-view="agent" id="agent-audit">
        <div class="rv-step"><span>1</span><div><h4>Install the SeenRelay Agent Skill</h4><div class="rv-code"><pre id="skill-install">${esc(skillCommand)}</pre><button class="rv-copy" type="button" data-copy-target="skill-install">Copy</button></div></div></div>
        <div class="rv-step"><span>2</span><div><h4>Give the agent one task</h4><div class="rv-code"><pre id="agent-prompt">${esc(auditPrompt)}</pre><button class="rv-copy" type="button" data-copy-target="agent-prompt">Copy</button></div></div></div>
        <div class="rv-step"><span>3</span><div><h4>Accept a negative verdict</h4><p>The skill must leave unsupported paths unchanged and should return DO NOT USE when native controls or sparse recurrence make SeenRelay uneconomic.</p></div></div></div>
      </div>
    </div>
  </div>
</section>

<section class="rv-shell rv-section rv-compact-section" id="report">
  <div class="rv-section-head">
    <div class="rv-eyebrow">WHAT YOU GET</div>
    <h2>A decision report, not a sales claim.</h2>
    <p>The useful output is not “SeenRelay installed.” It is evidence about one exact workload under the semantics you actually need.</p>
    <p><b>Verdict vocabulary:</b> USE · DO NOT USE · INSUFFICIENT EVIDENCE.</p>
  </div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Waste map</h3><p>Protected-call count, exact recurrence and the expensive work being repeated across the measured workload.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Native-control comparison</h3><p>In-flight/local reuse, caller-owned state, source-native validators and provider caches are measured before SeenRelay gets credit.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Fit verdict</h3><p>USE only with outcome equivalence and positive economics. Otherwise DO NOT USE or INSUFFICIENT EVIDENCE.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head">
    <div class="rv-eyebrow">ONLY AFTER A POSITIVE AUDIT</div>
    <h2>Use the narrowest cheaper path that preserves the same outcome.</h2>
    <p>Validation reuse for agent fleets can remain entirely caller-owned. The public relay is optional and does not need network coverage for local/private value to exist.</p>
  </div>
  <div class="rv-contract">
    <div class="rv-contract-main">
      <div class="rv-eyebrow">CURRENT PRODUCT PATH</div>
      <h3>In-flight/local → caller-owned private L1 → source native → provider native → optional shared CHECK → validate.</h3>
      <p>Caller-owned private L1 can share sealed state across workers or restarts. Store/codec/relay failures fail open to the application's normal validation path. The original validation remains the fallback whenever reuse is not justified.</p>
    </div>
    <div class="rv-contract-list">
      <article><b>Caller-owned private L1</b><span>Encrypted private fleet reuse can create value without exposing private results to the public relay.</span></article>
      <article><b>Explicit freshness</b><span>A completed result suppresses source validation only under an explicit caller policy.</span></article>
      <article><b>Authoritative fallback</b><span>Unknown, stale, contested or ineligible work runs the original validation normally.</span></article>
    </div>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="/fleet">Open fleet deployment</a><a class="rv-button quiet" href="/data-practices">Data practices →</a></div>
</section>

<section class="rv-shell rv-section" id="tests">
  <div class="rv-section-head">
    <div class="rv-eyebrow">MEASURED MECHANICS</div>
    <h2>What SeenRelay has demonstrated — and what it has not.</h2>
    <p>These are first-party smoke tests, not a universal ROI claim. Workload fit still has to be measured on your real traffic.</p>
  </div>
  <div class="rv-evidence-cards" aria-label="SeenRelay benchmark results">${evidenceCards()}</div>
  <div class="rv-evidence-interpretation">
    <article><b>Established</b><p>Bounded reuse can bypass equivalent provider work and reduce provider-unit consumption in the measured mechanics.</p></article>
    <article><b>Not established</b><p>These tests do not establish a universal hit rate, guaranteed savings, or that SeenRelay should beat a cheaper authoritative/source-native mechanism.</p></article>
    <article><b>Your workload decides</b><p>Run Shadow Proof while every authoritative validation still runs; measure native controls and prospective economics before admission.</p><a href="https://github.com/ovladon/seenrelay/blob/main/docs/SHADOW_AUDIT.md">Open the free audit guide →</a></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/economics">Full benchmark details and caveats</a><a class="rv-button quiet" href="/product-facts.json">Machine-readable evidence →</a></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head">
    <div class="rv-eyebrow">BOUNDARY</div>
    <h2>SeenRelay is not a browser, truth oracle or generic cache.</h2>
    <p>CHECK and OBSERVE remain the only hosted domain operations. CHECK asks about compatible recent evidence; OBSERVE contributes a freshly and independently obtained observation. SeenRelay does not independently browse or decide truth.</p>
  </div>
  <div class="rv-contract">
    <div class="rv-contract-main">
      <div class="rv-eyebrow">WHEN IT FITS</div>
      <h3>Repeated, deterministic, expensive read-only validation.</h3>
      <p>Strong candidates include browser/portal validation, metered scraping/extraction, model-assisted parsing, paid search, rate-limited APIs and multi-step validation chains. Cheap one-off or mutating operations are poor fits.</p>
    </div>
    <div class="rv-contract-list">
      <article><b>Source authority is preserved</b><span>The original validation remains the fallback whenever reuse is not justified.</span></article>
      <article><b>Stronger native controls win</b><span>SeenRelay should stay out when an equivalent native path is cheaper or stronger.</span></article>
      <article><b>Machine-readable integration</b><span>OpenAPI, MCP, service JSON, llms.txt, Agent Skill discovery and client integration catalogs expose supported surfaces.</span></article>
    </div>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/trust">Trust model</a><a class="rv-button" href="/quickstart">Quickstart</a><a class="rv-button quiet" href="https://github.com/ovladon/seenrelay">GitHub →</a></div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">START WITH EVIDENCE</div><h2>Check the surface or measure the workload — then stop if the evidence says stop.</h2><p>For sites, prefer native fixes first. For agent workloads, keep every original call. If the report shows material safe recurrence and positive economics, promote only that path. If it does not, leave it alone.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/readiness">Check a site</a><a class="rv-button" href="#audit">Run free audit</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
