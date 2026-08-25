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
    access: { account_required: false, current_pricing: 'free' },
    hive: {
      lease: 'signed operational slot; no account required',
      reward: 'contribution credit is based on later qualifying reuse'
    },
    protocols: {
      rest_openapi: { status: 'implemented', url: `${origin}/openapi.json` },
      mcp: { status: 'implemented_e2e_verified', revision: standardsPosture.mcp.implemented, url: `${origin}/mcp` },
      a2a: { status: standardsPosture.a2a.status, tracked: standardsPosture.a2a.tracked }
    },
    integration_paths: {
      deterministic_wrappers: {
        status: 'implemented',
        recommendation: 'Use when the application must execute SeenRelay CHECK whenever a selected validation path runs.',
        javascript_typescript: 'https://github.com/ovladon/seenrelay/tree/main/clients/typescript',
        python: 'https://github.com/ovladon/seenrelay/tree/main/clients/python',
        failure_semantics: 'Relay-side failure fails open into the application existing validation path.'
      },
      mcp: {
        role: 'Standard discovery and model/tool-routing interface.',
        url: `${origin}/mcp`
      }
    },
    external_verification: false,
    source_validation_hints: {
      assurance: 'observer_supplied_unverified',
      conditional_request_headers: ['If-None-Match', 'If-Modified-Since'],
      semantics: 'Optimization hints only; the caller decides whether source confirmation is still required.'
    },
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
<meta name="description" content="Put a deterministic SeenRelay freshness preflight around existing validation with JavaScript or Python wrappers, or expose the same CHECK and OBSERVE operations through MCP.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Shared freshness for AI agents">
<meta property="og:description" content="Deterministic freshness preflight for application validation paths, with MCP available for agent tool routing.">
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
<h1>Before repeating a fact validation, check whether recent evidence already exists.</h1>
<p class="lead">SeenRelay is a small, low-cost freshness preflight. For application workflows that must run the preflight whenever a selected validation path executes, use the deterministic JavaScript/TypeScript or Python wrapper to place <b>CHECK</b> directly in that call path. MCP remains the standard discovery and model/tool-routing interface. If validation still runs, <b>OBSERVE</b> records what the caller independently found so later runs or other agents may avoid repeating the same work.</p>
<div class="cta"><a class="primary" href="/clients">Use a deterministic wrapper</a><a class="secondary" href="/clients">Connect via MCP</a><a class="secondary" href="/quickstart">5-minute quickstart</a><a class="secondary" href="/service.json">For machines</a></div>
<div class="contract"><span>Exactly 2 operations</span><b>CHECK</b><b>OBSERVE</b><span>Currently free · no account · no browse/search · no truth verdict</span></div>
</section>

<section id="how" class="section">
<div class="section-head"><div><div class="eyebrow">THE IDEA IN 30 SECONDS</div><h2>A shared cache for freshness evidence, not content.</h2></div><p>An ordinary cache avoids fetching the same content again. SeenRelay lets agents reuse timestamped observations created while they were already doing normal work.</p></div>
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

<section class="section split decision">
<div><div class="eyebrow">USEFUL FROM THE FIRST CALLER</div><h2>Network effects add coverage; they are not required to start.</h2><p>If the network has no observation for a fact, CHECK returns <b>UNKNOWN</b> and the caller continues its normal validation. When that caller later sends OBSERVE, the result is immediately available to later CHECKs, including from the same integration or fleet.</p><p>If that observation includes an ETag or Last-Modified validator, a later CHECK can also return it as an explicitly unverified conditional-request hint. The source, not SeenRelay, decides whether a conditional request is still valid.</p></div>
<div class="proof-grid"><article><b>Empty network</b><span>CHECK returns UNKNOWN; the existing workflow continues normally.</span></article><article><b>First observation</b><span>An agent validates the source for its own task and sends OBSERVE.</span></article><article><b>Same integration or fleet</b><span>Later CHECKs can benefit from the observation before any public network effect exists.</span></article><article><b>Cheaper revalidation</b><span>Observer-supplied ETag or Last-Modified metadata can support a conditional source request before expensive downstream work.</span></article></div>
</section>

<section id="network" class="section">
<div class="section-head"><div><div class="eyebrow">LIVE NETWORK</div><h2>Aggregate network activity.</h2></div><p>Privacy-safe operational measurements from the running service. Reuse metrics are activity signals, never truth scores.</p></div>
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
<div><div class="eyebrow">INTEGRATION PATHS</div><h2>Deterministic in application code. MCP when tool routing is appropriate.</h2><p>If the application must execute CHECK whenever a selected validation path runs, vendor the zero-dependency JavaScript/TypeScript or Python wrapper. It fails open into the validation the application already planned. If model-selected tool use is appropriate, connect the same two SeenRelay operations through the remote MCP endpoint.</p><div class="flow"><span>need fact</span><i>→</i><span>CHECK</span><i>→</i><span>reuse or validate</span><i>→</i><span>OBSERVE</span></div><p><a href="/clients">Choose the deterministic wrapper or MCP setup →</a></p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>integration</b></div><pre>Deterministic application path
JavaScript / TypeScript wrapper
Python wrapper

MCP discovery / tool routing
${origin}/mcp
io.github.ovladon/seenrelay

Same domain operations
CHECK
OBSERVE</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">SAFE ADOPTION</div><h2>Start in shadow mode.</h2><p>For deterministic application integration, place the wrapper around existing validation but initially skip nothing. Compare SeenRelay status with the result your workflow obtains normally, then allow bounded reuse only for fact classes and freshness windows accepted by your own policy.</p><p>When CHECK includes a conditional-request hint, treat it only as a way to make source confirmation cheaper. It is observer-supplied metadata, not a SeenRelay truth or freshness certificate.</p><p>Access is currently free, so the first integration can focus on signal quality and workflow fit rather than account setup.</p><p><a href="/quickstart">Open the integration sequence →</a></p></div>
<div class="proof-grid"><article><b>Best fit</b><span>Repeated machine-locatable prices, statuses, versions, availability, capacities, and similar changing facts.</span></article><article><b>Keep validating</b><span>When the result is UNKNOWN, STALE, CONTESTED, or your policy requires a fresh source check.</span></article><article><b>Measure</b><span>Status distribution, downstream operations actually skipped, latency, and policy exceptions.</span></article><article><b>Stay bounded</b><span>SeenRelay supplies freshness evidence; the consuming workflow retains the final decision.</span></article></div>
</section>

<section id="trust" class="section trust"><div class="section-head"><div><div class="eyebrow">TRUST POSTURE</div><h2>Useful because its claims stay narrow.</h2></div></div>
<div class="trust-grid"><article><span class="ok">01</span><h3>No hidden research</h3><p>SeenRelay itself does not browse, search, fetch fact sources, or call a model to decide truth.</p></article><article><span class="ok">02</span><h3>Deterministic fact identity</h3><p>The same fact is matched through source-native locators or canonical predicates, not fuzzy LLM similarity.</p></article><article><span class="ok">03</span><h3>Provenance without overclaim</h3><p>Optional Ed25519 proof establishes key possession, continuity and payload integrity — not real-world identity or truth.</p></article><article><span class="ok">04</span><h3>Tested before release</h3><p>CI and an isolated Preview Release Gate exercise REST, MCP, security boundaries and product guardrails before Production promotion.</p></article></div>
<div class="trust-note"><a href="/data-practices">Inspect technical data practices →</a></div>
</section>

<section class="section final"><div><div class="eyebrow">CONNECT WITHOUT COMMITTING YOUR WORKFLOW</div><h2>Start free in shadow mode and let your own observations seed later reuse.</h2></div><div class="cta"><a class="primary" href="/clients">Use a deterministic wrapper</a><a class="secondary" href="/clients">Connect via MCP</a><a class="secondary" href="/quickstart">Start the pilot</a><a class="secondary" href="/service.json">Machine descriptor</a></div></section>
</main>
<footer><span>SeenRelay</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
<script src="/site.js" defer></script>
</body></html>`;
}
