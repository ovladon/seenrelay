import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  annotateStandardsShadowResult,
  runStandardsShadowCollectorV2,
  standardsShadowSamplingProvenance,
  validateStandardsShadowLineage,
  withStandardsShadowInternalFactContext,
  STANDARDS_SHADOW_INTERNAL_QUALIFIER
} from '../scripts/standards-shadow-collector-v2.mjs';

function rawResult({ records = 4, floor = false } = {}) {
  const items = Array.from({ length: records }, () => ({
    check_status: 'UNKNOWN', policy_reusable: false, reuse_would_match_validation: null,
    observe_after_baseline: false, baseline_ms: 10, baseline_cost: 0,
    check_ms: 5, observe_ms: 0, check_cost: 0, observe_cost: 0,
    source_native_conditional_available: false, source_native_conditional_attempted: false
  }));
  return {
    input: { schema_version: 2, workload_id: 'standards-watch-daily-v1', workload_class: 'structured_source_reads', sample_type: 'natural_workload', records: items },
    summary: { schema_version: 2, workload_id: 'standards-watch-daily-v1', workload_class: 'structured_source_reads', current_run_benchmark_records: 4, cumulative_benchmark_records: records, preliminary_sample_floor_met: floor, evaluation_state: 'complete', evaluation_reason: null },
    evaluation: { decision: { evidence_ready: false } },
    state: { schema_version: 1, workload_id: 'standards-watch-daily-v1', entries: {}, raw_values_retained: false, sources_retained: false },
    ledger: { schema_version: 1, workload_id: 'standards-watch-daily-v1', workload_class: 'structured_source_reads', natural_schedule: 'daily', records: items, control_evidence: {}, raw_values_retained: false, fact_identity_retained: false, sources_retained: false, timestamps_retained: false }
  };
}

function naturalDocument(kind, runId = '1001') {
  const result = annotateStandardsShadowResult(rawResult(), standardsShadowSamplingProvenance({ runEvent: 'schedule', runId }));
  return result[kind];
}

test('only schedule events are classified as natural workload', () => {
  assert.equal(standardsShadowSamplingProvenance({ runEvent: 'schedule', runId: '1' }).sampleType, 'natural_workload');
  assert.equal(standardsShadowSamplingProvenance({ runEvent: 'push', runId: '2' }).sampleType, 'commissioning');
  assert.equal(standardsShadowSamplingProvenance({ runEvent: 'workflow_dispatch', runId: '3' }).sampleType, 'commissioning');
  assert.throws(() => standardsShadowSamplingProvenance({ runEvent: 'push', runId: '4', parentRunId: '1' }), /cannot inherit/);
});

test('legacy or pre-v4 evidence cannot seed the namespaced natural lineage', () => {
  const provenance = standardsShadowSamplingProvenance({ runEvent: 'schedule', runId: '1002', parentRunId: '1001' });
  const legacyState = { schema_version: 1, workload_id: 'standards-watch-daily-v1', entries: {} };
  const legacyLedger = { schema_version: 1, workload_id: 'standards-watch-daily-v1', workload_class: 'structured_source_reads', records: [] };
  assert.throws(() => validateStandardsShadowLineage({ previousState: legacyState, previousLedger: legacyLedger, provenance }), /another collection epoch/);
});

test('natural parent id must match both retained documents', () => {
  const provenance = standardsShadowSamplingProvenance({ runEvent: 'schedule', runId: '1002', parentRunId: 'wrong' });
  assert.throws(() => validateStandardsShadowLineage({ previousState: naturalDocument('state'), previousLedger: naturalDocument('ledger'), provenance }), /run_id does not match parentRunId/);
});

test('natural parent requires state and ledger together', () => {
  const provenance = standardsShadowSamplingProvenance({ runEvent: 'schedule', runId: '1002', parentRunId: '1001' });
  assert.throws(() => validateStandardsShadowLineage({ previousState: naturalDocument('state'), previousLedger: null, provenance }), /requires both/);
});

test('commissioning results cannot advertise natural evidence or a sample-floor pass', () => {
  const provenance = standardsShadowSamplingProvenance({ runEvent: 'push', runId: '2001' });
  const result = annotateStandardsShadowResult(rawResult({ records: 100, floor: true }), provenance);
  assert.equal(result.input.sample_type, 'commissioning');
  assert.equal(result.summary.sample_type, 'commissioning');
  assert.equal(result.summary.preliminary_sample_floor_met, false);
  assert.equal(result.summary.evaluation_state, 'commissioning');
  assert.equal(result.summary.evaluation_reason, 'not_natural_workload');
  assert.equal(result.evaluation, null);
  assert.equal(result.ledger.natural_schedule, null);
  assert.equal(result.ledger.parent_run_id, null);
});

test('collector validates lineage before invoking the measurement engine', async () => {
  let invoked = false;
  await assert.rejects(
    runStandardsShadowCollectorV2({
      previousState: naturalDocument('state'),
      previousLedger: naturalDocument('ledger'),
      runEvent: 'push',
      runId: '2002',
      runBenchmark: async () => { invoked = true; return rawResult(); }
    }),
    /commissioning runs must start without inherited natural evidence/
  );
  assert.equal(invoked, false);
});

test('valid schedule lineage reaches the engine and preserves parent provenance', async () => {
  const state = naturalDocument('state');
  const ledger = naturalDocument('ledger');
  let invoked = false;
  const result = await runStandardsShadowCollectorV2({
    previousState: state,
    previousLedger: ledger,
    runEvent: 'schedule',
    runId: '1002',
    parentRunId: '1001',
    runBenchmark: async ({ previousState, previousLedger, writeFiles }) => {
      invoked = true;
      assert.equal(previousState, state);
      assert.equal(previousLedger, ledger);
      assert.equal(writeFiles, false);
      return rawResult({ records: 8 });
    }
  });
  assert.equal(invoked, true);
  assert.equal(result.input.sample_type, 'natural_workload');
  assert.equal(result.ledger.parent_run_id, '1001');
  assert.equal(result.ledger.run_id, '1002');
  assert.equal(result.ledger.collection_epoch, 'schedule-only-v4');
});

test('Standards Shadow namespaces only hosted CHECK fact identity and preserves other fetches', async () => {
  const calls = [];
  const baseFetch = async (input, init = {}) => {
    calls.push({ input: String(input), init });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const wrapped = withStandardsShadowInternalFactContext(baseFetch);
  const fact = {
    subject: 'Latest MCP specification revision',
    predicate: 'version.latest',
    source: 'https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main',
    locator: { scheme: 'source_key', value: 'latest-dated-specification-directory' },
    qualifiers: { existing: 'preserved' }
  };
  await wrapped('https://relay.invalid/v1/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fact, known_value: '2026-07-28', max_age_seconds: 60 })
  });
  await wrapped(fact.source, { headers: { accept: 'application/json' } });

  assert.equal(calls.length, 2);
  const checkBody = JSON.parse(calls[0].init.body);
  assert.deepEqual(checkBody.fact.qualifiers, {
    existing: 'preserved',
    ...STANDARDS_SHADOW_INTERNAL_QUALIFIER
  });
  assert.equal(checkBody.fact.source, fact.source);
  assert.equal(calls[1].input, fact.source);
  assert.equal(calls[1].init.body, undefined);
});

test('Standards Shadow refuses a conflicting caller-supplied internal workload qualifier', async () => {
  const wrapped = withStandardsShadowInternalFactContext(async () => new Response('{}'));
  await assert.rejects(
    wrapped('https://relay.invalid/v1/check', {
      method: 'POST',
      body: JSON.stringify({
        fact: {
          subject: 'x', predicate: 'version.latest', source: 'https://example.com',
          qualifiers: { seenrelay_internal_workload: 'something-else' }
        },
        known_value: 'x', max_age_seconds: 60
      })
    }),
    /internal workload qualifier conflicts/
  );
});

test('collector supplies the namespaced CHECK fetch to the measurement engine', async () => {
  const captured = [];
  const baseFetch = async (input, init = {}) => {
    captured.push({ input: String(input), init });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await runStandardsShadowCollectorV2({
    runEvent: 'push',
    runId: 'namespace-test',
    fetchImpl: baseFetch,
    runBenchmark: async ({ fetchImpl }) => {
      await fetchImpl('https://relay.invalid/v1/check', {
        method: 'POST',
        body: JSON.stringify({
          fact: { subject: 'x', predicate: 'version.latest', source: 'https://example.com' },
          known_value: 'x', max_age_seconds: 60
        })
      });
      return rawResult();
    }
  });
  const body = JSON.parse(captured[0].init.body);
  assert.deepEqual(body.fact.qualifiers, STANDARDS_SHADOW_INTERNAL_QUALIFIER);
});

test('workflow filters parent lookup to schedule and starts a distinct v4 artifact lineage', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/standards-shadow-benchmark.yml', import.meta.url), 'utf8');
  assert.match(workflow, /--event schedule/);
  assert.match(workflow, /scripts\/standards-shadow-collector-v2\.mjs/);
  assert.match(workflow, /standards-shadow-natural-v4-\$candidate/);
  assert.match(workflow, /standards-shadow-natural-v4-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /standards-shadow-commissioning-v4-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /collection_epoch !== 'schedule-only-v4'/);
  assert.match(workflow, /if: github\.event_name == 'schedule'/);
  assert.match(workflow, /if: github\.event_name != 'schedule'/);
  assert.doesNotMatch(workflow, /standards-shadow-natural-v3-/);
  assert.doesNotMatch(workflow, /--status success --limit 1 --json databaseId/);
});
