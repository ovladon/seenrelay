export const controlledProofAtlas = {
  schema: 'seenrelay-controlled-proof-atlas-v1',
  updated_at: '2026-10-02',
  evidence_boundary: {
    evidence_type: 'controlled_first_party_benchmark',
    customer_roi_claim: false,
    natural_prevalence_claim: false,
    net_customer_savings_claim: false,
    best_available_baseline_claim: false,
    tool_necessity_is_separate_gate: true,
    native_controls_first: true
  },
  rows: [
    {
      id: 'company-fleet-real-ops',
      baseline_quality: 'FIRST_PARTY_REAL_WORKLOAD_BEST_BASELINE_UNPROVEN',
      tool_necessity: 'PASS_CURRENT_RESEARCH_WORKLOAD',
      surface: 'Multi-agent operating intelligence — shared evidence, independent reasoning',
      baseline: '$0.16499684',
      seenrelay: '$0.05560972',
      avoided: '$0.10938712 gross',
      reduction: '66.30%',
      executions: '13 → 4',
      semantic: 'PASS',
      repeatability: '1 complete paid run',
      adoption_path: '/clients',
      note: 'First-party real operating workload plus a clearly synthetic external-client rehearsal. Eight department agents kept independent role reasoning; SeenRelay coordinated only same-tenant evidence acquisition. Billable web-search actions fell 13→4 while top-level model Responses increased 8→10. Exactly one evidence packet was acquired per tenant, with no cross-tenant reuse and all frozen role contracts passing. This is gross provider-cost reduction for this run, not customer ROI, net customer savings, external adoption or proof that SeenRelay beats every custom shared-research/orchestration baseline.'
    },
    {
      id: 'hosted-compute-64gb',
      baseline_quality: 'MECHANISM_ONLY_LOCAL_WINS',
      surface: 'Hosted compute / 64 GB tool session',
      baseline: '$1.9241253',
      seenrelay: '$0.4820025',
      avoided: '$1.4421228',
      reduction: '74.95%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Mechanism-only benchmark: the exact task was deterministic SHA-256 and could be done locally. This row proves duplicate hosted-resource coalescing, not that a 64 GB container was necessary for SHA-256.'
    },
    {
      id: 'agentic-search',
      baseline_quality: 'MECHANISM_ONLY_SOURCE_NATIVE_WINS',
      surface: 'Agentic web search — explicit shared-snapshot contract',
      baseline: '4 top-level executions',
      seenrelay: '1 top-level execution',
      avoided: '42.84%–85.73%',
      reduction: '66.88% mean',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/ai-agent-cost-optimization',
      note: 'Mechanism-only benchmark for this exact task: all callers accepted one shared fresh provider-search snapshot, but the requested latest PyPI package version is available from PyPI directly. This proves shared-search coordination, not web-search necessity. Other agentic-search workloads may require k>1 or k=N.'
    },
    {
      id: 'freshness-firewall',
      baseline_quality: 'BEST_BASELINE_UNPROVEN',
      surface: 'Decision-time freshness',
      baseline: '6 provider reads',
      seenrelay: '2 provider reads',
      avoided: '4 provider reads',
      reduction: '66.7%',
      executions: '6 → 2',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/quickstart',
      note: 'Compared with Firecrawl provider-native maxAge on the same controlled schedule: native path stayed at 6 calls / 6 credits, while SeenRelay used 2 calls / 2 credits in 3/3 runs. Hard max-age policy remained satisfied; no claim of hidden source-change detection inside the allowed age window.'
    },
    {
      id: 'exact-web-extraction',
      baseline_quality: 'BEST_BASELINE_UNPROVEN',
      surface: 'Exact web extraction',
      baseline: '4 Firecrawl credits',
      seenrelay: '1 Firecrawl credit',
      avoided: '3 Firecrawl credits',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Exact same-boundary markdown extraction. A separate structured JSON contract failed semantic equality and remains a negative result.'
    },
    {
      id: 'weather-dynamic-state',
      baseline_quality: 'MECHANISM_ONLY_LOCAL_WINS',
      surface: 'Weather downstream analysis',
      baseline: '4 paid analyses',
      seenrelay: '1 paid analysis',
      avoided: '3 paid analyses',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/quickstart',
      note: 'Mechanism-only benchmark: real Open-Meteo state stayed unchanged, but the paid classifier applied fixed rules that the harness itself could compute locally. This proves state-keyed recomputation control, not best-baseline weather economics.'
    },
    {
      id: 'weather-transition',
      baseline_quality: 'BEST_BASELINE_UNPROVEN',
      surface: 'Weather state transition',
      baseline: '4 paid analyses',
      seenrelay: '2 paid analyses',
      avoided: '2 paid analyses',
      reduction: '50%',
      executions: '4 → 2',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/quickstart',
      note: 'Controlled A,A,B,B transition forced a new analysis at B and recorded zero stale reuse after the change.'
    },
    {
      id: 'retail-real-page',
      baseline_quality: 'NATIVE_FIRST_CONDITIONAL',
      surface: 'Retail extraction guarded by price state',
      baseline: '4 Firecrawl credits',
      seenrelay: '1 Firecrawl credit',
      avoided: '3 Firecrawl credits',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Native-first conditional: the direct Apple read already resolves the monitored price/capacity state. Paid Firecrawl extraction is relevant only when the caller needs the richer extraction artifact; if state alone is sufficient, SeenRelay should self-reject.'
    },
    {
      id: 'retail-transition',
      baseline_quality: 'BEST_BASELINE_UNPROVEN',
      surface: 'Retail price / availability transition',
      baseline: '4 paid analyses',
      seenrelay: '2 paid analyses',
      avoided: '2 paid analyses',
      reduction: '50%',
      executions: '4 → 2',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Controlled authoritative A,A,B,B retail fixture. The changed price/availability fingerprint forced a new analysis before reuse resumed; this is not a live Apple price-change claim.'
    },
    {
      id: 'inventory-native-comparison',
      baseline_quality: 'NATIVE_FIRST_CONDITIONAL',
      surface: 'Inventory / availability downstream extraction',
      baseline: '4 Firecrawl credits',
      seenrelay: '1 Firecrawl credit',
      avoided: '3 Firecrawl credits',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Real Adafruit inventory state. Firecrawl provider-native maxAge also stayed at 4 calls / 4 credits; SeenRelay used the retailer Product API as a cheap opaque state token and performed one paid extraction. If that native API already answers the entire need, SeenRelay should not be used.'
    },
    {
      id: 'inventory-transition',
      baseline_quality: 'BEST_BASELINE_UNPROVEN',
      surface: 'Inventory state transition',
      baseline: '4 paid analyses',
      seenrelay: '2 paid analyses',
      avoided: '2 paid analyses',
      reduction: '51.58% mean',
      executions: '4 → 2',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Controlled A,A,B,B stock/availability transition. Each changed state forced a new paid analysis before reuse resumed; gross modeled reduction ranged from 50% to 53.1%. This is not a live retailer stock-change claim.'
    },
    {
      id: 'litellm-cold-concurrency',
      baseline_quality: 'MECHANISM_ONLY_LOCAL_WINS',
      surface: 'AI gateway cold concurrent cache misses',
      baseline: '4 upstream executions',
      seenrelay: '1 upstream execution',
      avoided: '3 upstream executions',
      reduction: '74.84%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Mechanism-only benchmark: against LiteLLM Proxy 1.103.2 + Redis exact cache, four cold concurrent misses caused four upstream executions and SeenRelay single-flight caused one. The exact benchmark output was a fixed constant, so this isolates the cold-concurrency gap rather than proving model-call necessity.'
    },
    {
      id: 'news-live-event',
      baseline_quality: 'TOOL_NECESSITY_PASS_BEST_BASELINE_UNPROVEN',
      tool_necessity: 'PASS_DERIVED_BRIEFING',
      surface: 'News / event downstream briefing',
      baseline: '4 paid briefings',
      seenrelay: '1 paid briefing',
      avoided: '$0.0546–$0.1010 modeled',
      reduction: '79.61% mean',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Real Hacker News event authority plus real OpenAI web-search briefing. In 3/3 stable-state runs, four paid briefings became one and gross avoided cost was $0.05462206–$0.10098029 per group (70.95%–90.00%). HN remained the native state authority; independent customer prevalence is not claimed.'
    },
    {
      id: 'news-transition',
      baseline_quality: 'TOOL_NECESSITY_PASS_BEST_BASELINE_UNPROVEN',
      tool_necessity: 'PASS_DERIVED_BRIEFING',
      surface: 'News / event state transition',
      baseline: '4 paid briefings',
      seenrelay: '2 paid briefings',
      avoided: '$0.0116–$0.0664 modeled',
      reduction: '49.93% mean',
      executions: '4 → 2',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Controlled A,A,B,B transition using two real current Hacker News events. The changed event forced a fresh briefing before reuse resumed; naturally observed rank transition is not claimed.'
    },
    {
      id: 'shared-image-artifact',
      baseline_quality: 'CONTRACT_DEPENDENT',
      surface: 'Shared generated image artifact',
      baseline: '≥$0.212',
      seenrelay: '≥$0.053',
      avoided: '≥$0.159',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Only valid when all callers explicitly accept one shared generated artifact and diversity is not required.'
    }
  ],
  negative_results: [
    {
      id: 'firecrawl-structured-json-semantic-mismatch',
      surface: 'Structured JSON extraction',
      result: 'NO PASS',
      note: 'Provider credits fell mechanically, but authoritative outputs disagreed on title/headline field semantics. SeenRelay does not count this as validated savings.'
    },
    {
      id: 'ocr-repeatability-semantic-instability',
      surface: 'OCR / document extraction',
      result: 'NO PASS',
      note: 'One exact trial passed, but repeatability failed because independent OCR outputs varied semantically. OCR is not promoted.'
    }
  ]
} as const;

function esc(v: unknown): string {
  return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

export function proofAtlasDescriptor(origin: string) {
  return {
    ...controlledProofAtlas,
    canonical_origin: origin,
    urls: {
      human: `${origin}/proof`,
      machine: `${origin}/proof.json`,
      integrations: `${origin}/clients`,
      quickstart: `${origin}/quickstart`
    }
  };
}

export function proofAtlasPage(origin: string): string {
  const rows=controlledProofAtlas.rows.map(r=>`
    <article class="rv-card">
      <span class="rv-number">${esc(r.reduction)}</span>
      <h3>${esc(r.surface)}</h3>
      <p><b>${esc(r.executions)} provider executions</b><br>${esc(r.baseline)} → ${esc(r.seenrelay)} · avoided ${esc(r.avoided)}</p>
      <p>${esc(r.note)}</p>
      <p class="rv-small">Controlled first-party benchmark · baseline quality ${esc(r.baseline_quality)} · semantic ${esc(r.semantic)} · repeatability ${esc(r.repeatability)}</p>
      <a href="${esc(r.adoption_path)}">Integration path →</a>
    </article>`).join('');

  const negatives=controlledProofAtlas.negative_results.map(r=>`
    <article class="rv-card">
      <span class="rv-number">NO PASS</span>
      <h3>${esc(r.surface)}</h3>
      <p>${esc(r.note)}</p>
    </article>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay controlled proof atlas: measured provider work and cost reduction with semantic and repeatability gates.">
<link rel="canonical" href="${origin}/proof">
<link rel="alternate" type="application/json" href="${origin}/proof.json" title="SeenRelay controlled proof atlas">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>Controlled Proof Atlas — SeenRelay</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  <div class="rv-nav-actions"><a class="rv-button primary" href="/#start">Start locally</a></div>
</header>
<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">CONTROLLED PROOF ATLAS</div>
  <h1>Here is where SeenRelay has already reduced real provider work.</h1>
  <p>Every row below is a bounded first-party benchmark with real provider execution, a frozen semantic contract and repeatability gates. A mechanism can pass even when a cheaper local or source-native path would solve that exact benchmark task, so each row now exposes baseline quality separately. These are not customer ROI.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/clients">Choose an integration</a><a class="rv-button" href="/proof.json">Machine-readable proof</a></div>
</section>
<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">MEASURED MECHANISM RESULTS</div><h2>Provider work avoided under the frozen comparator.</h2></div><p>Native/local alternatives remain first. A high reduction proves coordination only when baseline quality says so; it does not automatically prove the expensive tool was necessary.</p></div>
  <div class="rv-grid-3">${rows}</div>
</section>
<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">NEGATIVE EVIDENCE</div><h2>We publish what did not earn a claim.</h2></div><p>A lower bill is not enough if the result changes meaning.</p></div>
  <div class="rv-grid-3">${negatives}</div>
</section>
<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">ADOPTION</div><h2>Match your expensive read path to a proven mechanism.</h2><p>If your workload resembles a proven surface, install the narrowest supported integration and start in shadow. The proof atlas establishes that the mechanism can save provider work; your shadow run establishes whether the pattern actually occurs often enough in your workload.</p></div>
  <div class="rv-actions"><a class="rv-button primary" href="/clients">Integrations</a><a class="rv-button" href="/quickstart">Quickstart</a></div>
</section>
</main>
<footer><span>Controlled mechanism benchmarks · baseline quality shown separately · not customer ROI.</span><span><a href="/">SeenRelay</a> · <a href="/trust">Trust</a> · <a href="/proof.json">Proof JSON</a></span></footer>
</body>
</html>`;
}
