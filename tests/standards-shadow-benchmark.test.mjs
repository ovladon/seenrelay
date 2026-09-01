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

function response(body, { status = 200, etag = null, lastModified = null } = {}) {
  const headers = new Headers();
  if (status !== 304) headers.set('content-type', 'application/json');
  if (etag) headers.set('etag', etag);
  if (lastModified) headers.set('last-modified', lastModified);
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

function sourceBody(url) {
  if (!SOURCE_BODIES.has(url)) throw new Error(`unexpected source ${url}`);
  return SOURCE_BODIES.get(url);
}

function assertSanitizedRecords(records) {
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
  for (const record of records) {
    assert.deepEqual(Object.keys(record).sort(), allowedRecordKeys);
  }
}

test('first natural standards run is CHECK-only, sanitized, and incomplete until conditional validation is measured', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, headers: new Headers(options.headers) });
    if (target === 'https://relay.invalid/v1/check') return response({ status: 'UNKNOWN' });
    if (target === 'https://relay.invalid/v1/observe') throw new Error('OBSERVE must not be called');
    return response(sourceBody(target), { etag: `opaque-${calls.length}` });
  };

  const { input, summary, evaluation, state, ledger } = await runStandardsShadowBenchmark({
    fetchImpl,
    origin: 'https://relay.invalid',
    standardsSource
  });

  assert.equal(calls.filter((call) => call.target === 'https://relay.invalid/v1/check').length, 4);
  assert.equal(calls.filter((call) => call.target === 'https://relay.invalid/v1/observe').length, 0);
  assert.equal(summary.observe_requests_sent, 0);
  assert.equal(summary.external_adoption_evidence, false);
  assert.equal(summary.first_party, true);
  assert.equal(summary.workload_class, 'structured_source_reads');
  assert.equal(summary.source_count, 4);
  assert.equal(summary.source_native_validator_available_count, 4);
  assert.equal(summary.source_native_conditional_attempt_count, 0);
  assert.equal(summary.cumulative_benchmark_records, 4);
  assert.equal(summary.preliminary_sample_floor_met, false);
  assert.equal(summary.evaluation_state, 'incomplete');
  assert.equal(summary.evaluation_reason, 'source_native_conditional_unmeasured');
  assert.equal(evaluation, null);
  assert.equal(input.sample_type, 'natural_workload');
  assert.equal(input.workload_class, 'structured_source_reads');
  assert.equal(input.baseline_definition, 'best_existing_non_shared_path');
  assert.equal(input.records.length, 4);
  assert.ok(input.records.every((record) => record.check_status === 'UNKNOWN'));
  assertSanitizedRecords(input.records);

  assert.equal(state.raw_values_retained, false);
  assert.equal(state.sources_retained, false);
  assert.equal(Object.keys(state.entries).length, 4);
  for (const entry of Object.values(state.entries)) {
    assert.equal(typeof entry.value_fingerprint, 'string');
    assert.equal(entry.value_fingerprint.length, 64);
    assert.ok(entry.validator?.kind === 'etag' || entry.validator?.kind === 'last_modified');
    assert.equal('value' in entry && typeof entry.value === 'string' && SOURCE_BODIES.has(entry.value), false);
  }
  assert.equal(ledger.raw_values_retained, false);
  assert.equal(ledger.fact_identity_retained, false);
  assert.equal(ledger.sources_retained, false);
  assert.equal(ledger.timestamps_retained, false);
  assert.equal(ledger.records.length, 4);
  assertSanitizedRecords(ledger.records);
});

test('next natural run uses retained source validators, measures 304 baseline, and accumulates sanitized evidence', async () => {
  const firstFetch = async (url) => {
    const target = String(url);
    if (target === 'https://relay.invalid/v1/check') return response({ status: 'UNKNOWN' });
    if (target === 'https://relay.invalid/v1/observe') throw new Error('OBSERVE must not be called');
    return response(sourceBody(target), { etag: `etag-${target.length}` });
  };
  const first = await runStandardsShadowBenchmark({
    fetchImpl: firstFetch,
    origin: 'https://relay.invalid',
    standardsSource
  });

  const conditionalCalls = [];
  const secondFetch = async (url, options = {}) => {
    const target = String(url);
    if (target === 'https://relay.invalid/v1/check') return response({ status: 'UNKNOWN' });
    if (target === 'https://relay.invalid/v1/observe') throw new Error('OBSERVE must not be called');
    const headers = new Headers(options.headers);
    conditionalCalls.push(headers);
    assert.ok(headers.get('if-none-match'));
    return response(null, { status: 304, etag: headers.get('if-none-match') });
  };

  const second = await runStandardsShadowBenchmark({
    fetchImpl: secondFetch,
    origin: 'https://relay.invalid',
    standardsSource,
    previousState: first.state,
    previousLedger: first.ledger
  });

  assert.equal(conditionalCalls.length, 4);
  assert.equal(second.summary.source_native_conditional_attempt_count, 4);
  assert.equal(second.summary.source_native_conditional_304_count, 4);
  assert.equal(second.summary.cumulative_benchmark_records, 8);
  assert.equal(second.summary.evaluation_state, 'complete');
  assert.equal(second.input.controls.source_native_conditional.available, true);
  assert.equal(second.input.controls.source_native_conditional.measured, true);
  assert.equal(second.input.records.length, 8);
  assertSanitizedRecords(second.input.records);
  assert.equal(second.ledger.control_evidence.conditional_attempts, 4);
  assert.equal(second.ledger.control_evidence.conditional_304_confirmations, 4);
  assert.equal(second.evaluation.decision.automatic_reuse_enabled_by_evaluator, false);
});

test('standards shadow benchmark can reach a conservative negative verdict when no stronger control is available', async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target === 'https://relay.invalid/v1/check') return response({ status: 'SAME_OBSERVED' });
    if (target === 'https://relay.invalid/v1/observe') throw new Error('OBSERVE must not be called');
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

test('collector rejects a prior ledger containing non-sanitized record fields', async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target === 'https://relay.invalid/v1/check') return response({ status: 'UNKNOWN' });
    return response(sourceBody(target));
  };

  await assert.rejects(
    runStandardsShadowBenchmark({
      fetchImpl,
      origin: 'https://relay.invalid',
      standardsSource,
      previousLedger: {
        workload_id: 'standards-watch-daily-v1',
        workload_class: 'structured_source_reads',
        records: [{ check_status: 'UNKNOWN', leaked_source: 'https://example.invalid' }]
      }
    }),
    /non-sanitized fields/
  );
});
