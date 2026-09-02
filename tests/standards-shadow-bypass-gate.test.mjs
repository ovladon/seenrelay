import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStandardsShadowBypassGate } from '../scripts/replay-standards-shadow-bypass-gate.mjs';

const FP_A = `sha256:${'a'.repeat(64)}`;
const FP_B = `sha256:${'b'.repeat(64)}`;

function input(records) {
  return {
    schema_version: 2,
    workload_id: 'standards-watch-daily-v1',
    sample_type: 'natural_workload',
    baseline_definition: 'best_existing_non_shared_path',
    records
  };
}
function record(extra = {}) {
  return {
    check_status: 'UNKNOWN', policy_reusable: false, reuse_would_match_validation: null,
    observe_after_baseline: false, baseline_ms: 100, baseline_cost: 0,
    check_ms: 50, observe_ms: 0, check_cost: 0, observe_cost: 0,
    ...extra
  };
}
const opts = { implementationEvidenceFingerprint: FP_A, benchmarkEvidenceFingerprint: FP_B, behaviorProofFingerprint: FP_A, sequentialityProofFingerprint: FP_B };

test('passes Gate A and reports measured Gate B headroom for structurally bypassable shadow CHECK records', () => {
  const out = evaluateStandardsShadowBypassGate(input([record(), record({baseline_ms:200,check_ms:100})]), opts);
  assert.equal(out.gate_a.pass, true);
  assert.equal(out.gate_b.positive_headroom, true);
  assert.equal(out.gate_b.workload_evidence_ready, false);
  assert.equal(out.gate_b.global_gate_pass, false);
  assert.equal(out.gate_b.preliminary_sample_floor, 100);
  assert.equal(out.gate_b.preliminary_sample_floor_met, false);
  assert.equal(out.gate_b.baseline_total_ms, 300);
  assert.equal(out.gate_b.current_shadow_path_total_ms, 450);
  assert.equal(out.gate_b.measured_saved_ms, 150);
  assert.ok(Math.abs(out.gate_b.measured_improvement_percent - 33.33333333333333) < 1e-9);
  assert.equal(out.interpretation.seenrelay_reuse_value_proven, false);
  assert.equal(out.interpretation.behavior_equivalence_inferred_by_harness, false);
  assert.equal(out.gate_a.automatic_behavior_equivalence_proof, false);
  assert.equal(out.gate_b.measurement_scope, 'first_party_shadow_instrumentation_path_only');
  assert.equal(out.gate_b.headroom_band, 'active_prototype_candidate_band');
  assert.equal(out.gate_b.commercial_net_savings_evaluable, false);
  assert.equal(out.gate_b.commercially_compelling_proven, false);
  assert.equal(out.interpretation.generalization_authorized, false);
  assert.equal(out.interpretation.optimizer_authorized, false);
  assert.equal(out.trajectories[0].selected_substitution.alternative_id, 'bypass-shadow-check');
});

test('fails closed when any record was reusable or otherwise could have influenced the path', () => {
  const out = evaluateStandardsShadowBypassGate(input([record(), record({check_status:'SAME_OBSERVED', policy_reusable:true, reuse_would_match_validation:true})]), opts);
  assert.equal(out.gate_a.pass, false);
  assert.equal(out.gate_b.positive_headroom, false);
  assert.equal(out.gate_b.measured_saved_ms, null);
  assert.equal(out.interpretation.shadow_check_bypass_supported_for_this_workload, false);
});

test('applies the pre-declared PRIVATE255 headroom bands rather than treating any positive headroom as admission', () => {
  const out = evaluateStandardsShadowBypassGate(input([record({check_ms:0.001})]), opts);
  assert.equal(out.gate_a.pass, true);
  assert.equal(out.gate_b.positive_headroom, true);
  assert.equal(out.gate_b.above_marginal_floor, false);
  assert.equal(out.gate_b.headroom_band, 'marginal_below_private255_floor');
  assert.equal(out.gate_b.private255_marginal_headroom_floor_percent, 20);
  assert.equal(out.gate_b.private255_active_prototype_headroom_percent, 30);
  assert.equal(out.gate_b.private255_commercial_net_savings_reference_percent, 50);
});

test('100 records plus at least 30% headroom qualify only this workload, not the cross-workload Gate B', () => {
  const out = evaluateStandardsShadowBypassGate(input(Array.from({ length: 100 }, () => record())), opts);
  assert.equal(out.gate_a.pass, true);
  assert.equal(out.gate_b.positive_headroom, true);
  assert.equal(out.gate_b.preliminary_sample_floor_met, true);
  assert.equal(out.gate_b.workload_evidence_ready, true);
  assert.equal(out.gate_b.active_prototype_candidate_for_this_workload, true);
  assert.equal(out.gate_b.global_gate_pass, false);
  assert.equal(out.gate_b.cross_workload_confirmation_required, true);
  assert.equal(out.interpretation.attention_microkernel_prototype_authorized, false);
});

test('a mature sample below 20% emits the PRIVATE255 marginal kill signal', () => {
  const out = evaluateStandardsShadowBypassGate(input(Array.from({ length: 100 }, () => record({ baseline_ms: 100, check_ms: 10 }))), opts);
  assert.equal(out.gate_b.preliminary_sample_floor_met, true);
  assert.equal(out.gate_b.measured_improvement_percent < 20, true);
  assert.equal(out.gate_b.marginal_kill_signal_for_this_workload, true);
  assert.equal(out.gate_b.workload_evidence_ready, false);
  assert.equal(out.interpretation.next_step, 'DO_NOT_BROADEN_FROM_THIS_WORKLOAD');
});

test('gross shadow-path headroom above 50% never proves the PRIVATE255 commercial net-savings criterion', () => {
  const out = evaluateStandardsShadowBypassGate(input(Array.from({ length: 100 }, () => record({ baseline_ms: 100, check_ms: 120 }))), opts);
  assert.equal(out.gate_b.measured_improvement_percent > 50, true);
  assert.equal(out.gate_b.commercial_net_savings_evaluable, false);
  assert.equal(out.gate_b.commercially_compelling_proven, false);
  assert.equal(out.interpretation.commercially_compelling_proven, false);
});

test('requires evidence fingerprints for benchmark and implementation', () => {
  assert.throws(() => evaluateStandardsShadowBypassGate(input([record()]), {}), /implementationEvidenceFingerprint/);
});
