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
<div><div class="eyebrow">PUBLIC INSTALL · CLIENT v${esc(f.install.client_version)}</div><h2>Two commands. Zero required base runtime dependencies.</h2><p>No SeenRelay account or API key is required. The public npm and PyPI packages were clean-install verified from their registries before this claim was published.</p></div>
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
<div class="section-head"><div><div class="eyebrow">MEASURED · FIRST-PARTY SMOKE BENCHMARK</div><h2>Provider-path smoke: SeenRelay skipped Firecrawl work, but the tested fact belonged on a source-native path.</h2></div><p>Small controlled benchmark, not a universal hit-rate or workload-fit claim. Caller policy accepted evidence up to ${esc(b.freshness_window_seconds)} seconds old.</p></div>
<div class="proof-grid">
<article><b>${esc(b.provider_calls_avoided)}/${esc(b.samples)} provider calls avoided</b><span>Eligible Firecrawl JSON extraction revalidations made zero provider calls after the first independent observation.</span></article>
<article><b>${esc(b.provider_credits_avoided)} credits avoided</b><span>Firecrawl reported ${esc(b.credits_per_full_validation)} credits for each full JSON extraction in this run.</span></article>
<article><b>${esc(b.reuse_median_ms)} ms median</b><span>SeenRelay bounded reuse versus ${esc(b.fresh_baseline_median_ms)} ms fresh extraction — ${esc(b.latency_improvement_vs_fresh_percent)}% lower median latency in this run.</span></article>
<article><b>Also faster than provider cache</b><span>${esc(b.provider_cached_baseline_median_ms)} ms provider-cached versus ${esc(b.reuse_median_ms)} ms SeenRelay — ${esc(b.latency_improvement_vs_provider_cached_percent)}% lower median latency in this run.</span></article>
</div>
<div class="trust-note"><b>Path ordering matters:</b> these synthetic example.com rows remain useful provider-path mechanics evidence. Because those tested facts were source-resolvable, source-native validation is the stronger control for those rows. The basic-scrape benchmark also measured ${esc(negative.baseline_median_ms)} ms on Firecrawl's own cache path versus ${esc(negative.reuse_median_ms)} ms on SeenRelay. Better local, source-native and provider-native controls stay ahead of shared CHECK. <a href="https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_RESULTS.md#interpretation" rel="noreferrer">Full interpretation →</a></div>
</section>`;
}

export function latestVerifiedHtml(): string {
  const items = publicProductFacts.latest_verified_updates
    .map((item) => `<article><b>${esc(item.title)}</b><span>${esc(item.summary)}</span></article>`)
    .join('');
  return `<section class="section decision" id="latest">
<div class="section-head"><div><div class="eyebrow">LATEST VERIFIED</div><h2>What changed in Production and why it matters.</h2></div><p>Shipped or independently release-gated facts.</p></div>
<div class="proof-grid">${items}</div>
</section>`;
}

export function verifiedWorkloadMapHtml(): string {
  const latestBySeries = new Map<string, (typeof publicProductFacts.verified_benchmarks)[number]>();
  for (const item of publicProductFacts.verified_benchmarks) {
    if (!('matrix' in item)) continue;
    const previous = latestBySeries.get(item.matrix.series_key);
    if (!previous || item.verified_at > previous.verified_at) latestBySeries.set(item.matrix.series_key, item);
  }
  const rows = [...latestBySeries.values()]
    .filter((item) => 'matrix' in item)
    .sort((a, b) => b.verified_at.localeCompare(a.verified_at))
    .map((item) => {
      if (!('matrix' in item)) return '';
      const m = item.matrix;
      return `<tr><td><b>${esc(m.surface)}</b><small>${esc(item.provider)} · ${esc(m.configuration)}</small></td><td>${esc(m.evidence_level)} · n=${esc(item.samples)}</td><td>${esc(m.baseline_median_ms)} ms<small>${esc(m.baseline_context)}</small></td><td>${esc(item.reuse_median_ms)} ms</td><td>${esc(m.provider_calls_avoided)}/${esc(item.samples)} calls<small>${esc(m.provider_units_avoided)} ${esc(m.provider_unit_label)}</small></td><td>${esc(item.freshness_window_seconds)}s</td><td><a href="${esc(item.evidence_url)}" rel="noreferrer">${esc(item.verified_at.slice(0, 10))} ↗</a></td></tr>`;
    })
    .join('');
  if (!rows) return '';
  return `<section class="section decision" id="workload-map">
<div class="section-head"><div><div class="eyebrow">VERIFIED WORKLOAD MATRIX</div><h2>Measured provider-path results by tested configuration.</h2></div><p>Latest verified result per tested configuration. Small controlled tests do not predict how often your fleet will produce reusable matches.</p></div>
<div class="benchmark-table-wrap"><table class="benchmark-table"><thead><tr><th>Surface / configuration</th><th>Evidence</th><th>Provider-path baseline</th><th>Reuse median</th><th>Provider work avoided</th><th>Window</th><th>Verified</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="trust-note"><a href="https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md" rel="noreferrer">Measurement rules, evidence and break-even logic →</a></div>
</section>`;
}
export function siteFooterHtml(): string {
  const currentYear = new Date().getUTCFullYear();
  const copyrightYears = currentYear > 2026 ? `2026–${currentYear}` : '2026';
  return `<footer><span>© ${copyrightYears} SeenRelay. All rights reserved.</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · <a href="https://github.com/ovladon/seenrelay/blob/main/clients/LICENSE">Client libraries: MIT License</a> · CHECK · OBSERVE</span></footer>`;
}

export function machinePublicFactsText(origin: string): string {
  const f = publicProductFacts;
  const measured = f.verified_benchmarks
    .filter((item) => 'matrix' in item)
    .map((item) => {
      if (!('matrix' in item)) return '';
      const m = item.matrix;
      return `- ${m.surface} / ${m.configuration}: n=${item.samples}; ${m.provider_calls_avoided}/${item.samples} equivalent provider calls avoided; ${m.provider_units_avoided} ${m.provider_unit_label} avoided; provider-path median ${m.baseline_median_ms} ms -> ${item.reuse_median_ms} ms bounded reuse; verified ${item.verified_at.slice(0, 10)}. Evidence: ${item.evidence_url}.`;
    })
    .filter(Boolean)
    .join('\n');
  return `## Public install\n\n- JavaScript / TypeScript: ${f.install.npm_command}\n- Python: ${f.install.pypi_command}\n- Client version: ${f.install.client_version}\n- Required base runtime dependencies: ${f.install.runtime_dependencies}\n- Account/API key required: no\n- Current SeenRelay API fee: $0\n\n## Verified measured results\n\n${measured || '- No verified benchmark currently published.'}\n- These are controlled measurements, not promised natural-world reuse rates.\n- Canonical machine-readable product facts: ${origin}/product-facts.json\n- Full measured-result interpretation: https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_RESULTS.md\n`;
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
