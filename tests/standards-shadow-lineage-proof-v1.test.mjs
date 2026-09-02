import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStandardsShadowNaturalLineage } from '../scripts/verify-standards-shadow-lineage-v1.mjs';

const record = (n) => ({
  check_status: 'UNKNOWN', policy_reusable: false, reuse_would_match_validation: null,
  observe_after_baseline: false, baseline_ms: 10 + n, baseline_cost: 0,
  check_ms: 5 + n, observe_ms: 0, check_cost: 0, observe_cost: 0
});

function bundle({ runId, parentRunId = null, previousRecords = [], records = [record(1), record(2), record(3), record(4)], previousControls = null, validatorDelta = 3, attemptDelta = 0, confirmationDelta = 0, validatorSecret = 'SECRET_ETAG' } = {}) {
  const allRecords = [...previousRecords, ...records].slice(-1000);
  const prior = previousControls ?? { validator_available_calls: 0, conditional_attempts: 0, conditional_304_confirmations: 0 };
  const controlEvidence = {
    validator_available_calls: prior.validator_available_calls + validatorDelta,
    conditional_attempts: prior.conditional_attempts + attemptDelta,
    conditional_304_confirmations: prior.conditional_304_confirmations + confirmationDelta
  };
  const provenance = {
    provenance_schema_version: 2, collection_epoch: 'schedule-only-v2', sample_type: 'natural_workload',
    run_event: 'schedule', run_id: runId, parent_run_id: parentRunId, workload_id: 'standards-watch-daily-v1'
  };
  const controls = {
    local_cache: { available: false, measured: false },
    source_native_conditional: { available: controlEvidence.validator_available_calls > 0, measured: controlEvidence.conditional_attempts > 0 },
    provider_native_cache: { available: false, measured: false }
  };
  const benchmark = {
    schema_version: 2, workload_class: 'structured_source_reads', baseline_definition: 'best_existing_non_shared_path',
    controls, observe_off_critical_path: true, records: allRecords, ...provenance
  };
  const summary = {
    schema_version: 2, workload_class: 'structured_source_reads', first_party: true, external_adoption_evidence: false,
    source_count: 4, source_native_validator_available_count: validatorDelta,
    source_native_conditional_attempt_count: attemptDelta, source_native_conditional_304_count: confirmationDelta,
    observe_requests_sent: 0, current_run_benchmark_records: records.length,
    cumulative_benchmark_records: allRecords.length, preliminary_sample_floor_met: allRecords.length >= 100,
    evaluation_state: attemptDelta > 0 ? 'complete' : 'incomplete', evaluation_reason: attemptDelta > 0 ? null : 'source_native_conditional_unmeasured',
    ...provenance
  };
  const state = {
    schema_version: 1,
    entries: { mcp: { validator: { kind: 'etag', value: validatorSecret }, value_fingerprint: 'a'.repeat(64) } },
    raw_values_retained: false, sources_retained: false, ...provenance
  };
  const ledger = {
    schema_version: 1, workload_class: 'structured_source_reads', natural_schedule: 'daily', records: allRecords,
    control_evidence: controlEvidence, raw_values_retained: false, fact_identity_retained: false,
    sources_retained: false, timestamps_retained: false, ...provenance
  };
  return { benchmark, summary, evaluation: attemptDelta > 0 ? { decision: { evidence_ready: false } } : null, state, ledger };
}

function chain2() {
  const root = bundle({ runId: '1001', validatorDelta: 3 });
  const child = bundle({
    runId: '1002', parentRunId: '1001', previousRecords: root.ledger.records,
    previousControls: root.ledger.control_evidence, validatorDelta: 3, attemptDelta: 3, confirmationDelta: 1
  });
  return [root, child];
}

test('verifies a schedule-only root-to-head lineage and emits only safe proof metadata', () => {
  const out = verifyStandardsShadowNaturalLineage(chain2());
  assert.equal(out.verified, true);
  assert.equal(out.run_count, 2);
  assert.equal(out.root_run_id, '1001');
  assert.equal(out.head_run_id, '1002');
  assert.equal(out.observed_record_count, 8);
  assert.equal(out.retained_record_count, 8);
  assert.equal(out.final_control_evidence.conditional_attempts, 3);
  assert.match(out.lineage_proof_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(out.interpretation.schedule_only_lineage_verified_by_harness, true);
  assert.equal(out.interpretation.behavior_equivalence_verified_by_harness, false);
  assert.equal(out.interpretation.gate_b_admission_authorized, false);
  assert.equal(JSON.stringify(out).includes('SECRET_ETAG'), false);
});

test('rejects commissioning evidence even if other fields resemble natural evidence', () => {
  const [root] = chain2();
  root.benchmark.sample_type = 'commissioning';
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /natural_workload/);
});

test('rejects a push artifact relabeled as natural', () => {
  const [root] = chain2();
  for (const name of ['benchmark', 'summary', 'state', 'ledger']) root[name].run_event = 'push';
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /run_event=schedule/);
});

test('requires a root with null parent and exact parent continuity thereafter', () => {
  const [root] = chain2();
  root.benchmark.parent_run_id = '999'; root.summary.parent_run_id = '999'; root.state.parent_run_id = '999'; root.ledger.parent_run_id = '999';
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /root natural run/);
  const [root2, child2] = chain2();
  for (const name of ['benchmark', 'summary', 'state', 'ledger']) child2[name].parent_run_id = 'wrong';
  assert.throws(() => verifyStandardsShadowNaturalLineage([root2, child2]), /parent_run_id does not match/);
});

test('rejects benchmark and ledger record divergence', () => {
  const [root] = chain2();
  root.benchmark.records = root.benchmark.records.map((item, index) => index === 0 ? record(999) : item);
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /benchmark and ledger records differ/);
});

test('rejects record fields outside the sanitized contract', () => {
  const [root] = chain2();
  root.benchmark.records[0].source = 'https://example.invalid';
  root.ledger.records[0].source = 'https://example.invalid';
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /sanitized record contract/);
});

test('rejects control counters that do not equal prior plus current-run deltas', () => {
  const [root, child] = chain2();
  child.ledger.control_evidence.conditional_attempts += 1;
  assert.throws(() => verifyStandardsShadowNaturalLineage([root, child]), /control counter conditional_attempts/);
});

test('rejects broken cumulative record continuity', () => {
  const [root, child] = chain2();
  child.benchmark.records[0] = record(500);
  child.ledger.records[0] = record(500);
  assert.throws(() => verifyStandardsShadowNaturalLineage([root, child]), /does not continue prior records/);
});

test('rejects privacy regressions in retained state or ledger', () => {
  const [root] = chain2();
  root.state.raw_values_retained = true;
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /privacy flags/);
  const [root2] = chain2();
  root2.ledger.sources_retained = true;
  assert.throws(() => verifyStandardsShadowNaturalLineage([root2]), /privacy flags/);
});

test('rejects a summary sample-floor flag inconsistent with retained records', () => {
  const [root] = chain2();
  root.summary.preliminary_sample_floor_met = true;
  assert.throws(() => verifyStandardsShadowNaturalLineage([root]), /sample-floor flag mismatch/);
});

test('supports the 1000-record retention rollover without demanding the dropped prefix', () => {
  const previousRecords = Array.from({ length: 1000 }, (_, i) => record(i));
  const root = bundle({ runId: '2001', records: previousRecords, validatorDelta: 3 });
  root.summary.current_run_benchmark_records = 1000;
  const childNew = [record(2001), record(2002), record(2003), record(2004)];
  const child = bundle({
    runId: '2002', parentRunId: '2001', previousRecords: root.ledger.records, records: childNew,
    previousControls: root.ledger.control_evidence, validatorDelta: 3, attemptDelta: 3, confirmationDelta: 1
  });
  const out = verifyStandardsShadowNaturalLineage([root, child]);
  assert.equal(out.verified, true);
  assert.equal(out.retained_record_count, 1000);
  assert.equal(out.observed_record_count, 1004);
});

test('rejects duplicate run ids', () => {
  const [root, child] = chain2();
  for (const name of ['benchmark', 'summary', 'state', 'ledger']) child[name].run_id = '1001';
  child.benchmark.parent_run_id = '1001'; child.summary.parent_run_id = '1001'; child.state.parent_run_id = '1001'; child.ledger.parent_run_id = '1001';
  assert.throws(() => verifyStandardsShadowNaturalLineage([root, child]), /duplicate run_id/);
});

test('evaluation content and raw validator values are outside the lineage fingerprint scope', () => {
  const firstChain = chain2();
  firstChain[0].evaluation = { secret: 'PRIVATE_EVALUATION' };
  firstChain[0].state.entries.mcp.validator.value = 'SECRET_ONE';
  const first = verifyStandardsShadowNaturalLineage(firstChain);

  const secondChain = chain2();
  secondChain[0].evaluation = { secret: 'DIFFERENT_PRIVATE_EVALUATION' };
  secondChain[0].state.entries.mcp.validator.value = 'SECRET_TWO';
  const second = verifyStandardsShadowNaturalLineage(secondChain);

  assert.equal(first.lineage_proof_fingerprint, second.lineage_proof_fingerprint);
  assert.equal(first.interpretation.evaluation_in_lineage_scope, false);
  assert.equal(first.interpretation.raw_validator_values_in_lineage_fingerprint, false);
  assert.equal(JSON.stringify(first).includes('PRIVATE_EVALUATION'), false);
  assert.equal(JSON.stringify(first).includes('SECRET_ONE'), false);
});

test('tampering with otherwise coherent evidence changes the deterministic lineage fingerprint', () => {
  const original = chain2();
  const first = verifyStandardsShadowNaturalLineage(original).lineage_proof_fingerprint;
  const changed = chain2();
  changed[1].benchmark.records[7].check_ms += 1;
  changed[1].ledger.records[7].check_ms += 1;
  const second = verifyStandardsShadowNaturalLineage(changed).lineage_proof_fingerprint;
  assert.notEqual(first, second);
});
