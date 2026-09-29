import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function fleetPage(origin: string): string {
  const version = esc(publicProductFacts.install.client_version);
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Coordinate exact eligible work across agent workers so one authoritative execution can satisfy simultaneous callers, while preserving caller-owned privacy, native controls and fail-open fallback.">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<link rel="canonical" href="${origin}/fleet">
<title>SeenRelay — Fleet-level execution coordination</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/revamp-factual.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/fleet">Fleet</a><a href="/quickstart">Quickstart</a><a href="/clients">Integrations</a><a href="/trust">Trust</a></nav>
  <details class="rv-mobile-nav">
    <summary>Menu</summary>
    <nav aria-label="Mobile navigation"><a href="/">Home</a><a href="/fleet">Fleet</a><a href="/quickstart">Quickstart</a><a href="/clients">Integrations</a><a href="/trust">Trust</a><a href="/service.json">Machine JSON</a><a href="/.well-known/agent-skills/index.json">Agent Skills</a></nav>
  </details>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="/quickstart">Measure first</a></div>
</header>
<main id="main-content">

<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">FLEET COORDINATION · CLIENT ${version}</div>
  <h1>Measure duplicate expensive work before you suppress a single call.</h1>
  <p>Client ${version} can measure exact in-flight overlap across separate workers before active coordination. If you already have caller-owned fleet traces, run the local trace census first; otherwise use distributed shadow measurement while every authoritative operation still runs.</p>
  <div class="rv-actions"><a class="rv-button primary" href="#trace-census">Analyze existing traces</a><a class="rv-button" href="#shadow">Measure live overlap</a><a class="rv-button" href="#coordinate">Enable coordination only if justified</a><a class="rv-button quiet" href="/data-practices">Data practices →</a></div>
</section>

<section class="rv-shell rv-section" id="fit">
  <div class="rv-section-head"><div class="rv-eyebrow">WHERE IT FITS</div><h2>High-cost calls that can safely share one answer.</h2><p>The strongest fit is a fleet where multiple workers may launch the same bounded operation at the same time and the operation allocates meaningful provider spend, browser time, container capacity or downstream tool work.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Hosted tools and containers</h3><p>Read-only code execution, sandboxes, browser sessions or other separately billed resources where duplicate top-level calls allocate duplicate infrastructure.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Expensive deterministic work</h3><p>Extraction, parsing, model-assisted validation or other exact work where all callers explicitly accept the same result.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Parallel agent fleets</h3><p>Workers, queues or services that can encounter the same exact coordinate concurrently but should not independently repay for it.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="measured-proof">
  <div class="rv-section-head"><div class="rv-eyebrow">VERIFIED CONTROLLED EVIDENCE</div><h2>We measured both provider-unit reduction and provider headroom.</h2><p>These are controlled first-party mechanics measurements, not natural customer ROI. They show what exact in-flight coordination can do when overlap is present; your own traffic still has to prove that the overlap exists and that SeenRelay beats the best native/local control.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Provider-unit reduction</b><span>18 → 9 FIRECRAWL CREDITS</span></header>
      <p>Across 3 rounds with 2 separate workers, the uncoordinated path executed 6 Firecrawl browser jobs for 18 credits. Active coordination executed 3 jobs for 9 credits, with 3 actual follower reuses and matching browser-computed results.</p>
      <p>The latest repeat remained clean: zero fail-open, store, coordinate, codec or follower-timeout failures. Dollar and net-savings claims remain intentionally unset.</p>
      <a href="https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_FLEET_BROWSER_OVERLAP_2026-09-29.md">Inspect provider-unit evidence →</a>
    </article>
    <article class="rv-choice">
      <header><b>Provider concurrency headroom</b><span>5 CALLERS → 1 JOB + 4 REUSES</span></header>
      <p>A 5-worker uncoordinated attempt hit Firecrawl's observed concurrency ceiling of 2 jobs and returned HTTP 429. In the coordinated follow-up, all 5 callers shared one authoritative browser job: 1 leader, 4 follower reuses, 0 coordination failures.</p>
      <p>This is capacity/headroom evidence, not an 80% savings claim: the five-worker baseline did not complete, so comparative credit delta and dollar savings stay unknown.</p>
      <a href="https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_FLEET_BROWSER_HEADROOM_2026-09-29.md">Inspect headroom evidence →</a>
    </article>
  </div>
</section>

<section class="rv-shell rv-section" id="trace-census">
  <div class="rv-section-head"><div class="rv-eyebrow">HAVE FLEET TRACES? · LOCAL-ONLY CENSUS</div><h2>Estimate exact overlap opportunity before instrumenting live traffic.</h2><p>If your fleet already records sanitized call timing, <code>seenrelay trace-census</code> can rank exact-shareable read-only overlap locally. It does not contact SeenRelay, execute the traced workload, suppress a call or turn potential savings into an ROI claim.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Run on a caller-owned trace</b><span>NO SEENRELAY API</span></header>
      <div class="rv-code"><pre>npx seenrelay trace-census fleet-trace.jsonl
npx seenrelay trace-census fleet-trace.jsonl --json</pre></div>
      <p>The trace contains opaque SHA-256 exact-coordinate hashes, comparable start/end timestamps, worker identity, explicit shareability policy and optional caller-provenanced marginal cost or provider units. Raw prompts, tool arguments, URLs and results are not required and common raw-content fields are rejected.</p>
    </article>
    <article class="rv-choice">
      <header><b>What the report means</b><span>OPPORTUNITY · NOT SAVINGS</span></header>
      <p><code>successful_leader_overlap_opportunities</code> counts eligible calls that began behind an exact leader that later succeeded. When the caller supplied cost provenance, the report can total <code>gross_potential_avoided_cost_usd</code> and potential provider units.</p>
      <p><b>Actual avoided executions remain unknown at this stage.</b> They become factual only after active coordination produces follower-reuse receipts. Net savings additionally require measured coordination/store overhead.</p>
      <a href="https://github.com/ovladon/seenrelay/blob/main/docs/FLEET_TRACE_CENSUS.md">Trace schema and evidence boundary →</a>
    </article>
  </div>
</section>

<section class="rv-shell rv-section" id="shadow">
  <div class="rv-section-head"><div class="rv-eyebrow">SHADOW OVERLAP · NO SUPPRESSION</div><h2>Find out whether the same expensive call actually collides across workers.</h2><p><code>SeenRelayFleetShadowMeter</code> uses caller-owned coordination metadata only. Every call still executes authoritatively, no result is shared, and no hosted CHECK or OBSERVE is sent.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Distributed shadow meter</b><span>MEASURE FIRST</span></header>
      <div class="rv-code"><pre>import {
  SeenRelayFleetShadowMeter,
  createRedisRestFleetStore
} from 'seenrelay/fleet';

const meter = new SeenRelayFleetShadowMeter({
  store: createRedisRestFleetStore({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    prefix: 'seenrelay:fleet:shadow:v0'
  }),
  scopeKey: process.env.SEENRELAY_FLEET_SCOPE
});

const result = await meter.measure({
  coordinate: {
    provider: 'openai',
    operation: 'responses.create',
    model,
    input
  },
  policy: {
    sideEffectClass: 'read_only',
    exactSingleAnswerShareable: true,
    independentSamplesRequired: false
  },
  execute: () => expensiveCall(),
  cost: {
    marginalCostUsd: 0.48,
    provenance: 'provider_list_price'
  }
});

console.log(meter.getReport());</pre></div>
      <p><code>callsWithIdenticalInflightPredecessor</code> counts eligible calls that started while the same exact coordinate was already running. <code>overlappedFollowerObservedCostUsd</code> is cost actually incurred during shadow measurement — not a savings claim.</p>
    </article>
    <article class="rv-choice">
      <header><b>What the shadow result decides</b><span>NO AUTO-ACTIVATION</span></header>
      <p>If exact compatible overlap is rare, the call is cheap, or a zero-cost provider-native exact cache already dominates, leave coordination off.</p>
      <p>If overlap is frequent and materially expensive, move that one reviewed operation to active fleet coordination and measure actual avoided executions with savings receipts.</p>
      <p>Mutations and independent sampling are excluded from overlap candidacy. Store or cost-metadata failures cannot change the application result.</p>
    </article>
  </div>
</section>

<section class="rv-shell rv-section" id="coordinate">
  <div class="rv-section-head"><div class="rv-eyebrow">EXACT IN-FLIGHT COORDINATION</div><h2>Keep your gateway. Add a caller-owned coordination store.</h2><p>The JavaScript/TypeScript client exports <code>seenrelay/fleet</code>. The store holds only opaque coordination metadata plus the caller-sealed result. Different fleet scopes never coordinate.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Fleet coordinator</b><span>OPT-IN · FAIL-OPEN</span></header>
      <div class="rv-code"><pre>import {
  SeenRelayFleetCoordinator,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from 'seenrelay/fleet';
import { createAesGcmPrivateCodec } from 'seenrelay/zero-state';

const fleet = new SeenRelayFleetCoordinator({
  store: createRedisRestFleetStore({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  }),
  codec: fleetCodecFromPrivateCodec(
    createAesGcmPrivateCodec(keyBytes)
  ),
  scopeKey: process.env.SEENRELAY_FLEET_SCOPE
});

const result = await fleet.run({
  coordinate: {
    provider: 'openai',
    operation: 'responses.create',
    model,
    input
  },
  policy: {
    sideEffectClass: 'read_only',
    exactSingleAnswerShareable: true,
    independentSamplesRequired: false
  },
  execute: () => expensiveCall()
});</pre></div>
      <p>Every result-affecting qualifier belongs in the coordinate. If two calls differ in model, files, tools, tenant state, randomness contract or another relevant input, they must not collapse.</p>
    </article>

    <article class="rv-choice">
      <header><b>What stays protected</b><span>SEMANTIC CONTRACT</span></header>
      <div class="rv-stack">
        <article><h3>Read-only only</h3><p>Mutations and destructive operations pass through unchanged.</p></article>
        <article><h3>No forced sampling collapse</h3><p>If independent answers, diversity, voting or randomized testing are part of the goal, keep the required multiplicity.</p></article>
        <article><h3>Native controls still win</h3><p>If a provider already supplies an equivalent zero-cost exact response cache, declare it and SeenRelay steps aside.</p></article>
        <article><h3>Fail open</h3><p>Store errors, follower timeouts and codec failures execute the original authoritative operation rather than inventing a hit.</p></article>
      </div>
    </article>
  </div>
</section>

<section class="rv-shell rv-section" id="measure">
  <div class="rv-section-head"><div class="rv-eyebrow">SAVINGS RECEIPTS</div><h2>Count only work that was actually avoided.</h2><p>Client ${version} can emit a local receipt when a follower reused an in-flight authoritative execution. Dollar value appears only when the caller provides or resolves a marginal cost with explicit provenance.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Local ledger</b><span>NO BILLING</span></header>
      <div class="rv-code"><pre>import {
  createFleetSavingsLedger
} from 'seenrelay/fleet';

const savings = createFleetSavingsLedger();

await fleet.run({
  coordinate,
  policy,
  execute: expensiveCall,
  cost: {
    marginalCostUsd: 0.48,
    provenance: 'provider_list_price'
  },
  onReceipt: savings.record
});

console.log(savings.snapshot());</pre></div>
      <p><code>avoidedExecutions</code> increases only on actual follower reuse. If cost is unknown, SeenRelay leaves the dollar value unknown instead of estimating it.</p>
    </article>
    <article class="rv-choice">
      <header><b>What a receipt does not mean</b><span>CONSERVATIVE</span></header>
      <p>A receipt is not a billing event, customer-spend claim or proof that every similar request is shareable. It reports the local coordination path that actually occurred and the caller-provided cost provenance.</p>
      <p>Start with one expensive operation. If follower reuse is rare or absolute savings are immaterial, leave the rest of the application unchanged.</p>
      <a href="https://github.com/ovladon/seenrelay/blob/main/docs/FLEET_COORDINATION_PREVIEW.md">Full fleet API and boundaries →</a>
    </article>
  </div>
</section>

<section class="rv-shell rv-section" id="completed-reuse">
  <div class="rv-section-head"><div class="rv-eyebrow">SEPARATE POLICY · COMPLETED RESULTS</div><h2>In-flight coordination is not temporal caching.</h2><p>A later call does not inherit a completed fleet result merely because an earlier caller finished. If the application separately wants caller-owned completed-result reuse, <code>SeenRelayZeroState</code> provides private L1 under an explicit freshness window.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Optional private L1</b><span>AES-256-GCM</span></header>
      <div class="rv-code"><pre>import {
  SeenRelayZeroState,
  createAesGcmPrivateCodec
} from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  privateStore: fleetStore,
  privateCodec: createAesGcmPrivateCodec(keyBytes),
  privateMaxAgeMs: 30_000
});</pre></div>
      <p>A positive <code>privateMaxAgeMs</code> is a separate caller freshness decision. Keep it at zero when a completed result must never suppress live validation.</p>
    </article>
    <article class="rv-choice">
      <header><b>Keep layers distinct</b><span>NO HIDDEN TTL</span></header>
      <p><b>Fleet coordination:</b> same eligible work is already running now.</p>
      <p><b>Private L1:</b> a completed caller-owned result may still be fresh enough under an explicit policy.</p>
      <p><b>Shared CHECK:</b> optional recent external evidence for compatible source-backed facts.</p>
      <p><b>Fallback:</b> when any cheaper layer is insufficient, validate normally.</p>
    </article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">START WITHOUT ASSUMING VALUE</div><h2>Measure one expensive call before broad rollout.</h2><p>Use the scanner and shadow/economics tools to identify a real candidate, then attach fleet coordination only where the call is exact-shareable and simultaneous repetition actually occurs.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Coding agent</b><span>Agent Skills</span></header><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><div class="rv-code"><pre>Find repeated expensive read-only calls in this agent fleet. Preserve the original operation and stronger native controls. If exact compatible calls overlap in flight, evaluate seenrelay/fleet for one-authoritative-execution coordination and report avoided executions with explicit cost provenance. Do not collapse mutations, independent sampling or tenant-specific work.</pre></div></article>
    <article class="rv-choice"><header><b>Decision rule</b><span>MEASURED VALUE</span></header><p>If compatible overlap is rare, the operation is cheap, or a stronger native mechanism already removes the cost, leave SeenRelay out of that path.</p><p>If the overlap is material and expensive, keep the narrowest explicit policy that preserves the caller's intended result multiplicity.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">BOUNDARIES</div><h2>Fleet coordination is caller-scoped infrastructure.</h2><p>The coordination store is caller-owned. CHECK and OBSERVE remain the only hosted SeenRelay domain operations and are not required for fleet in-flight coordination.</p></div>
  <div class="rv-contract-list">
    <article><b>No truth verdict</b><span>Coordination says who should execute compatible work, not whether the result is true.</span></article>
    <article><b>No mutation suppression</b><span>Mutating or destructive operations remain outside the coordination target.</span></article>
    <article><b>No cross-tenant assumption</b><span>Different fleet scopes do not coordinate, and sealed results stay inside the caller's encryption boundary.</span></article>
  </div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">NEXT STEP</div><h2>Measure one simultaneous expensive operation today.</h2><p>Install client ${version}, keep every authoritative call enabled, attach <code>SeenRelayFleetShadowMeter</code> to one exact-shareable read-only operation, and enable coordination only if the measured overlap is worth removing.</p></div><div class="rv-actions"><a class="rv-button primary" href="/quickstart#fleet">Quickstart</a><a class="rv-button" href="/clients">Integration chooser</a></div></section>

</main>
${siteFooterHtml()}
</body>
</html>`;
}
