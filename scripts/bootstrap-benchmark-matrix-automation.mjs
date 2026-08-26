import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

const factsPath = 'public/product-facts.json';
const facts = JSON.parse(read(factsPath));
const matrix = {
  'firecrawl-basic-scrape-2026-08-26': {
    series_key: 'firecrawl-basic-scrape-provider-cache-v1',
    surface: 'Basic cached scrape',
    configuration: 'Fixed URL · provider cache enabled',
    evidence_level: 'first-party smoke',
    fit: 'conditional',
    cost_outcome: 'better',
    latency_outcome: 'worse',
    baseline_median_ms: 91.03,
    baseline_context: 'provider-cached scrape',
    provider_calls_avoided: 5,
    provider_units_avoided: 5,
    provider_unit_label: 'credits'
  },
  'firecrawl-json-extraction-2026-08-26': {
    series_key: 'firecrawl-json-structured-extraction-v1',
    surface: 'Structured JSON extraction',
    configuration: 'Fixed URL · JSON structured extraction',
    evidence_level: 'first-party smoke',
    fit: 'good',
    cost_outcome: 'better',
    latency_outcome: 'better',
    baseline_median_ms: 1265.68,
    baseline_context: 'fresh extraction; provider-cached comparison 1039.5 ms',
    provider_calls_avoided: 3,
    provider_units_avoided: 15,
    provider_unit_label: 'credits'
  },
  'firecrawl-browser-interaction-2026-08-26': {
    series_key: 'firecrawl-browser-interaction-code-v1',
    surface: 'Browser interaction',
    configuration: 'Fixed URL · scrape + interact(code) + stop',
    evidence_level: 'first-party smoke',
    fit: 'good',
    cost_outcome: 'better',
    latency_outcome: 'better',
    baseline_median_ms: 4385.018,
    baseline_context: 'full browser validation',
    provider_calls_avoided: 3,
    provider_units_avoided: 9,
    provider_unit_label: 'credits'
  }
};
for (const b of facts.verified_benchmarks) {
  if (!matrix[b.id]) throw new Error(`No matrix mapping for ${b.id}`);
  b.matrix = matrix[b.id];
}
facts.schema_version = 2;
write(factsPath, `${JSON.stringify(facts, null, 2)}\n`);

let view = read('src/public-facts-view.ts');
const mapStart = view.indexOf('export function verifiedWorkloadMapHtml(): string {');
const mapEnd = view.indexOf('\nexport function siteFooterHtml(): string {', mapStart);
if (mapStart < 0 || mapEnd < 0) throw new Error('verifiedWorkloadMapHtml boundaries missing');
const genericMap = `export function verifiedWorkloadMapHtml(): string {
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
      const cost = m.cost_outcome === 'better' ? '↓ better' : m.cost_outcome === 'worse' ? '↑ worse' : m.cost_outcome;
      const latency = m.latency_outcome === 'better' ? '↓ better' : m.latency_outcome === 'worse' ? '↑ worse' : m.latency_outcome;
      const fit = m.fit === 'good' ? 'GOOD' : m.fit === 'conditional' ? 'CONDITIONAL' : String(m.fit).toUpperCase();
      return \`<tr><td><span class="fit-badge fit-\${esc(m.fit)}">\${esc(fit)}</span></td><td><b>\${esc(m.surface)}</b><small>\${esc(item.provider)} · \${esc(m.configuration)}</small></td><td>\${esc(m.evidence_level)} · n=\${esc(item.samples)}</td><td>\${esc(cost)}</td><td>\${esc(latency)}</td><td>\${esc(m.baseline_median_ms)} ms<small>\${esc(m.baseline_context)}</small></td><td>\${esc(item.reuse_median_ms)} ms</td><td>\${esc(m.provider_calls_avoided)}/\${esc(item.samples)} calls<small>\${esc(m.provider_units_avoided)} \${esc(m.provider_unit_label)}</small></td><td>\${esc(item.freshness_window_seconds)}s</td><td><a href="\${esc(item.evidence_url)}" rel="noreferrer">\${esc(item.verified_at.slice(0, 10))} ↗</a></td></tr>\`;
    })
    .join('');
  if (!rows) return '';
  return \`<section class="section decision" id="workload-map">
<div class="section-head"><div><div class="eyebrow">VERIFIED WORKLOAD MATRIX</div><h2>Where SeenRelay has helped — and where it has not.</h2></div><p>Latest verified result per tested configuration. The table is generated from canonical benchmark evidence, so new verified configurations can appear without hand-editing this page. Small controlled tests do not predict your fleet's natural reuse rate.</p></div>
<div class="benchmark-table-wrap"><table class="benchmark-table"><thead><tr><th>Fit</th><th>Surface / configuration</th><th>Evidence</th><th>Cost</th><th>Latency</th><th>Baseline median</th><th>Reuse median</th><th>Provider work avoided</th><th>Window</th><th>Verified</th></tr></thead><tbody>\${rows}</tbody></table></div>
<div class="trust-note"><a href="/economics">Measurement rules, evidence and break-even logic →</a></div>
</section>\`;
}
`;
view = view.slice(0, mapStart) + genericMap + view.slice(mapEnd + 1);

const machineStart = view.indexOf('export function machinePublicFactsText(origin: string): string {');
const machineEnd = view.indexOf('\nexport function productFactsForOrigin(origin: string)', machineStart);
if (machineStart < 0 || machineEnd < 0) throw new Error('machinePublicFactsText boundaries missing');
const genericMachine = `export function machinePublicFactsText(origin: string): string {
  const f = publicProductFacts;
  const measured = f.verified_benchmarks
    .filter((item) => 'matrix' in item)
    .map((item) => {
      if (!('matrix' in item)) return '';
      const m = item.matrix;
      return \`- \${m.surface} / \${m.configuration}: fit=\${m.fit}; cost=\${m.cost_outcome}; latency=\${m.latency_outcome}; n=\${item.samples}; \${m.provider_calls_avoided}/\${item.samples} equivalent provider calls avoided; \${m.provider_units_avoided} \${m.provider_unit_label} avoided; median \${m.baseline_median_ms} ms baseline -> \${item.reuse_median_ms} ms bounded reuse; verified \${item.verified_at.slice(0, 10)}. Evidence: \${item.evidence_url}.\`;
    })
    .filter(Boolean)
    .join('\\n');
  return \`## Public install\\n\\n- JavaScript / TypeScript: \${f.install.npm_command}\\n- Python: \${f.install.pypi_command}\\n- Client version: \${f.install.client_version}\\n- Runtime dependencies: \${f.install.runtime_dependencies}\\n- Account/API key required: no\\n- Current SeenRelay API fee: $0\\n\\n## Verified measured results\\n\\n\${measured || '- No verified benchmark currently published.'}\\n- These are controlled measurements, not promised natural-world reuse rates.\\n- Canonical machine-readable product facts: \${origin}/product-facts.json\\n- Full measured-result interpretation: https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_RESULTS.md\\n\`;
}
`;
view = view.slice(0, machineStart) + genericMachine + view.slice(machineEnd + 1);
write('src/public-facts-view.ts', view);

let sync = read('scripts/sync-public-surfaces.mjs');
const verifiedStart = sync.indexOf('function renderVerifiedResults(facts) {');
const verifiedEnd = sync.indexOf('\n\nconst sourceFacts =', verifiedStart);
if (verifiedStart < 0 || verifiedEnd < 0) throw new Error('renderVerifiedResults boundaries missing');
const genericVerified = `function renderVerifiedResults(facts) {
  const rows = facts.verified_benchmarks.map((b) => {
    const m = b.matrix;
    if (!m) fail(\`Benchmark \${b.id} is missing normalized matrix evidence\`);
    return \`| \${m.surface} · \${m.configuration} | \${m.evidence_level}, n=\${b.samples} | \${m.fit} | \${m.cost_outcome} | \${m.latency_outcome} | \${m.provider_calls_avoided}/\${b.samples} calls; \${m.provider_units_avoided} \${m.provider_unit_label} | \${m.baseline_median_ms} ms | \${b.reuse_median_ms} ms | \${b.freshness_window_seconds}s |\`;
  }).join('\\n');
  return \`# Verified results\\n\\nGenerated from \\`public/product-facts.json\\`. Do not edit measured claims here by hand.\\n\\n| Surface / configuration | Evidence | Fit | Cost | Latency | Provider work avoided | Baseline median | SeenRelay reuse median | Caller freshness window |\\n| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |\\n\${rows}\\n\\n## Interpretation\\n\\nRows are verification-gated measurements, not universal performance promises. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy. The website shows the latest verified result per configuration while this document retains the published benchmark records.\\n\\nEvidence:\\n\${facts.verified_benchmarks.map((b) => \`- \${b.id}: \${b.evidence_url} (\${b.artifact_digest})\\n  - \${b.caveat}\`).join('\\n')}\\n\`;
}`;
sync = sync.slice(0, verifiedStart) + genericVerified + sync.slice(verifiedEnd);
write('scripts/sync-public-surfaces.mjs', sync);

let css = read('public/site.css');
if (!css.includes('.benchmark-table-wrap')) {
  css += '.benchmark-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px;background:#091217}.benchmark-table{width:100%;min-width:1120px;border-collapse:collapse;font-size:12px}.benchmark-table th,.benchmark-table td{padding:14px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.benchmark-table th{position:sticky;top:0;background:#0b171c;color:#80959d;text-transform:uppercase;letter-spacing:.06em;font-size:10px}.benchmark-table tbody tr:last-child td{border-bottom:0}.benchmark-table b{display:block;font-size:13px;color:#e5eff2}.benchmark-table small{display:block;margin-top:5px;color:#6f858d;line-height:1.4}.benchmark-table a{color:var(--accent)}.fit-badge{display:inline-flex;padding:5px 7px;border-radius:999px;border:1px solid #30454d;font:800 9px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em}.fit-good{color:var(--accent);border-color:#1f5b4c;background:#0d2522}.fit-conditional{color:var(--warm);border-color:#5c4d26;background:#211b0d}.fit-poor{color:#f3a7a7;border-color:#613636;background:#241111}@media(max-width:900px){.benchmark-table-wrap{margin-right:-24px;border-radius:14px 0 0 14px}}';
}
write('public/site.css', css);

let econ = read('tests/economics-positioning.test.mjs');
econ = econ.replace("  assert.match(publicView, /WHERE THE ECONOMICS HAVE HELD UP SO FAR/);\n  assert.match(publicView, /Browser interaction · cost ↓ latency ↓/);", "  assert.match(publicView, /VERIFIED WORKLOAD MATRIX/);\n  assert.match(publicView, /benchmark-table/);\n  assert.doesNotMatch(publicView, /firecrawl-browser-interaction-2026-08-26/);");
econ = econ.replace("  assert.equal(browserBenchmark.samples, 3);", "  assert.equal(browserBenchmark.samples, 3);\n  assert.equal(browserBenchmark.matrix.series_key, 'firecrawl-browser-interaction-code-v1');\n  assert.equal(browserBenchmark.matrix.fit, 'good');\n  assert.equal(browserBenchmark.matrix.cost_outcome, 'better');\n  assert.equal(browserBenchmark.matrix.latency_outcome, 'better');");
write('tests/economics-positioning.test.mjs', econ);

write('tests/benchmark-matrix.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const facts = JSON.parse(fs.readFileSync('public/product-facts.json', 'utf8'));
const view = fs.readFileSync('src/public-facts-view.ts', 'utf8');
const sync = fs.readFileSync('scripts/sync-public-surfaces.mjs', 'utf8');
const css = fs.readFileSync('public/site.css', 'utf8');

const matrixFields = ['series_key','surface','configuration','evidence_level','fit','cost_outcome','latency_outcome','baseline_median_ms','baseline_context','provider_calls_avoided','provider_units_avoided','provider_unit_label'];

test('every verified benchmark carries normalized matrix evidence', () => {
  assert.equal(facts.schema_version, 2);
  assert.ok(facts.verified_benchmarks.length >= 3);
  for (const benchmark of facts.verified_benchmarks) {
    assert.ok(benchmark.matrix, benchmark.id);
    for (const field of matrixFields) assert.notEqual(benchmark.matrix[field], undefined, \`\${benchmark.id}.matrix.\${field}\`);
    assert.match(benchmark.evidence_url, /^https:\/\/github\.com\/ovladon\/seenrelay\/actions\/runs\/\d+$/);
    assert.match(benchmark.artifact_digest, /^sha256:[0-9a-f]{64}$/);
  }
});

test('workload matrix renderer is generic and latest-per-series', () => {
  const start = view.indexOf('export function verifiedWorkloadMapHtml');
  const end = view.indexOf('export function siteFooterHtml', start);
  const renderer = view.slice(start, end);
  assert.match(renderer, /latestBySeries/);
  assert.match(renderer, /item\.matrix\.series_key/);
  assert.match(renderer, /benchmark-table/);
  assert.doesNotMatch(renderer, /firecrawl-(?:basic|json|browser)/);
  assert.match(css, /\.benchmark-table/);
});

test('generated verified results do not need provider-specific benchmark branches', () => {
  const start = sync.indexOf('function renderVerifiedResults');
  const end = sync.indexOf('const sourceFacts', start);
  const renderer = sync.slice(start, end);
  assert.match(renderer, /b\.matrix/);
  assert.doesNotMatch(renderer, /json-extraction|browser-interaction|basic scrape/);
});
`);

write('docs/BENCHMARK_EVIDENCE.md', `# Benchmark evidence contract

The public workload matrix is generated from verification-gated benchmark records in \`public/product-facts.json\`.

## Publication boundary

A benchmark may propose a public record only after its benchmark-specific kill criteria have been evaluated. The proposal must contain \`publication_candidate: true\`, every declared kill criterion must be \`true\`, and the benchmark record must include a normalized \`matrix\` object, an evidence URL, an artifact SHA-256 digest, and an explicit caveat.

Passing this contract does not make a benchmark a universal performance claim. It makes the measurement eligible for the normal SeenRelay release process.

## Normalized matrix fields

Each record supplies a stable \`series_key\`, surface, configuration, evidence level, fit classification, cost and latency outcomes, baseline and reuse medians, provider work avoided, freshness window, evidence URL, artifact digest, and caveat. The website shows the latest verified record for each \`series_key\`; the canonical facts file can retain historical runs.

## Automation

\`scripts/benchmark-evidence.mjs\` validates current canonical records or ingests one normalized benchmark evidence file. \`scripts/propose-benchmark-evidence.sh\` can be called by a benchmark workflow after the benchmark itself succeeds. It runs the evidence gate and the full project checks, then opens a data-only pull request. It does not merge or deploy public claims directly.
`);

console.log('Benchmark matrix automation bootstrap complete.');
