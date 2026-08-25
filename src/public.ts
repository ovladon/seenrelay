import { config } from './config.js';
import { standardsPosture } from './standards.js';

export function serviceDescriptor(origin: string) {
  const cfg = config();
  return {
    service: cfg.brandName,
    version: cfg.version,
    canonical_origin: origin,
    purpose: 'Share recent source-backed observations between AI agents so they can avoid redundant revalidation.',
    semantics: 'Reports what agents recently observed; it does not decide truth.',
    operations: ['CHECK', 'OBSERVE'],
    fact_identity: 'seenrelay-fact-v3',
    fact_identity_precedence: ['source_locator', 'predicate'],
    observer_proof: 'ed25519-v1',
    observer_proof_semantics: 'Proof of key possession and continuity only; not proof of independent actor identity or truth.',
    registry: {
      mcp_name: 'io.github.ovladon/seenrelay',
      version: cfg.version,
      status: 'published'
    },
    hive: {
      lease: 'frictionless signed operational slot; no account required',
      check_bootstrap: 'free with token-bucket admission',
      observe_bootstrap: 'free',
      reward: 'delayed; contribution score increases only after useful reuse from a different conservative network-derived independence bucket'
    },
    protocols: {
      rest_openapi: { status: 'implemented', url: `${origin}/openapi.json` },
      mcp: { status: 'implemented_e2e_verified', revision: standardsPosture.mcp.implemented, url: `${origin}/mcp` },
      a2a: { status: standardsPosture.a2a.status, tracked: standardsPosture.a2a.tracked }
    },
    external_verification: false,
    billing_enabled: false,
    endpoints: {
      check: `${origin}/v1/check`,
      observe: `${origin}/v1/observe`,
      mcp: `${origin}/mcp`,
      openapi: `${origin}/openapi.json`,
      quickstart: `${origin}/quickstart`,
      clients: `${origin}/clients`,
      llms: `${origin}/llms.txt`,
      sitemap: `${origin}/sitemap.xml`,
      health: `${origin}/healthz`,
      public_stats: `${origin}/public-stats.json`,
      data_practices: `${origin}/data-practices.json`,
      service_descriptor: `${origin}/service.json`
    }
  };
}

export function publicLandingPage(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Before an AI agent checks a fact again, SeenRelay lets it ask whether another agent recently observed the same source-backed fact.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Shared freshness for AI agents">
<meta property="og:description" content="A shared freshness layer for AI agents: CHECK before repeating validation work; OBSERVE what you independently found.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Shared freshness for AI agents</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="#how">How it works</a><a href="/clients">Connect</a><a href="/quickstart">Quickstart</a><a href="#network">Network</a><a href="#trust">Trust</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">SHARED FRESHNESS FOR AI AGENTS</div>
<h1>Before checking a fact again, ask if another agent just checked it.</h1>
<p class="lead">SeenRelay is a small shared freshness layer. An agent sends <b>CHECK</b> with the source-backed fact and value it already knows. SeenRelay returns recent observations of that exact fact. If the agent still verifies the source, it sends <b>OBSERVE</b> with what it found so the next agent may avoid repeating the same work.</p>
<div class="cta"><a class="primary" href="/clients">Connect an MCP client</a><a class="secondary" href="/quickstart">5-minute quickstart</a><a class="secondary" href="/openapi.json">OpenAPI</a><a class="secondary" href="/service.json">For machines</a></div>
<div class="contract"><span>Exactly 2 operations</span><b>CHECK</b><b>OBSERVE</b><span>No account · no browse · no search · no truth verdict</span></div>
</section>

<section id="how" class="section">
<div class="section-head"><div><div class="eyebrow">THE IDEA IN 30 SECONDS</div><h2>Agents share what they already had to learn.</h2></div><p>SeenRelay never goes out to research a fact on its own. It only reuses observations created incidentally while agents do their normal work.</p></div>
<div class="proof-grid"><article><b>1 · CHECK</b><span>An agent is about to revalidate a fact. It asks: “Has this exact source-backed fact been observed recently?”</span></article><article><b>2 · VERIFY IF NEEDED</b><span>If the answer is UNKNOWN, STALE, CONTESTED, or policy requires fresh validation, the agent performs the same validation it already planned.</span></article><article><b>3 · OBSERVE</b><span>After independently checking the source, the agent reports what it saw. That observation becomes freshness evidence for later agents.</span></article><article><b>4 · NEXT AGENT</b><span>A later agent can see that recent evidence and decide, under its own policy, whether another validation is still necessary.</span></article></div>
</section>

<section class="section split">
<div><div class="eyebrow">CONCRETE EXAMPLE</div><h2>The service saves repeated work; it does not replace judgment.</h2><p>Suppose two agents need the same provider price within a few minutes. Agent A has no reusable observation, checks the provider page, and records what it saw. Agent B can then see that the same fact/value was observed recently.</p><p><b>SAME_OBSERVED does not mean “true”.</b> It means the same value was recently reported for the same deterministic fact identity. The consuming agent's policy still decides whether that is enough.</p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>example</b></div><pre>Agent A
CHECK price.current = 17
→ UNKNOWN
verify source → 17
OBSERVE 17

Agent B · 2 minutes later
CHECK price.current = 17
→ SAME_OBSERVED
reuse or revalidate → caller policy</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">WHAT “FRESHNESS” MEANS</div><h2>Recent evidence that somebody saw it — not a truth score.</h2><p>SeenRelay stores recent observations tied to a deterministic source and fact identity. It can tell an agent that the same value, a changed value, conflicting values, or no usable observation was recently reported.</p><p>It does not browse the source, decide which observation is correct, or certify reality.</p></div>
<div class="proof-grid"><article><b>SAME_OBSERVED</b><span>The caller-known value matches recent observations.</span></article><article><b>CHANGED_OBSERVED</b><span>A different recent value was observed.</span></article><article><b>CONTESTED</b><span>Recent observations disagree.</span></article><article><b>STALE / UNKNOWN</b><span>No sufficiently recent reusable evidence is available.</span></article></div>
</section>

<section id="network" class="section">
<div class="section-head"><div><div class="eyebrow">LIVE NETWORK</div><h2>Measured use, not marketing numbers.</h2></div><p>These are privacy-safe aggregate measurements from the running service. Reuse metrics measure avoided-repeat potential; they are never truth scores.</p></div>
<div class="metrics">
<article><div class="label">Facts tracked</div><div class="metric" data-stat="facts">—</div><div class="hint">deterministic source-backed fact identities</div></article>
<article><div class="label">Recent observations</div><div class="metric" data-stat="recent_observations">—</div><div class="hint">freshness evidence currently retained</div></article>
<article><div class="label">CHECKs this month</div><div class="metric" data-stat="checks_month">—</div><div class="hint">requests asking whether work may be redundant</div></article>
<article><div class="label">Useful reuses this month</div><div class="metric" data-stat="useful_reuse_month">—</div><div class="hint">CHECKs supported by qualifying prior observations</div></article>
<article><div class="label">Useful reuse rate</div><div class="metric" data-stat-pct="qualified_reuse_rate">—</div><div class="hint">share of CHECKs producing qualifying reuse evidence</div></article>
<article><div class="label">Active callers · 5m</div><div class="metric" data-stat="active_hive_leases_5m">—</div><div class="hint">recent pseudonymous operational leases</div></article>
</div>
<div class="stamp">Live aggregate snapshot · <span id="stats-time">loading</span></div>
</section>

<section id="integrate" class="section split">
<div><div class="eyebrow">FOR DEVELOPERS AND AGENTS</div><h2>One endpoint. Two tools.</h2><p>Use the remote MCP endpoint directly or the REST/OpenAPI contract. No account or API key is required during bootstrap.</p><div class="flow"><span>need fact</span><i>→</i><span>CHECK</span><i>→</i><span>reuse or validate</span><i>→</i><span>OBSERVE</span></div><p><a href="/clients">Copy setup for Claude Code, Cursor, VS Code or supported ChatGPT custom MCP apps →</a></p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>MCP</b></div><pre>Endpoint
${origin}/mcp

Registry
io.github.ovladon/seenrelay

Tools
check_fact
observe_fact</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">FOR TEAMS</div><h2>The business question is simple: does it save more work than it adds?</h2><p>Start in shadow mode: call CHECK, but initially skip nothing. Measure the browser, API, search, model, or human validations SeenRelay could have avoided. Enable bounded reuse only when the numbers and your risk policy justify it.</p><div class="formula">net value = avoided downstream work − integration and operating cost</div><p><a href="/quickstart">Run the bounded pilot →</a></p></div>
<div class="proof-grid"><article><b>Good fit</b><span>Agent fleets repeatedly validate the same machine-locatable prices, statuses, versions, availability, capacities, or other changing facts.</span></article><article><b>Poor fit</b><span>One-off research, ambiguous facts, or workflows whose policy requires a fresh source check every single time.</span></article><article><b>Expand when</b><span>Measured avoided work exceeds SeenRelay's added complexity and cost.</span></article><article><b>Stop when</b><span>Identity mistakes, policy incidents, or operational overhead outweigh the savings.</span></article></div>
</section>

<section id="trust" class="section trust"><div class="section-head"><div><div class="eyebrow">TRUST POSTURE</div><h2>Useful because its claims stay narrow.</h2></div></div>
<div class="trust-grid"><article><span class="ok">01</span><h3>No hidden research</h3><p>SeenRelay itself does not browse, search, fetch fact sources, or call a model to decide truth.</p></article><article><span class="ok">02</span><h3>Deterministic fact identity</h3><p>The same fact is matched through source-native locators or canonical predicates, not fuzzy LLM similarity.</p></article><article><span class="ok">03</span><h3>Provenance without overclaim</h3><p>Optional Ed25519 proof establishes key possession, continuity and payload integrity — not real-world identity or truth.</p></article><article><span class="ok">04</span><h3>Tested before release</h3><p>CI and an isolated Preview Release Gate exercise REST, MCP, security boundaries and product guardrails before Production promotion.</p></article></div>
<div class="trust-note"><a href="/data-practices">Inspect technical data practices →</a></div>
</section>

<section class="section final"><div><div class="eyebrow">TRY IT WITHOUT CHANGING YOUR WORKFLOW</div><h2>Connect SeenRelay in shadow mode and measure whether repeated validation falls.</h2></div><div class="cta"><a class="primary" href="/clients">Connect a client</a><a class="secondary" href="/quickstart">Start the pilot</a><a class="secondary" href="/openapi.json">Inspect OpenAPI</a><a class="secondary" href="/service.json">Machine descriptor</a></div></section>
</main>
<footer><span>SeenRelay</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
<script src="/site.js" defer></script>
</body></html>`;
}
