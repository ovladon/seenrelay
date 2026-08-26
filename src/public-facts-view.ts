import { publicProductFacts } from './public-facts.generated.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function publicInstallHtml(): string {
  const f = publicProductFacts;
  return `<section class="section split decision" id="install">
<div><div class="eyebrow">PUBLIC INSTALL · CLIENT v${esc(f.install.client_version)}</div><h2>Two commands. Zero runtime dependencies.</h2><p>No SeenRelay account or API key is required. The public npm and PyPI packages were clean-install verified from their registries before this claim was published.</p></div>
<div class="terminal"><pre>${esc(f.install.npm_command)}

# or

${esc(f.install.pypi_command)}</pre></div>
</section>`;
}

export function verifiedBenchmarkHtml(): string {
  const f = publicProductFacts;
  const b = f.verified_benchmarks.find((item) => item.id === 'firecrawl-json-extraction-2026-08-26');
  const negative = f.verified_benchmarks.find((item) => item.id === 'firecrawl-basic-scrape-2026-08-26');
  if (!b || !negative || !('provider_calls_avoided' in b)) return '';
  return `<section class="section decision" id="verified-results">
<div class="section-head"><div><div class="eyebrow">MEASURED · FIRST-PARTY SMOKE BENCHMARK</div><h2>In one expensive extraction path, SeenRelay was cheaper and faster.</h2></div><p>Small controlled benchmark, not a universal hit-rate claim. Caller policy accepted evidence up to ${esc(b.freshness_window_seconds)} seconds old.</p></div>
<div class="proof-grid">
<article><b>${esc(b.provider_calls_avoided)}/${esc(b.samples)} provider calls avoided</b><span>Eligible Firecrawl JSON extraction revalidations made zero provider calls after the first independent observation.</span></article>
<article><b>${esc(b.provider_credits_avoided)} credits avoided</b><span>Firecrawl reported ${esc(b.credits_per_full_validation)} credits for each full JSON extraction in this run.</span></article>
<article><b>${esc(b.reuse_median_ms)} ms median</b><span>SeenRelay bounded reuse versus ${esc(b.fresh_baseline_median_ms)} ms fresh extraction — ${esc(b.latency_improvement_vs_fresh_percent)}% lower median latency in this run.</span></article>
<article><b>Also faster than provider cache</b><span>${esc(b.provider_cached_baseline_median_ms)} ms provider-cached versus ${esc(b.reuse_median_ms)} ms SeenRelay — ${esc(b.latency_improvement_vs_provider_cached_percent)}% lower median latency in this run.</span></article>
</div>
<div class="trust-note"><b>Counterexample matters:</b> the basic-scrape benchmark avoided ${esc(negative.provider_credits_avoided)} provider credits but was slower than Firecrawl's own cache hit (${esc(negative.baseline_median_ms)} ms baseline vs ${esc(negative.reuse_median_ms)} ms SeenRelay). SeenRelay is not a universal latency win; use it where repeated validation is expensive enough for the math to win. <a href="/economics">Full interpretation →</a></div>
</section>`;
}

export function latestVerifiedHtml(): string {
  const items = publicProductFacts.latest_verified_updates
    .map((item) => `<article><b>${esc(item.title)}</b><span>${esc(item.summary)}</span></article>`)
    .join('');
  return `<section class="section decision" id="latest">
<div class="section-head"><div><div class="eyebrow">LATEST VERIFIED</div><h2>What changed in Production and why it matters.</h2></div><p>Only shipped or independently release-gated facts belong here; planned work is excluded.</p></div>
<div class="proof-grid">${items}</div>
</section>`;
}

export function verifiedWorkloadMapHtml(): string {
  const byId = new Map(publicProductFacts.verified_benchmarks.map((item) => [item.id, item]));
  const jsonExtraction = byId.get('firecrawl-json-extraction-2026-08-26');
  const browser = byId.get('firecrawl-browser-interaction-2026-08-26');
  const basic = byId.get('firecrawl-basic-scrape-2026-08-26');
  if (
    !jsonExtraction ||
    !('provider_calls_avoided' in jsonExtraction) ||
    !('fresh_baseline_median_ms' in jsonExtraction) ||
    !browser ||
    !('provider_calls_avoided' in browser) ||
    !('baseline_median_ms' in browser) ||
    !basic ||
    !('baseline_provider_calls' in basic) ||
    !('baseline_median_ms' in basic)
  ) return '';

  return `<section class="section decision" id="workload-map">
<div class="section-head"><div><div class="eyebrow">WHERE THE ECONOMICS HAVE HELD UP SO FAR</div><h2>Use the evidence, not a generic promise.</h2></div><p>These are small first-party smoke benchmarks on intentionally repeated source-backed facts. They show what happened when eligible reuse existed; they do not predict how often your own fleet will produce reusable matches.</p></div>
<div class="proof-grid">
<article><b>Structured JSON extraction · cost ↓ latency ↓</b><span>${esc(jsonExtraction.provider_calls_avoided)}/${esc(jsonExtraction.samples)} equivalent provider calls and ${esc(jsonExtraction.provider_credits_avoided)} credits avoided; median ${esc(jsonExtraction.fresh_baseline_median_ms)} ms fresh → ${esc(jsonExtraction.reuse_median_ms)} ms SeenRelay reuse.</span></article>
<article><b>Browser interaction · cost ↓ latency ↓</b><span>${esc(browser.provider_calls_avoided)}/${esc(browser.samples)} equivalent provider calls and ${esc(browser.provider_credits_avoided)} reported credits avoided; median ${esc(browser.baseline_median_ms)} ms full browser validation → ${esc(browser.reuse_median_ms)} ms SeenRelay reuse.</span></article>
<article><b>Basic cached scrape · cost ↓ latency ↑</b><span>${esc(basic.baseline_provider_calls - basic.reuse_provider_calls)}/${esc(basic.samples)} equivalent provider calls and ${esc(basic.provider_credits_avoided)} credits avoided, but the provider cache was faster (${esc(basic.baseline_median_ms)} ms vs ${esc(basic.reuse_median_ms)} ms).</span></article>
<article><b>Cheap one-off fetch · poor fit</b><span>Do not add a network preflight where the operation is already cheap and unlikely to repeat. The Economics Lab keeps this negative control deliberately.</span></article>
</div>
<div class="trust-note"><a href="/economics">See the measurement rules, evidence and break-even logic →</a></div>
</section>`;
}

export function siteFooterHtml(): string {
  const currentYear = new Date().getUTCFullYear();
  const copyrightYears = currentYear > 2026 ? `2026–${currentYear}` : '2026';
  return `<footer><span>© ${copyrightYears} SeenRelay. All rights reserved.</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · <a href="https://github.com/ovladon/seenrelay/blob/main/clients/LICENSE">Client libraries: MIT License</a> · CHECK · OBSERVE</span></footer>`;
}

export function machinePublicFactsText(origin: string): string {
  const f = publicProductFacts;
  const b = f.verified_benchmarks.find((item) => item.id === 'firecrawl-json-extraction-2026-08-26');
  const negative = f.verified_benchmarks.find((item) => item.id === 'firecrawl-basic-scrape-2026-08-26');
  const browser = f.verified_benchmarks.find((item) => item.id === 'firecrawl-browser-interaction-2026-08-26');
  const benchmark = b && 'provider_calls_avoided' in b
    ? `- First-party Firecrawl JSON extraction smoke benchmark (n=${b.samples}, ${b.freshness_window_seconds}s caller freshness window): ${b.provider_calls_avoided}/${b.samples} eligible provider calls avoided, ${b.provider_credits_avoided} provider credits avoided, median ${b.fresh_baseline_median_ms} ms fresh / ${b.provider_cached_baseline_median_ms} ms provider-cached -> ${b.reuse_median_ms} ms bounded reuse. This is not a promised natural-world reuse rate.`
    : '- No verified benchmark currently published.';
  const browserResult = browser && 'provider_calls_avoided' in browser && 'baseline_median_ms' in browser
    ? `- First-party Firecrawl browser-interaction smoke benchmark (n=${browser.samples}, ${browser.freshness_window_seconds}s caller freshness window): ${browser.provider_calls_avoided}/${browser.samples} equivalent provider calls avoided, ${browser.provider_credits_avoided} reported provider credits avoided, median ${browser.baseline_median_ms} ms full browser validation -> ${browser.reuse_median_ms} ms bounded reuse. This is not a promised natural-world reuse rate.`
    : '';
  const counterexample = negative
    ? `- Counterexample: basic Firecrawl scrape reuse avoided credits but was slower than the provider cache (${negative.baseline_median_ms} ms baseline vs ${negative.reuse_median_ms} ms SeenRelay). Do not use SeenRelay for cheap/fast work when the preflight cannot win.`
    : '';
  return `## Public install\n\n- JavaScript / TypeScript: ${f.install.npm_command}\n- Python: ${f.install.pypi_command}\n- Client version: ${f.install.client_version}\n- Runtime dependencies: ${f.install.runtime_dependencies}\n- Account/API key required: no\n- Current SeenRelay API fee: $0\n\n## Verified measured results\n\n${benchmark}\n${browserResult}\n${counterexample}\n- Canonical machine-readable product facts: ${origin}/product-facts.json\n- Full measured-result interpretation: https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_RESULTS.md\n`;
}

export function productFactsForOrigin(origin: string) {
  return {
    ...publicProductFacts,
    canonical_origin: origin,
    urls: {
      website: `${origin}/`,
      economics: `${origin}/economics`,
      quickstart: `${origin}/quickstart`,
      clients: `${origin}/clients`,
      llms: `${origin}/llms.txt`,
      product_facts: `${origin}/product-facts.json`,
    },
  };
}
