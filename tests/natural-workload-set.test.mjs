import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNaturalWorkloadSet } from '../scripts/evaluate-natural-workload-set.mjs';
const controls = { local_cache: { available: true, measured: true }, source_native_conditional: { available: false, measured: false }, provider_native_cache: { available: true, measured: true } };
function workload(id, record) { return { schema_version: 2, workload_id: id, sample_type: 'natural_workload', baseline_definition: 'best_existing_non_shared_path', observe_off_critical_path: true, controls, records: Array.from({ length: 100 }, () => ({ ...record })) }; }
const positive = workload('positive', { check_status: 'SAME_OBSERVED', policy_reusable: true, reuse_would_match_validation: true, observe_after_baseline: false, baseline_ms: 1000, baseline_cost: 2, check_ms: 50, observe_ms: 0, check_cost: 0.05, observe_cost: 0 });
const negative = workload('negative', { check_status: 'UNKNOWN', policy_reusable: false, reuse_would_match_validation: null, observe_after_baseline: false, baseline_ms: 100, baseline_cost: 0, check_ms: 50, observe_ms: 0, check_cost: 0.01, observe_cost: 0 });
test('three-workload gate keeps negative evidence and never enables reuse', () => {
  const report = evaluateNaturalWorkloadSet([positive, negative, negative]);
  assert.equal(report.evidence_complete, true); assert.equal(report.positive_workloads, 1); assert.equal(report.shared_check_incremental_value_candidate, true); assert.equal(report.automatic_reuse_enabled_by_gate, false);
  const allNegative = evaluateNaturalWorkloadSet([negative, negative, negative]);
  assert.equal(allNegative.all_three_completed_negative, true); assert.equal(allNegative.shared_check_incremental_value_candidate, false);
});
test('unsafe hypothetical reuse blocks incremental-value admission', () => {
  const unsafe = workload('unsafe', { ...positive.records[0], reuse_would_match_validation: false });
  const report = evaluateNaturalWorkloadSet([positive, positive, unsafe]);
  assert.equal(report.unsafe_workloads, 1); assert.equal(report.shared_check_incremental_value_candidate, false);
});
