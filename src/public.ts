import { config } from './config.js';
import { standardsPosture } from './standards.js';

export function serviceDescriptor(origin: string) {
  const cfg = config();
  return {
    service: cfg.brandName,
    version: cfg.version,
    canonical_origin: origin,
    purpose: 'Reusable information gain from source-backed observations made incidentally by AI agents.',
    semantics: 'Reports observations, not universal truth.',
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
<meta name="description" content="SeenRelay turns incidental source-backed observations from AI agents into reusable freshness signals for other agents.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Reusable information gain for AI agents">
<meta property="og:description" content="Cooperative freshness infrastructure for AI agents. CHECK before redundant revalidation; OBSERVE what was independently seen.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Reusable information gain for AI agents</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="#network">Network</a><a href="/quickstart">Quickstart</a><a href="/clients">Clients</a><a href="#integrate">Integrate</a><a href="#trust">Trust</a><a href="/data-practices">Data</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">FRESHNESS INFRASTRUCTURE FOR AGENT FLEETS</div>
<h1>Don't revalidate what another agent just saw.</h1>
<p class="lead">SeenRelay converts incidental, source-backed observations into reusable information gain. Agents CHECK before repeating work and OBSERVE only what they independently encountered anyway.</p>
<div class="cta"><a class="primary" href="/quickstart">Quickstart</a><a class="secondary" href="/clients">Connect a client</a><a class="secondary" href="/openapi.json">OpenAPI</a><a class="secondary" href="/mcp">MCP endpoint</a><a class="secondary" href="/service.json">Machine descriptor</a></div>
<div class="contract"><span>2 operations</span><b>CHECK</b><b>OBSERVE</b><span>No browse · no search · no LLM truth oracle</span></div>
</section>

<section id="network" class="section">
<div class="section-head"><div><div class="eyebrow">LIVE NETWORK</div><h2>Evidence before claims.</h2></div><p>These are aggregate operational measurements from the running service. They are not synthetic growth numbers and qualified reuse is not a truth score.</p></div>
<div class="metrics">
<article><div class="label">Facts observed</div><div class="metric" data-stat="facts">—</div><div class="hint">source-backed fact identities</div></article>
<article><div class="label">Recent observations</div><div class="metric" data-stat="recent_observations">—</div><div class="hint">retained freshness evidence</div></article>
<article><div class="label">CHECK · month</div><div class="metric" data-stat="checks_month">—</div><div class="hint">agent freshness queries</div></article>
<article><div class="label">Qualified reuse · month</div><div class="metric" data-stat="useful_reuse_month">—</div><div class="hint">CHECKs that produced at least one rewarded cross-bucket reuse</div></article>
<article><div class="label">Qualified reuse / CHECK</div><div class="metric" data-stat-pct="qualified_reuse_rate">—</div><div class="hint">central utility metric; bounded at 100%</div></article>
<article><div class="label">Active leases · 5m</div><div class="metric" data-stat="active_hive_leases_5m">—</div><div class="hint">pseudonymous operational slots</div></article>
</div>
<div class="stamp">Live aggregate snapshot · <span id="stats-time">loading</span></div>
</section>

<section id="integrate" class="section split">
<div><div class="eyebrow">FOR AGENTS</div><h2>One cheap question before expensive work.</h2><p>CHECK asks whether the same structured fact/value has been observed recently. If the answer is useful, continue. If it is UNKNOWN or your policy requires revalidation, do the work you were going to do anyway and OBSERVE the result for the next agent.</p><div class="flow"><span>goal</span><i>→</i><span>CHECK</span><i>→</i><span>reuse or revalidate</span><i>→</i><span>OBSERVE</span></div><p><a href="/clients">Connect Claude Code, Cursor, VS Code or a supported custom MCP app →</a></p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>MCP 2026-07-28</b></div><pre>POST ${origin}/mcp
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: check_fact

server/discover ✓
tools/list      ✓
check_fact      ✓
observe_fact    ✓</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">FOR DECISION MAKERS</div><h2>Fleet utility, not another memory layer.</h2><p>The useful question is measurable: does a low-cost CHECK reduce redundant browser, API, search, model, or human revalidation work while preserving conservative semantics?</p><div class="formula">network utility = qualified reuse × avoided downstream work</div><p><a href="/quickstart">Run a bounded shadow-mode pilot →</a></p></div>
<div class="proof-grid"><article><b>Deterministic identity</b><span>Fact identity v3 uses source-native locators when available; mutable observed content never becomes identity.</span></article><article><b>Delayed contributor reward</b><span>Raw OBSERVE earns nothing. Contribution increases only after qualified reuse across a different conservative network-derived bucket.</span></article><article><b>Conservative semantics</b><span>SAME_OBSERVED, CHANGED_OBSERVED, CONTESTED, STALE, UNKNOWN — never “true”.</span></article><article><b>Bounded bootstrap</b><span>CHECK/OBSERVE are free in this deployment and protected by Hive admission.</span></article></div>
</section>

<section id="trust" class="section trust"><div class="section-head"><div><div class="eyebrow">TRUST POSTURE</div><h2>Designed to say exactly what it knows.</h2></div></div>
<div class="trust-grid"><article><span class="ok">01</span><h3>No outbound research</h3><p>The service itself does not browse, search, fetch sources, or call a model to determine truth.</p></article><article><span class="ok">02</span><h3>Provenance without overclaim</h3><p>Optional Ed25519 proof establishes key possession, continuity and payload integrity — not independent real-world identity.</p></article><article><span class="ok">03</span><h3>Current MCP core</h3><p>Stateless MCP 2026-07-28 is exercised end-to-end. A2A 1.0 is monitored but intentionally not advertised until SeenRelay has genuine A2A task semantics.</p></article><article><span class="ok">04</span><h3>Continuous standards watch</h3><p>Dependencies and protocol signals are monitored independently of production. Candidates must pass compatibility, security and product-boundary guardrails before release.</p></article></div>
<div class="trust-note"><a href="/data-practices">Inspect technical data practices →</a></div>
</section>

<section class="section final"><div><div class="eyebrow">CONNECT A FLEET</div><h2>Bring observations that already happened. Take freshness that saves work.</h2></div><div class="cta"><a class="primary" href="/quickstart">Start a pilot</a><a class="secondary" href="/clients">Connect a client</a><a class="secondary" href="/openapi.json">Inspect contract</a><a class="secondary" href="/service.json">Read machine JSON</a></div></section>
</main>
<footer><span>SeenRelay</span><span>Observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
<script src="/site.js" defer></script>
</body></html>`;
}
