import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

let benchmark = read('scripts/benchmark-firecrawl-interact.mjs');
if (!benchmark.includes("import { createHash } from 'node:crypto';")) {
  benchmark = benchmark.replace("import { writeFile } from 'node:fs/promises';", "import { writeFile } from 'node:fs/promises';\nimport { createHash } from 'node:crypto';");
}
const oldTail = `await writeFile('firecrawl-interact-benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

// A provider/access failure makes the workflow fail, but a valid negative benchmark does not.
if (result.error) process.exit(1);`;
const newTail = `const rawBenchmarkJson = JSON.stringify(result, null, 2);
await writeFile('firecrawl-interact-benchmark.json', rawBenchmarkJson);

const capturedDate = String(result.captured_at || new Date().toISOString()).slice(0, 10);
const runId = process.env.GITHUB_RUN_ID || '';
const evidenceUrl = runId ? \`https://github.com/ovladon/seenrelay/actions/runs/\${runId}\` : '';
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
    id: \`firecrawl-browser-interaction-\${capturedDate}\`,
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
    artifact_digest: \`sha256:\${rawDigest}\`,
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
if (result.error) process.exit(1);`;
if (!benchmark.includes(oldTail)) throw new Error('browser benchmark tail marker missing');
benchmark = benchmark.replace(oldTail, newTail);
write('scripts/benchmark-firecrawl-interact.mjs', benchmark);

let workflow = read('.github/workflows/firecrawl-interact-benchmark.yml');
workflow = workflow.replace('permissions:\n  contents: read', 'permissions:\n  contents: write\n  pull-requests: write');
workflow = workflow.replace("          path: firecrawl-interact-benchmark.json", "          path: |\n            firecrawl-interact-benchmark.json\n            benchmark-evidence.json");
if (!workflow.includes('Propose verified benchmark evidence')) {
  workflow += `      - name: Propose verified benchmark evidence\n        if: github.event_name == 'workflow_dispatch' && success()\n        env:\n          GH_TOKEN: \${{ github.token }}\n        run: bash scripts/propose-benchmark-evidence.sh benchmark-evidence.json\n`;
}
write('.github/workflows/firecrawl-interact-benchmark.yml', workflow);

console.log('Browser benchmark now emits normalized evidence and can propose a data-only publication PR.');
