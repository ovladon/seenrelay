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
  const f = publicProductFacts;
  const version = esc(f.install.client_version);
  const npmCommand = esc(f.install.npm_command);
  const pipCommand = esc(f.install.pypi_command);
  const scanCommand = esc(f.install.scan_command);
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;
  const claudePluginCommand = `claude plugin marketplace add ovladon/seenrelay\nclaude plugin install --scope user seenrelay@seenrelay`;
  const auditPrompt = 'Run a SeenRelay shadow audit on this project. Find repeated expensive read-only validations, preserve every authoritative call, measure stronger local/source/provider-native controls first, do not enable reuse, and return USE / DO NOT USE / INSUFFICIENT EVIDENCE for each measured workload.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay helps agents decide when a known external state needs fresh validation, using local and source-native controls first and recent shared evidence only when it adds measured value.">
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
<meta property="og:title" content="SeenRelay — know when your agents need to look again">
<meta property="og:description" content="Known state, recent evidence, native controls and authoritative fallback — one decision boundary before agents spend resources validating again.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Know when agents need to validate again</title>
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
    <a href="#how">How it works</a>
    <a href="#live-check">Try it</a>
    <a href="/fleet">Product</a>
    <a href="/clients">Integrations</a>
    <a href="/trust">Trust</a>
    <a href="/quickstart">Docs</a>
  </nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="#how">How it works</a><a href="#live-check">Try it</a><a href="/fleet">Product</a><a href="/clients">Integrations</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a><a href="/readiness">Free site tool</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-chip" href="/clients">Integrations</a><a class="rv-button primary" href="#live-check">Try SeenRelay free</a></div>
</header>

<main id="main-content">
<section class="rv-shell rv-hero rv-funnel-hero" id="what">
  <div>
    <div class="rv-kicker"><i></i><span>FREE · NO ACCOUNT · CLIENT ${version}</span></div>
    <h1>Your agents already know things. <em>SeenRelay helps decide when they need to look again.</em></h1>
    <p class="rv-lead">Put one decision boundary before eligible read-only revalidation. Use local or caller-owned state first, source-native confirmation when available, compatible recent observations only when useful, and the authoritative source whenever evidence or policy is insufficient. Start in shadow mode: every authoritative call still runs until the real workload earns a narrower shortcut.</p>
    <div class="rv-actions rv-actions-spaced">
      <a class="rv-button primary" href="#live-check">Try one live CHECK</a>
      <a class="rv-button" href="#start">Audit my agent</a>
    </div>
    <div class="rv-proofline" aria-label="Current product facts">
      <span>free</span><span>no account</span><span>no SeenRelay API key</span><span>known-state revalidation</span><span>native-first</span><span>shadow-first</span><span>fail open</span><span>CHECK + OBSERVE</span>
    </div>
  </div>
  <aside class="rv-demo rv-verdict-demo" aria-label="Example SeenRelay audit output">
    <div class="rv-demo-head"><span>what you get</span><b>one decision per workload</b></div>
    <div class="rv-verdict-card">
      <div class="rv-verdict-top"><span>WORKLOAD VERDICT</span><strong>USE / DO NOT USE / INSUFFICIENT EVIDENCE</strong></div>
      <div class="rv-verdict-grid">
        <div><span>Repetition</span><b>Measured from your real run</b></div>
        <div><span>Safety</span><b>Compared with the authoritative result</b></div>
        <div><span>Economics</span><b>Native controls + SeenRelay overhead included</b></div>
        <div><span>Next step</span><b>Exact path to keep, enable or reject</b></div>
      </div>
      <p>No guessed hit rate. No benchmark-derived promise. Your workload decides.</p>
    </div>
  </aside>
</section>

<section class="rv-band" aria-label="SeenRelay principles"><div class="rv-band-inner">
  <div><b>Known state first</b><span>Ask whether a value needs revalidation now</span></div>
  <div><b>Native first</b><span>ETag/cache wins when it answers the same question better</span></div>
  <div><b>Recent evidence, not truth</b><span>CHECK reports compatible observations</span></div>
  <div><b>Fall back safely</b><span>The authoritative source remains available</span></div>
</div></section>

<section class="rv-shell rv-section rv-live-check-section" id="live-check">
  <div class="rv-section-head">
    <div class="rv-eyebrow">SEE THE DECISION LAYER WORK</div>
    <h2>Ask one real question before integrating anything.</h2>
    <p>Choose a canonical public fact, enter the value you already know, and choose the maximum evidence age your own policy is willing to consider. SeenRelay will run the existing CHECK operation and return recent compatible evidence. It will not fetch the authoritative answer or authorize reuse.</p>
  </div>
  <div class="rv-live-check-grid">
    <form class="rv-live-check-form" id="live-check-form" data-catalog-endpoint="/starter-facts.json" data-check-endpoint="/v1/check">
      <label for="live-check-fact">1. Choose a starter fact</label>
      <select id="live-check-fact" name="fact" required><option value="">Loading starter facts…</option></select>
      <div class="rv-live-check-source" id="live-check-source">Canonical source details will appear here.</div>

      <label for="live-check-known">2. Enter the value you already know</label>
      <input id="live-check-known" name="known" type="text" autocomplete="off" spellcheck="false" placeholder="Example: none or v24.0.0" required>

      <label for="live-check-max-age">3. Choose your freshness window</label>
      <div class="rv-live-check-age">
        <input id="live-check-max-age" name="maxAge" type="number" min="1" max="604800" step="1" inputmode="numeric" placeholder="Seconds, e.g. 300" required>
        <span>1 second – 7 days. SeenRelay does not choose this for you.</span>
      </div>

      <button class="rv-button primary rv-live-check-submit" type="submit">Ask SeenRelay</button>
      <p class="rv-live-check-boundary">Evidence trial only. <b>SAME_OBSERVED is not truth and does not by itself permit suppression.</b> The authoritative source remains the fallback.</p>
    </form>

    <aside class="rv-live-check-result" id="live-check-result" aria-live="polite">
      <div class="rv-demo-head"><span>LIVE RESULT</span><b>CHECK only</b></div>
      <div class="rv-live-check-state" data-state="idle">
        <span class="rv-live-check-status">READY</span>
        <h3>One known state. One explicit freshness policy.</h3>
        <p>Open the authoritative source if you need to confirm the value first. Then ask SeenRelay whether compatible recent observations exist within the window you chose.</p>
        <dl>
          <div><dt>Evidence age</dt><dd>—</dd></div>
          <div><dt>Observers</dt><dd>—</dd></div>
        </dl>
      </div>
    </aside>
  </div>
</section>

<section class="rv-shell rv-section" id="how">
  <div class="rv-section-head"><div class="rv-eyebrow">THE DECISION BOUNDARY</div><h2>Before paying to look again, ask what you already know.</h2><p>SeenRelay does not replace your agents, source of truth or provider. It coordinates the decision to revalidate a known external state.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Retain the known state</h3><p>Your application already has a value from an earlier authoritative observation. SeenRelay does not need to become the source of truth.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Decide whether to look again</h3><p>Local/private reuse and source-native validators go first. An optional CHECK can add recent compatible evidence for a deterministic source-backed fact.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Validate when policy says so</h3><p>Unknown, stale, contested or uneconomic paths fall through. After fresh independent validation, OBSERVE can help the next compatible caller.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="start">
  <div class="rv-section-head">
    <div class="rv-eyebrow">TEST IT ON YOUR AGENT</div>
    <h2>Then scan a real workload. Integrate only a real candidate.</h2>
    <p><code>seenrelay scan</code> reads supported project files locally, uploads nothing, changes nothing and cannot return a USE verdict. If it finds a candidate, continue with a coding agent or the client directly.</p>
    <div class="rv-code"><pre id="scan-command">${scanCommand}</pre><button class="rv-copy" type="button" data-copy-target="scan-command">Copy</button></div>
  </div>
  <div class="rv-adopt">
    <div class="rv-mode-card">
      <div class="rv-segment" role="tablist" aria-label="Installation mode"><button type="button" role="tab" aria-selected="true" data-mode-button="agent">Coding agent</button><button type="button" role="tab" aria-selected="false" data-mode-button="human">Developer</button></div>
      <div class="rv-mode-copy"><h3>Start without learning SeenRelay first.</h3><p>The Agent Skill inspects the project, uses only a supported integration boundary and returns a decision instead of blindly enabling reuse.</p></div>
      <div class="rv-mode-note">No SeenRelay account or API key is required. Your existing providers may still require their own credentials.</div>
    </div>
    <div class="rv-console rv-funnel-console" aria-live="polite">
      <div class="rv-console-top"><span class="rv-dots"><i></i><i></i><i></i></span><span>free shadow audit</span></div>
      <div class="rv-console-body">
        <div class="rv-install-view active" data-install-view="agent" id="agent-audit">
          <div class="rv-step"><span>1</span><div><h4>Prescreen locally</h4><p>Run <code>npx seenrelay scan</code>. Continue only if it finds a candidate worth runtime measurement.</p></div></div>
          <div class="rv-step"><span>2</span><div><h4>Install the SeenRelay skill or Claude Code plugin</h4><p><b>Claude Code:</b> use the validated repository-hosted persistent plugin path.</p><div class="rv-code"><pre id="claude-plugin-install">${esc(claudePluginCommand)}</pre><button class="rv-copy" type="button" data-copy-target="claude-plugin-install">Copy</button></div><p><b>Other Agent Skills clients:</b></p><div class="rv-code"><pre id="skill-install">${esc(skillCommand)}</pre><button class="rv-copy" type="button" data-copy-target="skill-install">Copy</button></div><p>The repository-hosted Claude path does not imply Anthropic marketplace approval, does not attach the hosted MCP endpoint, and does not enable reuse.</p></div></div>
          <div class="rv-step"><span>3</span><div><h4>Give your coding agent this task</h4><div class="rv-code"><pre id="agent-prompt">${esc(auditPrompt)}</pre><button class="rv-copy" type="button" data-copy-target="agent-prompt">Copy</button></div></div></div>
          <div class="rv-step"><span>4</span><div><h4>Read the verdict</h4><p>Keep SeenRelay only on workloads that show safe repetition and positive net economics after stronger native controls.</p></div></div></div>
        </div>
        <div class="rv-install-view" data-install-view="human" id="developer-audit">
          <div class="rv-step"><span>1</span><div><h4>Prescreen locally</h4><div class="rv-code"><pre id="developer-scan">${scanCommand}</pre><button class="rv-copy" type="button" data-copy-target="developer-scan">Copy</button></div><p>No source upload, no project modification and no USE verdict from static analysis.</p></div></div>
          <div class="rv-step"><span>2</span><div><h4>Install</h4><div class="rv-code"><pre id="npm-install">${npmCommand}</pre><button class="rv-copy" type="button" data-copy-target="npm-install">Copy</button></div><div class="rv-code"><pre id="pip-install">${pipCommand}</pre><button class="rv-copy" type="button" data-copy-target="pip-install">Copy</button></div></div></div>
          <div class="rv-step"><span>3</span><div><h4>Wrap an existing MCP-style client</h4><div class="rv-code"><pre id="ambient-example">import { ambientMcpClient } from 'seenrelay/ambient';\n\nconst client = ambientMcpClient(rawMcpClient);\n// run your existing workload normally\nconsole.log(client.seenRelayAmbient.getReport());</pre><button class="rv-copy" type="button" data-copy-target="ambient-example">Copy</button></div></div></div>
          <div class="rv-step"><span>4</span><div><h4>Evaluate before enabling reuse</h4><p>The local report finds exact repeat candidates. Shadow Proof and the economics evaluator can then test safety and net value on the real workload.</p><a href="/quickstart#evaluate">Open the evaluation recipe →</a></div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="rv-shell rv-section" id="fit">
  <div class="rv-section-head"><div class="rv-eyebrow">WHERE IT FITS</div><h2>SeenRelay is for revalidation decisions where another look has a real cost.</h2><p>The core shape is simple: the caller already knows a source-backed value, freshness matters, and validating again consumes enough time, provider spend, rate limit, browser work or downstream computation to justify a decision layer.</p></div>
  <div class="rv-usecases">
    <article class="rv-usecase"><i>01</i><h3>Known public state</h3><p>Versions, status and other deterministic source-backed facts that callers retain and periodically revalidate.</p></article>
    <article class="rv-usecase"><i>02</i><h3>Browser / paid validation</h3><p>Read-only browser, search, extraction or proxy work where a fresh look has measurable marginal cost.</p></article>
    <article class="rv-usecase"><i>03</i><h3>Agent fleets</h3><p>Workers, runs or organizations that may otherwise ask the same freshness question independently.</p></article>
    <article class="rv-usecase"><i>04</i><h3>Temporal provenance</h3><p>Workflows that need to know not only a value, but when compatible independent observations last supported it.</p></article>
  </div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button" href="/starter-facts">See canonical starter facts</a><a class="rv-button" href="/fleet">See the product architecture</a><a class="rv-button quiet" href="/clients">Browse integrations →</a></div>
</section>

<section class="rv-shell rv-section" id="safety">
  <div class="rv-section-head"><div class="rv-eyebrow">SAFE BY DEFAULT</div><h2>SeenRelay does not replace your source of truth.</h2><p>It sits in front of eligible read-only validation and gets out of the way whenever the evidence or policy is insufficient.</p></div>
  <div class="rv-contract">
    <article class="rv-contract-main"><div class="rv-eyebrow">DEFAULT</div><h3>When in doubt, validate normally.</h3><p>Unknown, stale, contested, unsupported or ineligible work falls through to the operation your application was already going to run.</p></article>
    <div class="rv-contract-list">
      <article><b>No truth oracle</b><span>SeenRelay reports recent compatible observations; it does not decide reality.</span></article>
      <article><b>No mutation suppression</b><span>Mutating or destructive operations are outside the reuse target.</span></article>
      <article><b>Caller-owned private reuse</b><span>Private L1 values, keys and retention stay under caller control.</span></article>
      <article><b>Optional shared evidence</b><span>Hosted SeenRelay still exposes exactly CHECK and OBSERVE; shared CHECK is optional.</span></article>
    </div>
  </div>
</section>

<section class="rv-shell rv-section rv-compact-section" id="resources">
  <div class="rv-section-head"><div class="rv-eyebrow">INTEGRATIONS</div><h2>Use the stack you already have.</h2><p>SeenRelay currently supports JavaScript/TypeScript and Python clients plus supported Ambient adapters for MCP-style clients and selected agent frameworks. Unsupported paths are left unchanged rather than guessed.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">MCP</span><h3>MCP clients</h3><p>Measure an existing <code>callTool()</code> / <code>call_tool()</code> path without rewriting the agent.</p><a href="/clients">Integration chooser →</a></article>
    <article class="rv-card"><span class="rv-number">AGENTS</span><h3>Agent frameworks</h3><p>Supported Ambient adapters include OpenAI Agents and other published framework boundaries documented by the installed client.</p><a href="/clients">See supported adapters →</a></article>
    <article class="rv-card"><span class="rv-number">CODE</span><h3>Plain read-only work</h3><p>Use provider-independent Zero-State around explicitly eligible deterministic validation functions.</p><a href="/quickstart">Open quickstart →</a></article>
  </div>
</section>

<section class="rv-shell rv-section rv-compact-section">
  <div class="rv-section-head"><div class="rv-eyebrow">SEPARATE FREE TOOL</div><h2>Own a site or API?</h2><p>The AI Visit Efficiency checker audits a public HTTP surface and recommends native HTTP fixes first. It is separate from the SeenRelay runtime product.</p></div>
  <div class="rv-actions"><a class="rv-button" href="/readiness">Open the free site tool</a></div>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">START WITH ONE DECISION</div><h2>Measure whether one known state really needs another expensive look.</h2><p>If local or source-native controls already solve it better, leave SeenRelay out. If recent shared evidence creates measurable residual value, promote only that path.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="#live-check">Try one live CHECK</a><a class="rv-button" href="#start">Audit my agent</a></div>
</section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}