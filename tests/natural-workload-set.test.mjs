import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNaturalWorkloadSet } from '../scripts/evaluate-natural-workload-set.mjs';

const controls = {
  local_cache: { available: true, measured: true },
  source_native_conditional: { available: false, measured: false },
  provider_native_cache: { available: true, measured: true },
};

function workload(id, workloadClass, record) {
  return {
    schema_version: 2,
    workload_id: id,
    workload_class: workloadClass,
    sample_type: 'natural_workload',
    baseline_definition: 'best_existing_non_shared_path',
    observe_off_critical_path: true,
    controls,
    records: Array.from({ length: 100 }, () => ({ ...record })),
  };
}

const positiveRecord = {
  check_status: 'SAME_OBSERVED',
  policy_reusable: true,
  reuse_would_match_validation: true,
  observe_after_baseline: false,
  baseline_ms: 1000,
  baseline_cost: 2,
  check_ms: 50,
  observe_ms: 0,
  check_cost: 0.05,
  observe_cost: 0,
};
const negativeRecord = {
  check_status: 'UNKNOWN',
  policy_reusable: false,
  reuse_would_match_validation: null,
  observe_after_baseline: false,
  baseline_ms: 100,
  baseline_cost: 0,
  check_ms: 50,
  observe_ms: 0,
  check_cost: 0.01,
  observe_cost: 0,
};

function completeSet({ unsafe = false, allNegative = false } = {}) {
  return [
    workload('structured', 'structured_source_reads', allNegative ? negativeRecord : positiveRecord),
    workload('browser', 'browser_extraction_reads', negativeRecord),
    workload('fleet', 'fleet_tool_validations', unsafe ? { ...positiveRecord, reuse_would_match_validation: false } : negativeRecord),
  ];
}

test('three-class workload gate keeps negative evidence and never enables reuse', () => {
  const report = evaluateNaturalWorkloadSet(completeSet());
  assert.equal(report.schema_version, 2);
  assert.deepEqual(report.required_workload_classes, [
    'structured_source_reads',
    'browser_extraction_reads',
    'fleet_tool_validations',
  ]);
  assert.equal(report.evidence_complete, true);
  assert.equal(report.positive_workloads, 1);
  assert.equal(report.shared_check_incremental_value_candidate, true);
  assert.equal(report.automatic_reuse_enabled_by_gate, false);

  const allNegative = evaluateNaturalWorkloadSet(completeSet({ allNegative: true }));
  assert.equal(allNegative.all_three_completed_negative, true);
  assert.equal(allNegative.shared_check_incremental_value_candidate, false);
});

test('unsafe hypothetical reuse blocks incremental-value admission', () => {
  const report = evaluateNaturalWorkloadSet(completeSet({ unsafe: true }));
  assert.equal(report.unsafe_workloads, 1);
  assert.equal(report.shared_check_incremental_value_candidate, false);
});

test('gate rejects duplicate workload identities', () => {
  const inputs = completeSet();
  inputs[1].workload_id = inputs[0].workload_id;
  assert.throws(() => evaluateNaturalWorkloadSet(inputs), /duplicate natural workload_id/);
});

test('gate rejects duplicate or unknown workload classes', () => {
  const duplicate = completeSet();
  duplicate[1].workload_class = duplicate[0].workload_class;
  assert.throws(() => evaluateNaturalWorkloadSet(duplicate), /duplicate natural workload_class/);

  const unknown = completeSet();
  unknown[2].workload_class = 'other';
  assert.throws(() => evaluateNaturalWorkloadSet(unknown), /workload_class must be one of/);
});
