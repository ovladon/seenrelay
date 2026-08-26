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

export function machinePublicFactsText(origin: string): string {
  const f = publicProductFacts;
  const b = f.verified_benchmarks.find((item) => item.id === 'firecrawl-json-extraction-2026-08-26');
  const negative = f.verified_benchmarks.find((item) => item.id === 'firecrawl-basic-scrape-2026-08-26');
  const benchmark = b && 'provider_calls_avoided' in b
    ? `- First-party Firecrawl JSON extraction smoke benchmark (n=${b.samples}, ${b.freshness_window_seconds}s caller freshness window): ${b.provider_calls_avoided}/${b.samples} eligible provider calls avoided, ${b.provider_credits_avoided} provider credits avoided, median ${b.fresh_baseline_median_ms} ms fresh / ${b.provider_cached_baseline_median_ms} ms provider-cached -> ${b.reuse_median_ms} ms bounded reuse. This is not a promised natural-world reuse rate.`
    : '- No verified benchmark currently published.';
  const counterexample = negative
    ? `- Counterexample: basic Firecrawl scrape reuse avoided credits but was slower than the provider cache (${negative.baseline_median_ms} ms baseline vs ${negative.reuse_median_ms} ms SeenRelay). Do not use SeenRelay for cheap/fast work when the preflight cannot win.`
    : '';
  return `## Public install\n\n- JavaScript / TypeScript: ${f.install.npm_command}\n- Python: ${f.install.pypi_command}\n- Client version: ${f.install.client_version}\n- Runtime dependencies: ${f.install.runtime_dependencies}\n- Account/API key required: no\n- Current SeenRelay API fee: $0\n\n## Verified measured results\n\n${benchmark}\n${counterexample}\n- Canonical machine-readable product facts: ${origin}/product-facts.json\n- Full measured-result interpretation: https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_RESULTS.md\n`;
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
