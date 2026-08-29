import test from 'node:test';
import assert from 'node:assert/strict';

import { runStandardsShadowBenchmark } from '../scripts/standards-shadow-benchmark.mjs';

const standardsSource = `
export const standardsPosture = {
  mcp: { implemented: '2026-07-28', sdk: '@modelcontextprotocol/server@2.0.0' },
  a2a: { tracked: '1.0.0' },
  observability: { opentelemetry_semconv_tracked: '1.44.0' }
};
`;

const SOURCE_BODIES = new Map([
  ['https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main', [{ name: '2026-03-01' }, { name: '2026-07-28' }]],
  ['https://registry.npmjs.org/%40modelcontextprotocol%2Fserver/latest', { version: '2.0.0' }],
  ['https://api.github.com/repos/a2aproject/A2A/releases/latest', { tag_name: 'v1.0.0' }],
  ['https://api.github.com/repos/open-telemetry/semantic-conventions/releases/latest', { tag_name: 'v1.44.0' }]
]);

function response(body, { status = 200, etag = null } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (etag) headers.set('etag', etag);
  return new Response(JSON.stringify(body), { status, headers });
}

function sourceBody(url) {
  if (!SOURCE_BODIES.has(url)) throw new Error(`unexpected source ${url}`);
  return SOURCE_BODIES.get(url);
}

test('standards shadow benchmark is CHECK-only and keeps exported evidence sanitized', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, method: options.method ?? 'GET', body: options.body ?? null });
    if (target === 'https://relay.invalid/v1/check') {
      return response({ status: 'UNKNOWN' });
    }
    if (target === 'https://relay.invalid/v1/observe') {
      throw new Error('OBSERVE must not be called');
    }
    return response(sourceBody(target), { etag: 'opaque-validator' });
  };

  const { input, summary, evaluation } = await runStandardsShadowBenchmark({
    fetchImpl,
    origin: 'https://relay.invalid',
    standardsSource
  });

  assert.equal(calls.filter((call) => call.target === 'https://relay.invalid/v1/check').length, 4);
  assert.equal(calls.filter((call) => call.target === 'https://relay.invalid/v1/observe').length, 0);
  assert.equal(summary.observe_requests_sent, 0);
  assert.equal(summary.external_adoption_evidence, false);
  assert.equal(summary.first_party, true);
  assert.equal(summary.source_count, 4);
  assert.equal(summary.source_native_validator_available_count, 4);
  assert.equal(summary.evaluation_state, 'incomplete');
  assert.equal(summary.evaluation_reason, 'source_native_conditional_unmeasured');
  assert.equal(evaluation, null);
  assert.equal(input.sample_type, 'natural_workload');
  assert.equal(input.baseline_definition, 'best_existing_non_shared_path');
  assert.equal(input.records.length, 4);
  assert.ok(input.records.every((record) => record.check_status === 'UNKNOWN'));

  assert.deepEqual(Object.keys(input).sort(), [
    'baseline_definition',
    'controls',
    'observe_off_critical_path',
    'records',
    'sample_type',
    'schema_version',
    'workload_id'
  ]);
  assert.deepEqual(Object.keys(input.controls).sort(), [
    'local_cache',
    'provider_native_cache',
    'source_native_conditional'
  ]);

  const allowedRecordKeys = [
    'baseline_cost',
    'baseline_ms',
    'check_cost',
    'check_ms',
    'check_status',
    'observe_after_baseline',
    'observe_cost',
    'observe_ms',
    'policy_reusable',
    'reuse_would_match_validation'
  ].sort();
  for (const record of input.records) {
    assert.deepEqual(Object.keys(record).sort(), allowedRecordKeys);
  }

  assert.deepEqual(Object.keys(summary).sort(), [
    'benchmark_records',
    'evaluation_reason',
    'evaluation_state',
    'external_adoption_evidence',
    'first_party',
    'observe_requests_sent',
    'schema_version',
    'source_count',
    'source_native_validator_available_count',
    'workload_id'
  ]);
});

test('standards shadow benchmark can reach a conservative negative verdict when no stronger control is available', async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target === 'https://relay.invalid/v1/check') {
      return response({ status: 'SAME_OBSERVED' });
    }
    if (target === 'https://relay.invalid/v1/observe') {
      throw new Error('OBSERVE must not be called');
    }
    return response(sourceBody(target));
  };

  const { input, summary, evaluation } = await runStandardsShadowBenchmark({
    fetchImpl,
    origin: 'https://relay.invalid',
    standardsSource
  });

  assert.equal(summary.evaluation_state, 'complete');
  assert.equal(summary.observe_requests_sent, 0);
  assert.ok(input.records.every((record) => record.policy_reusable === true));
  assert.ok(input.records.every((record) => record.reuse_would_match_validation === true));
  assert.equal(evaluation.safety.pass, true);
  assert.equal(evaluation.cost.outcome, 'equal');
  assert.equal(evaluation.decision.beats_baseline_on_both, false);
  assert.equal(evaluation.decision.automatic_reuse_enabled_by_evaluator, false);
});
