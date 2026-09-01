import test from 'node:test';
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
  assert.doesNotMatch(renderer, /fit-badge|<th>Fit<\/th>|m\.fit/);
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
