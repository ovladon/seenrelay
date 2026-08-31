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
    purpose: 'Avoid redundant expensive validation with local/private reuse, source-native checks and optional shared freshness evidence.',
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
      javascript_typescript_zero_state: {
        status: `implemented_public_client_${publicProductFacts.install.client_version}`,
        recommendation: 'Use for explicitly eligible read-only validation when the application controls the call path.',
        execution_order: ['l0_local', 'l1_private_optional', 'source_native', 'shared_check_optional', 'original_validation'],
        shared_check_default: 'off',
        default_completed_result_ttl_ms: 0,
        source: 'https://github.com/ovladon/seenrelay/tree/main/clients/typescript',
        failure_semantics: "Client/store/relay failure fails open into the application's existing validation path."
      },
      classic_wrappers: {
        status: 'implemented',
        recommendation: 'Use for conservative CHECK-first measurement or explicit bounded shared-evidence reuse.',
        javascript_typescript: 'https://github.com/ovladon/seenrelay/tree/main/clients/typescript',
        python: 'https://github.com/ovladon/seenrelay/tree/main/clients/python',
        python_mode: 'shadow_first',
        failure_semantics: "Relay-side failure fails open into the application's existing validation path.",
        client_version: publicProductFacts.install.client_version,
        npm_install: publicProductFacts.install.npm_command,
        pypi_install: publicProductFacts.install.pypi_command,
        runtime_dependencies: publicProductFacts.install.runtime_dependencies,
        public_registry_verified_at: publicProductFacts.install.registry_install_verified_at
      },
      mcp: {
        role: 'Standard discovery and model/tool-routing interface for CHECK and OBSERVE.',
        url: `${origin}/mcp`
      }
    },
    economics: {
      target_workloads: ['paid_web_search', 'metered_scraping', 'browser_or_extraction', 'multi_step_validation', 'rate_limited_api'],
      poor_fit: ['mutating_or_destructive_operation', 'cheap_one_off_fetch', 'fact_with_low_repeat_probability', 'policy_requires_live_authoritative_source_on_every_call'],
      fleet_value: 'Local/private/source-native reuse can save work without network coverage. Shared evidence can save more when qualifying observations exist.',
      current_seenrelay_api_fee: 0,
      measure_first: true,
      shadow_proof: 'https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md',
      page: `${origin}/economics`,
      direct_usage_formula: 'gross provider spend avoided ~= protected_calls * measured_reusable_rate * marginal_full_validation_cost',
      pricing_snapshots: publicProductFacts.pricing_snapshots,
      verified_benchmarks: publicProductFacts.verified_benchmarks,
      caveat: 'Measured benchmark results are first-party smoke evidence, not a promised reuse rate. Actual savings depend on caller policy, repeat probability, provider plan structure and client/network overhead.'
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
      product_facts: `${origin}/product-facts.json`,
      agent_skills_index: `${origin}/.well-known/agent-skills/index.json`,
      agent_skill: `${origin}/.well-known/agent-skills/seenrelay/SKILL.md`
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
<meta name="description" content="Avoid redundant expensive validation with safe local/private reuse, source-native checks and optional shared freshness evidence.">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/service.json" title="SeenRelay machine descriptor">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay — Avoid redundant expensive validation">
<meta property="og:description" content="Local first. Source-native checks when available. Shared CHECK only when useful. Original validation remains the fallback.">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<title>SeenRelay — Avoid redundant expensive validation</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="#install">Install</a><a href="#verified-results">Measured</a><a href="#latest">Latest</a><a href="/economics">Savings</a><a href="/quickstart">Quickstart</a><a href="/clients">Connect</a><a href="#network">Network</a><a href="#trust">Trust</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">VALIDATION COST AVOIDANCE</div>
<h1>Avoid redundant expensive validation</h1>
<p class="lead">SeenRelay reuses eligible read-only validation locally first, uses source-native checks when available, and consults shared <b>CHECK</b> evidence only when useful. If reuse is not justified, run the original validation. <b>OBSERVE</b> only fresh independent results.</p>
<div class="cta"><a class="primary" href="/quickstart">Protect a read-only validation</a><a class="secondary" href="/clients">Integration options</a><a class="secondary" href="/economics">See measured economics</a><a class="secondary" href="/service.json">For machines</a></div>
<div class="contract"><span>Exactly 2 hosted operations</span><b>CHECK</b><b>OBSERVE</b><span>Currently free · no account · provider-independent core · no truth verdict</span></div>
</section>
${publicInstallHtml()}
${verifiedBenchmarkHtml()}
${verifiedWorkloadMapHtml()}
${latestVerifiedHtml()}

<section id="how" class="section">
<div class="section-head"><div><div class="eyebrow">HOW IT WORKS</div><h2>Reuse safely. Validate when needed.</h2></div><p>For eligible read-only work: local/private reuse → source-native checks → optional shared CHECK → original validation.</p></div>
<div class="proof-grid"><article><b>1 · LOCAL / PRIVATE</b><span>Reuse exact eligible work inside an explicit freshness window.</span></article><article><b>2 · SOURCE NATIVE</b><span>Use ETag or Last-Modified when available.</span></article><article><b>3 · SHARED CHECK</b><span>Consult recent SeenRelay evidence only when useful.</span></article><article><b>4 · VALIDATE + OBSERVE</b><span>Otherwise validate normally. OBSERVE only fresh independent results.</span></article></div>
</section>

<section class="section split">
<div><div class="eyebrow">ZERO-STATE</div><h2>Works without shared network data.</h2><p>JavaScript/TypeScript ${publicProductFacts.install.client_version} starts with in-process reuse, explicit-TTL L0, optional encrypted caller-owned L1 and source-native checks. Shared CHECK is off by default.</p><p>Completed-result TTL defaults to zero. SeenRelay does not invent freshness or infer that a tool is safe to suppress.</p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>zero-state</b></div><pre>L0 local
  ↓
L1 private (optional)
  ↓
ETag / Last-Modified
  ↓
shared CHECK (optional)
  ↓
original validation
  ↓
OBSERVE fresh independent result</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">FRESHNESS</div><h2>Recent evidence, not truth.</h2><p>SeenRelay stores recent observations tied to deterministic source/fact identity. It can tell a caller that the same value, a changed value, conflicting values, or no usable shared observation was recently reported.</p><p>It does not browse the source, decide which observation is correct, or certify reality.</p></div>
<div class="proof-grid"><article><b>SAME_OBSERVED</b><span>The caller-known value matches recent observations.</span></article><article><b>CHANGED_OBSERVED</b><span>A different recent value was observed.</span></article><article><b>CONTESTED</b><span>Recent observations disagree.</span></article><article><b>STALE / UNKNOWN</b><span>No sufficiently recent reusable shared evidence is available.</span></article></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">PROVENANCE</div><h2>Reused data is not a new observation.</h2><p>A cache hit can support reuse, but it is not a fresh independent observation of the source. OBSERVE only results that were independently obtained.</p><p>Optional Ed25519 proof establishes key possession, continuity and payload integrity — not truth or legal identity.</p></div>
<div class="proof-grid"><article><b>Fresh validation</b><span>May be eligible for OBSERVE.</span></article><article><b>Provider cache hit</b><span>Can help locally but is not re-labeled as new independent evidence.</span></article><article><b>Private L1</b><span>Caller-owned values remain private unless explicitly contributed under a valid evidence contract.</span></article><article><b>Fail open</b><span>If reuse cannot be justified, continue to the validation already planned.</span></article></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">ECONOMICS</div><h2>Use SeenRelay where validation costs money or time.</h2><p>Local/private/source-native reuse can save work without public network coverage. Shared evidence can save more when exact facts repeat across callers.</p><p>Verified benchmark rows are first-party smoke evidence, not promised hit rates. Your workload decides whether the math works.</p><p><a href="/economics">See current examples and the break-even model →</a></p></div>
<div class="proof-grid"><article><b>Paid search</b><span>Avoid repeated metered search where policy permits reuse.</span></article><article><b>Scrape / extract</b><span>Avoid repeated credits, browser work and downstream parsing.</span></article><article><b>Source validators</b><span>A 304 can avoid heavier work without consulting the public hive.</span></article><article><b>Negative control</b><span>Do not use SeenRelay for cheap one-off work or unsafe mutations.</span></article></div>
</section>

<section id="network" class="section">
<div class="section-head"><div><div class="eyebrow">LIVE NETWORK</div><h2>Network activity.</h2></div><p>Privacy-safe operational metrics. Reuse metrics measure activity, not truth.</p></div>
<div class="metrics">
<article><div class="label">Facts tracked</div><div class="metric" data-stat="facts">—</div><div class="hint">deterministic source-backed fact identities</div></article>
<article><div class="label">Recent observations</div><div class="metric" data-stat="recent_observations">—</div><div class="hint">freshness evidence currently retained</div></article>
<article><div class="label">CHECKs this month</div><div class="metric" data-stat="checks_month">—</div><div class="hint">requests asking whether shared evidence can help</div></article>
<article><div class="label">Useful reuses this month</div><div class="metric" data-stat="useful_reuse_month">—</div><div class="hint">CHECKs supported by qualifying prior observations</div></article>
<article><div class="label">Useful reuse rate</div><div class="metric" data-stat-pct="qualified_reuse_rate">—</div><div class="hint">share of CHECKs producing qualifying reuse evidence</div></article>
<article><div class="label">Active callers · 5m</div><div class="metric" data-stat="active_hive_leases_5m">—</div><div class="hint">recent pseudonymous operational leases</div></article>
</div>
<div class="stamp">Live aggregate snapshot · <span id="stats-time">loading</span></div>
</section>

<section id="integrate" class="section split">
<div><div class="eyebrow">INTEGRATION</div><h2>JavaScript/TypeScript: local-first. Python: shadow-first.</h2><p>Use Zero-State for eligible read-only calls you control. Use classic clients to measure shared CHECK evidence. Use MCP or REST for the hosted CHECK/OBSERVE protocol.</p><div class="flow"><span>local/private</span><i>→</i><span>source native</span><i>→</i><span>optional CHECK</span><i>→</i><span>validate</span><i>→</i><span>OBSERVE</span></div><p><a href="/clients">Choose an integration path →</a></p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>integration</b></div><pre>JavaScript / TypeScript ${publicProductFacts.install.client_version}
seenrelay/zero-state
seenrelay/auto
seenrelay/mcp-auto

Classic shared evidence
SeenRelayClient
SeenRelayShadowProof
Python: shadow-first

Remote MCP
${origin}/mcp
io.github.ovladon/seenrelay</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">SAFE USE</div><h2>Allow only explicitly safe read-only operations.</h2><p>Allow only explicitly eligible read-only operations. Keep completed-result TTL at zero unless a defensible caller/source freshness window exists. Measure work actually avoided and preserve the original validation as fallback.</p><p>For the classic CHECK-first path, start in shadow mode: keep every existing validation until measured results and caller policy justify bounded reuse.</p><p>Access is currently free, so evaluation can focus on correctness, workflow fit and measured savings rather than account setup.</p><p><a href="/quickstart">Open the integration sequence →</a></p></div>
<div class="proof-grid"><article><b>Best fit</b><span>Repeated deterministic read-only validations with meaningful cost or latency.</span></article><article><b>Never infer safety</b><span>Mutating/destructive or untrusted tools pass through unless explicitly governed.</span></article><article><b>Measure</b><span>Local hits, source-native confirmations, shared evidence and fallback validations.</span></article><article><b>Stay bounded</b><span>SeenRelay supplies optimization/evidence; the consuming workflow retains the final decision.</span></article></div>
</section>

<section id="trust" class="section trust"><div class="section-head"><div><div class="eyebrow">TRUST</div><h2>Narrow claims. Verifiable behavior.</h2></div></div>
<div class="trust-grid"><article><span class="ok">01</span><h3>No hidden research</h3><p>SeenRelay itself does not browse, search, fetch fact sources, or call a model to decide truth.</p></article><article><span class="ok">02</span><h3>Deterministic identity</h3><p>Shared fact matching uses source-native locators or canonical predicates, not fuzzy LLM similarity.</p></article><article><span class="ok">03</span><h3>Provider-independent core</h3><p>Provider-specific adapters are optional integrations and cannot become dependencies of the generic Zero-State core.</p></article><article><span class="ok">04</span><h3>Tested before release</h3><p>CI, package validation, security analysis and an isolated Preview Release Gate exercise the release surface before Production promotion.</p></article></div>
<div class="trust-note"><a href="/data-practices">Inspect technical data practices →</a></div>
</section>

<section class="section final"><div><div class="eyebrow">START</div><h2>Install. Measure. Keep the original validation as fallback.</h2></div><div class="cta"><a class="primary" href="/quickstart">Protect a validation</a><a class="secondary" href="/clients">Clients</a><a class="secondary" href="/economics">Measured evidence</a><a class="secondary" href="/service.json">Machine descriptor</a></div></section>
</main>
${siteFooterHtml()}
<script src="/site.js" defer></script>
</body></html>`;
}
