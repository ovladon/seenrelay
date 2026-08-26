from pathlib import Path
import json


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_function(text, start_marker, end_marker, replacement):
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        raise RuntimeError(f'missing function boundary: {start_marker}')
    return text[:start] + replacement.rstrip() + '\n' + text[end:]

facts_path = Path('public/product-facts.json')
facts = json.loads(facts_path.read_text())
matrices = {
    'firecrawl-basic-scrape-2026-08-26': {
        'series_key': 'firecrawl-basic-scrape-provider-cache-v1',
        'surface': 'Basic cached scrape',
        'configuration': 'Fixed URL · provider cache enabled',
        'evidence_level': 'first-party smoke',
        'fit': 'conditional',
        'cost_outcome': 'better',
        'latency_outcome': 'worse',
        'baseline_median_ms': 91.03,
        'baseline_context': 'provider-cached scrape',
        'provider_calls_avoided': 5,
        'provider_units_avoided': 5,
        'provider_unit_label': 'credits',
    },
    'firecrawl-json-extraction-2026-08-26': {
        'series_key': 'firecrawl-json-structured-extraction-v1',
        'surface': 'Structured JSON extraction',
        'configuration': 'Fixed URL · JSON structured extraction',
        'evidence_level': 'first-party smoke',
        'fit': 'good',
        'cost_outcome': 'better',
        'latency_outcome': 'better',
        'baseline_median_ms': 1265.68,
        'baseline_context': 'fresh extraction; provider-cached comparison 1039.5 ms',
        'provider_calls_avoided': 3,
        'provider_units_avoided': 15,
        'provider_unit_label': 'credits',
    },
    'firecrawl-browser-interaction-2026-08-26': {
        'series_key': 'firecrawl-browser-interaction-code-v1',
        'surface': 'Browser interaction',
        'configuration': 'Fixed URL · scrape + interact(code) + stop',
        'evidence_level': 'first-party smoke',
        'fit': 'good',
        'cost_outcome': 'better',
        'latency_outcome': 'better',
        'baseline_median_ms': 4385.018,
        'baseline_context': 'full browser validation',
        'provider_calls_avoided': 3,
        'provider_units_avoided': 9,
        'provider_unit_label': 'credits',
    },
}
for benchmark in facts['verified_benchmarks']:
    if benchmark['id'] not in matrices:
        raise RuntimeError(f"no normalized matrix mapping for {benchmark['id']}")
    benchmark['matrix'] = matrices[benchmark['id']]
facts['schema_version'] = 2
facts_path.write_text(json.dumps(facts, indent=2, ensure_ascii=False) + '\n')

view = read('src/public-facts-view.ts')
generic_map = r'''export function verifiedWorkloadMapHtml(): string {
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
      return `<tr><td><span class="fit-badge fit-${esc(m.fit)}">${esc(fit)}</span></td><td><b>${esc(m.surface)}</b><small>${esc(item.provider)} · ${esc(m.configuration)}</small></td><td>${esc(m.evidence_level)} · n=${esc(item.samples)}</td><td>${esc(cost)}</td><td>${esc(latency)}</td><td>${esc(m.baseline_median_ms)} ms<small>${esc(m.baseline_context)}</small></td><td>${esc(item.reuse_median_ms)} ms</td><td>${esc(m.provider_calls_avoided)}/${esc(item.samples)} calls<small>${esc(m.provider_units_avoided)} ${esc(m.provider_unit_label)}</small></td><td>${esc(item.freshness_window_seconds)}s</td><td><a href="${esc(item.evidence_url)}" rel="noreferrer">${esc(item.verified_at.slice(0, 10))} ↗</a></td></tr>`;
    })
    .join('');
  if (!rows) return '';
  return `<section class="section decision" id="workload-map">
<div class="section-head"><div><div class="eyebrow">VERIFIED WORKLOAD MATRIX</div><h2>Where SeenRelay has helped — and where it has not.</h2></div><p>Latest verified result per tested configuration. The table is generated from canonical benchmark evidence, so new verified configurations can appear without hand-editing this page. Small controlled tests do not predict how often your fleet will produce reusable matches.</p></div>
<div class="benchmark-table-wrap"><table class="benchmark-table"><thead><tr><th>Fit</th><th>Surface / configuration</th><th>Evidence</th><th>Cost</th><th>Latency</th><th>Baseline median</th><th>Reuse median</th><th>Provider work avoided</th><th>Window</th><th>Verified</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="trust-note"><a href="/economics">Measurement rules, evidence and break-even logic →</a></div>
</section>`;
}'''
view = replace_function(view, 'export function verifiedWorkloadMapHtml(): string {', 'export function siteFooterHtml(): string {', generic_map)

generic_machine = r'''export function machinePublicFactsText(origin: string): string {
  const f = publicProductFacts;
  const measured = f.verified_benchmarks
    .filter((item) => 'matrix' in item)
    .map((item) => {
      if (!('matrix' in item)) return '';
      const m = item.matrix;
      return `- ${m.surface} / ${m.configuration}: fit=${m.fit}; cost=${m.cost_outcome}; latency=${m.latency_outcome}; n=${item.samples}; ${m.provider_calls_avoided}/${item.samples} equivalent provider calls avoided; ${m.provider_units_avoided} ${m.provider_unit_label} avoided; median ${m.baseline_median_ms} ms baseline -> ${item.reuse_median_ms} ms bounded reuse; verified ${item.verified_at.slice(0, 10)}. Evidence: ${item.evidence_url}.`;
    })
    .filter(Boolean)
    .join('\n');
  return `## Public install\n\n- JavaScript / TypeScript: ${f.install.npm_command}\n- Python: ${f.install.pypi_command}\n- Client version: ${f.install.client_version}\n- Runtime dependencies: ${f.install.runtime_dependencies}\n- Account/API key required: no\n- Current SeenRelay API fee: $0\n\n## Verified measured results\n\n${measured || '- No verified benchmark currently published.'}\n- These are controlled measurements, not promised natural-world reuse rates.\n- Canonical machine-readable product facts: ${origin}/product-facts.json\n- Full measured-result interpretation: https://github.com/ovladon/seenrelay/blob/main/docs/VERIFIED_RESULTS.md\n`;
}'''
view = replace_function(view, 'export function machinePublicFactsText(origin: string): string {', 'export function productFactsForOrigin(origin: string)', generic_machine)
write('src/public-facts-view.ts', view)

sync = read('scripts/sync-public-surfaces.mjs')
generic_verified = r'''function renderVerifiedResults(facts) {
  const rows = facts.verified_benchmarks.map((b) => {
    const m = b.matrix;
    if (!m) fail(`Benchmark ${b.id} is missing normalized matrix evidence`);
    return `| ${m.surface} · ${m.configuration} | ${m.evidence_level}, n=${b.samples} | ${m.fit} | ${m.cost_outcome} | ${m.latency_outcome} | ${m.provider_calls_avoided}/${b.samples} calls; ${m.provider_units_avoided} ${m.provider_unit_label} | ${m.baseline_median_ms} ms | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;
  }).join('\n');
  return `# Verified results\n\nGenerated from public/product-facts.json. Do not edit measured claims here by hand.\n\n| Surface / configuration | Evidence | Fit | Cost | Latency | Provider work avoided | Baseline median | SeenRelay reuse median | Caller freshness window |\n| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |\n${rows}\n\n## Interpretation\n\nRows are verification-gated measurements, not universal performance promises. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy. The website shows the latest verified result per configuration while this document retains the published benchmark records.\n\nEvidence:\n${facts.verified_benchmarks.map((b) => `- ${b.id}: ${b.evidence_url} (${b.artifact_digest})\n  - ${b.caveat}`).join('\n')}\n`;
}'''
sync = replace_function(sync, 'function renderVerifiedResults(facts) {', 'const sourceFacts =', generic_verified)
write('scripts/sync-public-surfaces.mjs', sync)

css = read('public/site.css')
if '.benchmark-table-wrap' not in css:
    css += '.benchmark-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px;background:#091217}.benchmark-table{width:100%;min-width:1120px;border-collapse:collapse;font-size:12px}.benchmark-table th,.benchmark-table td{padding:14px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.benchmark-table th{position:sticky;top:0;background:#0b171c;color:#80959d;text-transform:uppercase;letter-spacing:.06em;font-size:10px}.benchmark-table tbody tr:last-child td{border-bottom:0}.benchmark-table b{display:block;font-size:13px;color:#e5eff2}.benchmark-table small{display:block;margin-top:5px;color:#6f858d;line-height:1.4}.benchmark-table a{color:var(--accent)}.fit-badge{display:inline-flex;padding:5px 7px;border-radius:999px;border:1px solid #30454d;font:800 9px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em}.fit-good{color:var(--accent);border-color:#1f5b4c;background:#0d2522}.fit-conditional{color:var(--warm);border-color:#5c4d26;background:#211b0d}.fit-poor{color:#f3a7a7;border-color:#613636;background:#241111}@media(max-width:900px){.benchmark-table-wrap{margin-right:-24px;border-radius:14px 0 0 14px}}'
write('public/site.css', css)

econ = read('tests/economics-positioning.test.mjs')
econ = econ.replace("  assert.match(publicView, /WHERE THE ECONOMICS HAVE HELD UP SO FAR/);\n  assert.match(publicView, /Browser interaction · cost ↓ latency ↓/);", "  assert.match(publicView, /VERIFIED WORKLOAD MATRIX/);\n  assert.match(publicView, /benchmark-table/);\n  assert.doesNotMatch(publicView, /firecrawl-browser-interaction-2026-08-26/);")
econ = econ.replace("  assert.equal(browserBenchmark.samples, 3);", "  assert.equal(browserBenchmark.samples, 3);\n  assert.equal(browserBenchmark.matrix.series_key, 'firecrawl-browser-interaction-code-v1');\n  assert.equal(browserBenchmark.matrix.fit, 'good');\n  assert.equal(browserBenchmark.matrix.cost_outcome, 'better');\n  assert.equal(browserBenchmark.matrix.latency_outcome, 'better');")
write('tests/economics-positioning.test.mjs', econ)

write('tests/benchmark-matrix.test.mjs', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const facts = JSON.parse(fs.readFileSync('public/product-facts.json', 'utf8'));
const view = fs.readFileSync('src/public-facts-view.ts', 'utf8');
const sync = fs.readFileSync('scripts/sync-public-surfaces.mjs', 'utf8');
const css = fs.readFileSync('public/site.css', 'utf8');
const contract = fs.readFileSync('scripts/benchmark-evidence.mjs', 'utf8');
const matrixFields = ['series_key','surface','configuration','evidence_level','fit','cost_outcome','latency_outcome','baseline_median_ms','baseline_context','provider_calls_avoided','provider_units_avoided','provider_unit_label'];

test('every verified benchmark carries normalized matrix evidence', () => {
  assert.equal(facts.schema_version, 2);
  assert.ok(facts.verified_benchmarks.length >= 3);
  for (const benchmark of facts.verified_benchmarks) {
    assert.ok(benchmark.matrix, benchmark.id);
    for (const field of matrixFields) assert.notEqual(benchmark.matrix[field], undefined, `${benchmark.id}.matrix.${field}`);
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

test('verified-result generation and evidence gate are provider-generic', () => {
  const start = sync.indexOf('function renderVerifiedResults');
  const end = sync.indexOf('const sourceFacts', start);
  const renderer = sync.slice(start, end);
  assert.match(renderer, /b\.matrix/);
  assert.doesNotMatch(renderer, /json-extraction|browser-interaction|basic scrape/);
  assert.match(contract, /every declared kill criterion must be true/);
  assert.match(contract, /publication_candidate/);
});
''')

write('docs/BENCHMARK_EVIDENCE.md', '''# Benchmark evidence contract

The public workload matrix is generated from verification-gated benchmark records in `public/product-facts.json`.

## Publication boundary

A benchmark may propose a public record only after its benchmark-specific kill criteria have been evaluated. The proposal must contain `publication_candidate: true`, every declared kill criterion must be `true`, and the benchmark record must include a normalized `matrix` object, an evidence URL, an artifact SHA-256 digest, and an explicit caveat.

Passing this contract does not make a benchmark a universal performance claim. It makes the measurement eligible for the normal SeenRelay release process.

## Normalized matrix fields

Each record supplies a stable `series_key`, surface, configuration, evidence level, fit classification, cost and latency outcomes, baseline and reuse medians, provider work avoided, freshness window, evidence URL, artifact digest, and caveat. The website shows the latest verified record for each `series_key`; the canonical facts file can retain historical runs.

## Automation

`scripts/benchmark-evidence.mjs` validates current canonical records or ingests one normalized benchmark evidence file. `scripts/propose-benchmark-evidence.sh` can be called by a benchmark workflow after the benchmark itself succeeds. It runs the evidence gate and the full project checks, then opens a data-only pull request. It does not merge or deploy public claims directly.
''')

benchmark = read('scripts/benchmark-firecrawl-interact.mjs')
if "import { createHash } from 'node:crypto';" not in benchmark:
    benchmark = benchmark.replace("import { writeFile } from 'node:fs/promises';", "import { writeFile } from 'node:fs/promises';\nimport { createHash } from 'node:crypto';")
old_tail = """await writeFile('firecrawl-interact-benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

// A provider/access failure makes the workflow fail, but a valid negative benchmark does not.
if (result.error) process.exit(1);"""
new_tail = r'''const rawBenchmarkJson = JSON.stringify(result, null, 2);
await writeFile('firecrawl-interact-benchmark.json', rawBenchmarkJson);

const capturedDate = String(result.captured_at || new Date().toISOString()).slice(0, 10);
const runId = process.env.GITHUB_RUN_ID || '';
const evidenceUrl = runId ? `https://github.com/ovladon/seenrelay/actions/runs/${runId}` : '';
const rawDigest = createHash('sha256').update(rawBenchmarkJson).digest('hex');
const providerMedian = result.summary?.provider_latency_ms_median ?? null;
const reuseMedian = result.summary?.reuse_latency_ms_median ?? null;
const latencyImprovement = Number.isFinite(providerMedian) && Number.isFinite(reuseMedian) && providerMedian > 0
  ? Number((((providerMedian - reuseMedian) / providerMedian) * 100).toFixed(1))
  : null;
const benchmarkEvidence = {
  schema_version: 1,
  publication_candidate: result.recommendation_candidate === true && Boolean(evidenceUrl),
  kill_criteria: result.kill_criteria || {},
  benchmark: result.summary ? {
    id: `firecrawl-browser-interaction-${capturedDate}`,
    status: 'first_party_smoke',
    verified_at: result.captured_at,
    provider: 'Firecrawl',
    workload: 'fixed-URL browser interaction using scrape + interact(code) + stop',
    samples: result.summary.provider_samples,
    freshness_window_seconds: 3600,
    baseline_provider_calls: result.summary.provider_samples,
    baseline_median_ms: providerMedian,
    reuse_provider_calls: result.summary.provider_calls_during_reuse,
    reuse_median_ms: reuseMedian,
    provider_calls_avoided: result.summary.provider_samples - result.summary.provider_calls_during_reuse,
    provider_credits_avoided: result.summary.provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations,
    latency_improvement_percent: latencyImprovement,
    provider_credit_model: 'Each measured direct validation uses one Firecrawl scrape plus the interact credits reported by the stopped browser session.',
    economic_result: 'lower provider-credit consumption on every eligible reuse in this run',
    latency_result: 'lower median latency than the full browser-validation path in this run',
    evidence_url: evidenceUrl,
    artifact_digest: `sha256:${rawDigest}`,
    caveat: 'First-party smoke benchmark on one intentionally repeated source-backed fact. It demonstrates measured mechanics when eligible reuse exists; it does not establish a natural-world reuse rate or a universal browser-workload speedup.',
    matrix: {
      series_key: 'firecrawl-browser-interaction-code-v1',
      surface: 'Browser interaction',
      configuration: 'Fixed URL · scrape + interact(code) + stop',
      evidence_level: 'first-party smoke',
      fit: result.recommendation_candidate ? 'good' : 'conditional',
      cost_outcome: result.summary.provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations > 0 ? 'better' : 'neutral',
      latency_outcome: Number.isFinite(providerMedian) && Number.isFinite(reuseMedian) ? (reuseMedian < providerMedian ? 'better' : reuseMedian > providerMedian ? 'worse' : 'neutral') : 'unknown',
      baseline_median_ms: providerMedian,
      baseline_context: 'full browser validation',
      provider_calls_avoided: result.summary.provider_samples - result.summary.provider_calls_during_reuse,
      provider_units_avoided: result.summary.provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations,
      provider_unit_label: 'credits'
    }
  } : null
};
await writeFile('benchmark-evidence.json', JSON.stringify(benchmarkEvidence, null, 2));
console.log(rawBenchmarkJson);

// A provider/access failure makes the workflow fail, but a valid negative benchmark does not.
if (result.error) process.exit(1);'''
if old_tail not in benchmark:
    raise RuntimeError('browser benchmark tail marker missing')
benchmark = benchmark.replace(old_tail, new_tail)
write('scripts/benchmark-firecrawl-interact.mjs', benchmark)

workflow = read('.github/workflows/firecrawl-interact-benchmark.yml')
workflow = workflow.replace('permissions:\n  contents: read', 'permissions:\n  contents: write\n  pull-requests: write')
workflow = workflow.replace('          path: firecrawl-interact-benchmark.json', '          path: |\n            firecrawl-interact-benchmark.json\n            benchmark-evidence.json')
if 'Propose verified benchmark evidence' not in workflow:
    workflow += """      - name: Propose verified benchmark evidence
        if: github.event_name == 'workflow_dispatch' && success()
        env:
          GH_TOKEN: ${{ github.token }}
        run: bash scripts/propose-benchmark-evidence.sh benchmark-evidence.json
"""
write('.github/workflows/firecrawl-interact-benchmark.yml', workflow)

print('Benchmark matrix v2 bootstrap complete.')
