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
<meta name="description" content="Use SeenRelay as a caller-owned validation reuse layer across agent workers while preserving source-native validation and the authoritative fallback.">
<link rel="canonical" href="${origin}/fleet">
<title>SeenRelay — Validation reuse for agent fleets</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/revamp-factual.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/fleet">Fleet</a><a href="/quickstart">Quickstart</a><a href="/clients">Integrations</a><a href="/trust">Trust</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="/quickstart">Measure first</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">AGENT-FLEET VALIDATION REUSE · CLIENT ${version}</div>
  <h1>Reuse expensive read-only validation across your agent fleet.</h1>
  <p>SeenRelay can put caller-owned encrypted reuse in front of repeated validation work across workers or process restarts. Source-native validators stay ahead of optional shared CHECK, and the original validation remains the fallback whenever reuse is not justified.</p>
  <div class="rv-actions"><a class="rv-button primary" href="#deploy">Fleet deployment</a><a class="rv-button" href="/quickstart">Shadow proof first</a><a class="rv-button quiet" href="/data-practices">Data practices →</a></div>
</section>

<section class="rv-shell rv-section" id="fit">
  <div class="rv-section-head"><div class="rv-eyebrow">WHERE IT FITS</div><h2>Expensive pipes with repeated, deterministic, read-only work.</h2><p>The strongest current fit is a fleet in which multiple workers repeatedly validate the same bounded state and the authoritative path costs meaningful money, latency or constrained capacity.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Browser and portal validation</h3><p>Repeated read-only checks that otherwise consume browser sessions, proxy time, CAPTCHA handling or multi-step navigation.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Metered extraction or model work</h3><p>Repeated source-backed extraction, parsing or model-assisted validation with deterministic identity and an explicit freshness policy.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Shared worker fleets</h3><p>Queues, agents or services that already share a caller-owned KV/store and should not independently repay for the same eligible validation.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="deploy">
  <div class="rv-section-head"><div class="rv-eyebrow">CALLER-OWNED FLEET MODE</div><h2>Use the store you control. SeenRelay keeps values sealed.</h2><p>The JavaScript/TypeScript client already supports private L1 across workers or restarts. The store receives only an opaque SHA-256 coordinate key and an encrypted payload. The encryption key remains in your own secret-management boundary.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice">
      <header><b>Private L1</b><span>AES-256-GCM</span></header>
      <div class="rv-code"><pre>import {
  SeenRelayZeroState,
  createAesGcmPrivateCodec
} from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({
  privateStore: fleetStore, // get(key) / set(key, sealedValue)
  privateCodec: createAesGcmPrivateCodec(keyBytes),
  privateMaxAgeMs: 30_000
});</pre></div>
      <p><code>privateMaxAgeMs</code> is an explicit caller freshness decision. Leave it at zero if a private completed result must not suppress live validation; retained ETag/Last-Modified state can still support conditional source confirmation.</p>
    </article>
    <article class="rv-choice">
      <header><b>Order of operations</b><span>LOCAL FIRST</span></header>
      <div class="rv-stack">
        <article><h3>1 · Local / in-flight</h3><p>Coalesce or reuse exact work inside the process when policy permits.</p></article>
        <article><h3>2 · Private fleet L1</h3><p>Reuse caller-owned encrypted state across workers when the explicit freshness window permits it.</p></article>
        <article><h3>3 · Source-native</h3><p>Prefer ETag, Last-Modified or a stronger authoritative mechanism when it answers the same question cheaply.</p></article>
        <article><h3>4 · Optional shared CHECK</h3><p>Consult recent shared observations only for facts the caller is allowed to share and only when they add value.</p></article>
        <article><h3>5 · Validate normally</h3><p>Fall through to the existing authoritative operation whenever a cheaper path is insufficient.</p></article>
      </div>
    </article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">START WITHOUT TRUSTING REUSE</div><h2>Measure the fleet before enabling suppression.</h2><p>Ambient/Shadow Proof leaves every authoritative call enabled and reports exact repetition locally. Use that report to decide whether a specific workload is dense enough to justify private or shared reuse.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Coding agent</b><span>Agent Skills</span></header><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><div class="rv-code"><pre>Find repeated expensive read-only validations across this agent fleet. Integrate SeenRelay only through a supported adapter, start in shadow mode, preserve the authoritative call and stronger native controls, and report the exact workloads that repeat. Where workers already share a caller-owned store, evaluate encrypted private L1 before optional shared CHECK.</pre></div></article>
    <article class="rv-choice"><header><b>Decision rule</b><span>FAIL CLOSED</span></header><p>If exact repetition is rare, the original operation is already cheap, a provider/source-native cache answers the same question, or policy requires fresh live validation every time, leave SeenRelay out of the path.</p><p>If repetition is material and expensive, use the narrowest bounded reuse layer that preserves the same user-relevant outcome.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">BOUNDARIES</div><h2>Fleet reuse is not a hosted tenant claim.</h2><p>Private L1 is caller-owned storage. SeenRelay does not claim that the public relay is a private tenant store. CHECK and OBSERVE remain the only hosted domain operations; they remain optional shared-evidence operations with their existing public protocol semantics.</p></div>
  <div class="rv-contract-list">
    <article><b>No truth verdict</b><span>SeenRelay reports compatible recent observations; it does not decide reality.</span></article>
    <article><b>No mutation suppression</b><span>Mutating or destructive operations are outside the reuse target.</span></article>
    <article><b>No fake independence</b><span>A private/provider cache hit is never relabeled as a new independent OBSERVE.</span></article>
  </div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">NEXT STEP</div><h2>Measure one expensive fleet validation today.</h2><p>Start shadow-only. If the workload repeats materially, connect the caller-owned private store and keep stronger native controls ahead of optional shared evidence.</p></div><div class="rv-actions"><a class="rv-button primary" href="/quickstart">Quickstart</a><a class="rv-button" href="/clients">Integration chooser</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
