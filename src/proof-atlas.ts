export const controlledProofAtlas = {
  schema: 'seenrelay-controlled-proof-atlas-v1',
  updated_at: '2026-10-01',
  evidence_boundary: {
    evidence_type: 'controlled_first_party_benchmark',
    customer_roi_claim: false,
    natural_prevalence_claim: false,
    net_customer_savings_claim: false,
    native_controls_first: true
  },
  rows: [
    {
      id: 'hosted-compute-64gb',
      surface: 'Hosted compute / 64 GB tool session',
      baseline: '$1.923993',
      seenrelay: '$0.481974',
      avoided: '$1.442019',
      reduction: '74.95%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Same deterministic task; one provider execution was sufficient for all compatible callers.'
    },
    {
      id: 'agentic-search',
      surface: 'Agentic web search',
      baseline: '4 top-level executions',
      seenrelay: '1 top-level execution',
      avoided: '42.84%–85.73%',
      reduction: '66.88% mean',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/ai-agent-cost-optimization',
      note: 'Provider search subcall count varied naturally; tested callers explicitly accepted one shared fresh search snapshot.'
    },
    {
      id: 'freshness-firewall',
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
      surface: 'Weather downstream analysis',
      baseline: '4 paid analyses',
      seenrelay: '1 paid analysis',
      avoided: '3 paid analyses',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/quickstart',
      note: 'Real Open-Meteo state stayed unchanged. This is downstream-analysis savings, not raw weather API savings.'
    },
    {
      id: 'weather-transition',
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
      surface: 'Retail price monitoring',
      baseline: '4 Firecrawl credits',
      seenrelay: '1 Firecrawl credit',
      avoided: '3 Firecrawl credits',
      reduction: '75%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/clients',
      note: 'Real Apple Store product page; unchanged commercial state detected by a cheap direct read. Live price-transition evidence is not claimed yet.'
    },
    {
      id: 'retail-transition',
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
      id: 'news-live-event',
      surface: 'News / event downstream briefing',
      baseline: '4 paid briefings',
      seenrelay: '1 paid briefing',
      avoided: '70.95%–90.00%',
      reduction: '79.61% mean',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Hacker News Firebase API supplied the live event identity; SeenRelay reused one paid OpenAI web-search briefing only while that event fingerprint stayed unchanged. The native feed is not replaced.'
    },
    {
      id: 'news-event-transition',
      surface: 'News event transition',
      baseline: '4 paid briefings',
      seenrelay: '2 paid briefings',
      avoided: '25.85%–74.87%',
      reduction: '49.93% mean',
      executions: '4 → 2',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Two real current Hacker News stories were used in controlled A,A,B,B order. The B event forced a new paid briefing before reuse resumed. Naturally observed ranking transitions are not claimed.'
    },
    {
      id: 'litellm-cold-concurrency',
      surface: 'Cold concurrent exact cache misses',
      baseline: '4 upstream executions · $0.0001224',
      seenrelay: '1 upstream execution · $0.0000308',
      avoided: '3 upstream executions',
      reduction: '74.84%',
      executions: '4 → 1',
      semantic: 'PASS',
      repeatability: '3/3',
      adoption_path: '/use-cases',
      note: 'Controlled comparator: LiteLLM Proxy 1.103.2 + Redis exact response cache. Four identical simultaneous requests on a cold cache produced four upstream executions; SeenRelay single-flight in front of the same proxy produced one. LiteLLM warm sequential cache already produced one, so this claim is only about the cold concurrent miss window; semantic cache was not tested.'
    },
    {
      id: 'shared-image-artifact',
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
      <p class="rv-small">Controlled first-party benchmark · semantic ${esc(r.semantic)} · repeatability ${esc(r.repeatability)}</p>
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
  <p>Every row below is a bounded first-party benchmark with real provider execution, a frozen semantic contract and repeatability gates. These are mechanism/unit-economics results — not customer ROI or a claim that every workload has the same recurrence.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/clients">Choose an integration</a><a class="rv-button" href="/proof.json">Machine-readable proof</a></div>
</section>
<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">MEASURED POSITIVE RESULTS</div><h2>Provider work actually avoided.</h2></div><p>Native controls remain first. A benchmark passes only when provider execution falls and the frozen semantic contract still passes.</p></div>
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
<footer><span>Controlled benchmarks, not customer ROI.</span><span><a href="/">SeenRelay</a> · <a href="/trust">Trust</a> · <a href="/proof.json">Proof JSON</a></span></footer>
</body>
</html>`;
}
