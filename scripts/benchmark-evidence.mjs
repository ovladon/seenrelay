import fs from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const ingestIndex = args.indexOf('--ingest');
const writeMode = args.includes('--write');
const factsPath = 'public/product-facts.json';

function fail(message) {
  throw new Error(message);
}
function finite(value, label) {
  if (!Number.isFinite(value)) fail(`${label} must be a finite number`);
}
function validateMatrix(matrix, label) {
  if (!matrix || typeof matrix !== 'object') fail(`${label}.matrix is required`);
  for (const field of ['series_key','surface','configuration','evidence_level','fit','cost_outcome','latency_outcome','baseline_context','provider_unit_label']) {
    if (typeof matrix[field] !== 'string' || !matrix[field].trim()) fail(`${label}.matrix.${field} is required`);
  }
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(matrix.series_key)) fail(`${label}.matrix.series_key must be stable machine text`);
  if (!['good','conditional','poor'].includes(matrix.fit)) fail(`${label}.matrix.fit must be good, conditional or poor`);
  if (!['better','worse','neutral','unknown'].includes(matrix.cost_outcome)) fail(`${label}.matrix.cost_outcome is invalid`);
  if (!['better','worse','neutral','unknown'].includes(matrix.latency_outcome)) fail(`${label}.matrix.latency_outcome is invalid`);
  for (const field of ['baseline_median_ms','provider_calls_avoided','provider_units_avoided']) finite(matrix[field], `${label}.matrix.${field}`);
  if (matrix.baseline_median_ms < 0 || matrix.provider_calls_avoided < 0 || matrix.provider_units_avoided < 0) fail(`${label}.matrix metrics cannot be negative`);
}
function validateBenchmark(benchmark, label = 'benchmark') {
  if (!benchmark || typeof benchmark !== 'object') fail(`${label} is required`);
  for (const field of ['id','status','verified_at','provider','workload','evidence_url','artifact_digest','caveat']) {
    if (typeof benchmark[field] !== 'string' || !benchmark[field].trim()) fail(`${label}.${field} is required`);
  }
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(benchmark.id)) fail(`${label}.id must be stable machine text`);
  if (!Number.isFinite(Date.parse(benchmark.verified_at))) fail(`${label}.verified_at is invalid`);
  if (!/^https:\/\/github\.com\/ovladon\/seenrelay\/actions\/runs\/\d+$/.test(benchmark.evidence_url)) fail(`${label}.evidence_url must point to a SeenRelay GitHub Actions run`);
  if (!/^sha256:[0-9a-f]{64}$/.test(benchmark.artifact_digest)) fail(`${label}.artifact_digest must be sha256:<64 lowercase hex>`);
  if (benchmark.caveat.length < 40) fail(`${label}.caveat is too weak`);
  finite(benchmark.samples, `${label}.samples`);
  finite(benchmark.freshness_window_seconds, `${label}.freshness_window_seconds`);
  finite(benchmark.reuse_median_ms, `${label}.reuse_median_ms`);
  if (benchmark.samples < 1 || benchmark.freshness_window_seconds < 0 || benchmark.reuse_median_ms < 0) fail(`${label} numeric values are out of range`);
  validateMatrix(benchmark.matrix, label);
  if (benchmark.matrix.provider_calls_avoided > benchmark.samples) fail(`${label}.matrix.provider_calls_avoided cannot exceed samples`);
}

const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
if (facts.schema_version !== 2) fail(`product facts schema_version must be 2, got ${facts.schema_version}`);
if (!Array.isArray(facts.verified_benchmarks)) fail('verified_benchmarks must be an array');
for (const benchmark of facts.verified_benchmarks) validateBenchmark(benchmark, `canonical:${benchmark?.id ?? 'unknown'}`);

if (ingestIndex >= 0) {
  const evidencePath = args[ingestIndex + 1];
  if (!evidencePath) fail('--ingest requires a JSON path');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  if (evidence.schema_version !== 1) fail('benchmark evidence schema_version must be 1');
  if (evidence.publication_candidate !== true) fail('benchmark evidence is not a publication candidate');
  if (!evidence.kill_criteria || typeof evidence.kill_criteria !== 'object') fail('kill_criteria are required');
  const criteria = Object.entries(evidence.kill_criteria);
  if (!criteria.length || criteria.some(([, value]) => value !== true)) fail('every declared kill criterion must be true');
  validateBenchmark(evidence.benchmark, 'incoming');

  const next = facts.verified_benchmarks.filter((item) => item.id !== evidence.benchmark.id);
  next.push(evidence.benchmark);
  next.sort((a, b) => a.verified_at.localeCompare(b.verified_at));
  facts.verified_benchmarks = next;
  facts.updated_at = evidence.benchmark.verified_at.replace(/\.\d{3}Z$/, 'Z');

  if (!writeMode) fail('--ingest is dry by default; pass --write to update canonical facts');
  fs.writeFileSync(factsPath, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`accepted benchmark evidence: ${evidence.benchmark.id}`);
} else {
  console.log(`verified benchmark evidence contract: ${facts.verified_benchmarks.length} canonical records`);
}
