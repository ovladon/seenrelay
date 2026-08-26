import { config } from './config.js';
import { standardsPosture } from './standards.js';
import { publicProductFacts } from './public-facts.generated.js';
import { latestVerifiedHtml, productFactsForOrigin, publicInstallHtml, siteFooterHtml, verifiedBenchmarkHtml, verifiedWorkloadMapHtml } from './public-facts-view.js';

export function serviceDescriptor(origin: string) {
  const cfg = config();
  return {
    service: cfg.brandName,
    version: cfg.version,
    canonical_origin: origin,
    purpose: 'Reduce repeated paid or slow fact revalidation across AI-agent fleets by sharing recent source-backed freshness evidence.',
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
        failure_semantics: "Relay-side failure fails open into the application's existing validation path.",
        client_version: publicProductFacts.install.client_version,
        npm_install: publicProductFacts.install.npm_command,
        pypi_install: publicProductFacts.install.pypi_command,
        runtime_dependencies: publicProductFacts.install.runtime_dependencies,
        public_registry_verified_at: publicProductFacts.install.registry_install_verified_at
      },
      mcp: {
        role: 'Standard discovery and model/tool-routing interface.',
        url: `${origin}/mcp`
      }
    },
    economics: {
      target_workloads: ['paid_web_search', 'metered_scraping', 'browser_or_extraction', 'multi_step_validation', 'rate_limited_api'],
      poor_fit: ['cheap_one_off_fetch', 'fact_with_low_repeat_probability', 'policy_requires_live_authoritative_source_on_every_call'],
      fleet_value: 'One necessary validation can create evidence that lets later runs or agents avoid repeating the same paid or slow validation.',
      current_seenrelay_api_fee: 0,
      measure_first: true,
      shadow_proof: 'https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md',
      page: `${origin}/economics`,
      direct_usage_formula: 'gross provider spend avoided ~= protected_calls * measured_reusable_rate * marginal_full_validation_cost',
      pricing_snapshots: publicProductFacts.pricing_snapshots,
      verified_benchmarks: publicProductFacts.verified_benchmarks,
      caveat: 'Measured benchmark results are first-party smoke evidence, not a promised reuse rate. Actual savings depend on caller policy, repeat probability, provider plan structure and CHECK overhead.'
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
      economics: `${origin}/economics`,
      quickstart: `${origin}/quickstart`,
      clients: `${origin}/clients`,
      llms: `${origin}/llms.txt`,
      sitemap: `${origin}/sitemap.xml`,
      health: `${origin}/healthz`,
      public_stats: `${origin}/public-stats.json`,
      data_practices: `${origin}/data-practices.json`,
      service_descriptor: `${origin}/service.json`,
      product_facts: `${origin}/product-facts.json`
    },
    public_product_facts: productFactsForOrigin(origin),
    latest_verified_updates: publicProductFacts.latest_verified_updates
  };
}

export function publicLandingPage(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Reduce repeated paid search, scraping, browser extraction and other validation spend across AI-agent fleets with a cheap SeenRelay CHECK before the expensive work.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Shared freshness for AI agents">
<meta property="og:description" content="A cheap preflight before repeated paid or slow validation across AI-agent fleets. Measure first, then reuse only under caller policy.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Shared freshness for AI agents</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="#install">Install</a><a href="#verified-results">Measured</a><a href="#latest">Latest</a><a href="/economics">Savings</a><a href="/quickstart">Quickstart</a><a href="/clients">Connect</a><a href="#network">Network</a><a href="#trust">Trust</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">COST AVOIDANCE FOR AI-AGENT FLEETS</div>
<h1>Stop paying to revalidate the same fact.</h1>
<p class="lead">SeenRelay adds a cheap <b>CHECK</b> before repeated paid search, scraping, browser/extraction, rate-limited API or other expensive fact validation. If recent matching evidence meets your policy, skip the expensive operation. Otherwise validate normally and <b>OBSERVE</b> what you independently found so the next run or agent may avoid paying for the same work again.</p>
<div class="cta"><a class="primary" href="/quickstart">Protect an expensive validation</a><a class="secondary" href="/economics">See the cost math</a><a class="secondary" href="/clients">Integration options</a><a class="secondary" href="/service.json">For machines</a></div>
<div class="contract"><span>Exactly 2 operations</span><b>CHECK</b><b>OBSERVE</b><span>Currently free · no account · fleet reuse · no truth verdict</span></div>
</section>
${publicInstallHtml()}
${verifiedBenchmarkHtml()}
${verifiedWorkloadMapHtml()}
${latestVerifiedHtml()}

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

<section class="section split decision">
<div><div class="eyebrow">THE ECONOMIC CASE</div><h2>Use SeenRelay where the operation you might skip costs real money or time.</h2><p>At current public list prices, 100,000 OpenAI Web Search calls cost $1,000 in search-call fees. If Shadow Proof measures 30% reusable matches that your policy accepts, 30,000 paid searches can be avoided: $700 instead of $1,000, before your own CHECK network/compute overhead.</p><p>That 30% is an illustration, not a promised hit rate. Your workload decides whether the math works.</p><p><a href="/economics">See OpenAI, Firecrawl and Browserbase examples plus the break-even formula →</a></p></div>
<div class="proof-grid"><article><b>Paid search</b><span>Avoid repeated metered search calls.</span></article><article><b>Scrape / extract</b><span>Avoid repeated credits, browser work and downstream parsing.</span></article><article><b>Fleet effect</b><span>One necessary validation can serve later runs or agents.</span></article><article><b>Negative control</b><span>Do not use SeenRelay for a cheap one-off GET when the preflight cannot win.</span></article></div>
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
<div><div class="eyebrow">INTEGRATION PATHS</div><h2>Deterministic in application code. MCP when tool routing is appropriate.</h2><p>If the application must execute CHECK whenever a selected validation path runs, use the zero-dependency JavaScript/TypeScript or Python client. Bind it once around an existing fixed-fact validation, then each later revalidation is one protected call. It fails open into the validation the application already planned. If model-selected tool use is appropriate, connect the same two SeenRelay operations through the remote MCP endpoint.</p><div class="flow"><span>need fact</span><i>→</i><span>CHECK</span><i>→</i><span>reuse or validate</span><i>→</i><span>OBSERVE</span></div><p><a href="/clients">Choose the deterministic wrapper or MCP setup →</a></p></div>
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

<section class="section final"><div><div class="eyebrow">PROVE THE SAVINGS ON YOUR OWN WORKLOAD</div><h2>Start free in shadow mode. Keep it only where measured fleet-level reuse beats the overhead.</h2></div><div class="cta"><a class="primary" href="/quickstart">Protect a validation</a><a class="secondary" href="/economics">Cost examples</a><a class="secondary" href="/clients">Clients</a><a class="secondary" href="/service.json">Machine descriptor</a></div></section>
</main>
${siteFooterHtml()}
<script src="/site.js" defer></script>
</body></html>`;
}
