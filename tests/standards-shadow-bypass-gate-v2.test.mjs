import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStandardsShadowBypassGateV2 } from '../scripts/replay-standards-shadow-bypass-gate-v2.mjs';

const FP_A = `sha256:${'a'.repeat(64)}`;
const FP_B = `sha256:${'b'.repeat(64)}`;
const FP_C = `sha256:${'c'.repeat(64)}`;

function input(records, extra = {}) {
  return {
    schema_version: 2,
    workload_id: 'standards-watch-daily-v1',
    workload_class: 'structured_source_reads',
    sample_type: 'natural_workload',
    baseline_definition: 'best_existing_non_shared_path',
    controls: {
      local_cache: { available: false, measured: false },
      source_native_conditional: { available: true, measured: true },
      provider_native_cache: { available: false, measured: false }
    },
    provenance_schema_version: 2,
    collection_epoch: 'schedule-only-v2',
    run_event: 'schedule',
    run_id: '33620000000',
    parent_run_id: null,
    records,
    ...extra
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
const opts = {
  implementationEvidenceFingerprint: FP_A,
  benchmarkEvidenceFingerprint: FP_B,
  behaviorProofFingerprint: FP_A,
  sequentialityProofFingerprint: FP_B,
  lineageProofFingerprint: FP_C
};

test('reports conditional headroom but never automatic Gate B readiness while external proofs are unverified', () => {
  const out = evaluateStandardsShadowBypassGateV2(input([record(), record({ baseline_ms: 200, check_ms: 100 })]), opts);
  assert.equal(out.gate_a.pass, true);
  assert.equal(out.gate_b.positive_conditional_headroom, true);
  assert.equal(out.gate_b.workload_evidence_ready, false);
  assert.equal(out.gate_b.global_gate_pass, false);
  assert.equal(out.gate_b.baseline_total_ms, 300);
  assert.equal(out.gate_b.current_shadow_path_total_ms, 450);
  assert.equal(out.gate_b.conditional_saved_ms, 150);
  assert.ok(Math.abs(out.gate_b.conditional_improvement_percent - 33.33333333333333) < 1e-9);
  assert.equal(out.evidence.behavior_proof_verified_by_harness, false);
  assert.equal(out.evidence.sequentiality_proof_verified_by_harness, false);
  assert.equal(out.evidence.lineage_proof_verified_by_harness, false);
  assert.match(out.evidence.benchmark_canonical_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(out.interpretation.shadow_check_bypass_supported_for_this_workload, false);
  assert.equal(out.interpretation.conditional_shadow_check_bypass_candidate, true);
});

test('100 natural records at >=30% become only a conditional candidate, never admitted evidence', () => {
  const out = evaluateStandardsShadowBypassGateV2(input(Array.from({ length: 100 }, () => record())), opts);
  assert.equal(out.gate_b.preliminary_sample_floor_met, true);
  assert.equal(out.gate_b.conditional_active_prototype_candidate_for_this_workload, true);
  assert.equal(out.gate_b.active_prototype_candidate_for_this_workload, false);
  assert.equal(out.gate_b.workload_evidence_ready, false);
  assert.ok(out.gate_b.admission_blockers.includes('behavior_proof_not_verified_by_harness'));
  assert.ok(out.gate_b.admission_blockers.includes('lineage_proof_not_verified_by_harness'));
  assert.equal(out.interpretation.next_step, 'VERIFY_EXTERNAL_PROOFS_AND_TEST_A_SECOND_USEFUL_WORKLOAD');
});

test('pre-v2 natural evidence is rejected before accounting', () => {
  const candidate = input([record()]);
  delete candidate.provenance_schema_version;
  assert.throws(() => evaluateStandardsShadowBypassGateV2(candidate, opts), /provenance_schema_version=2/);
});

test('a push artifact cannot be relabeled natural for Gate B', () => {
  assert.throws(() => evaluateStandardsShadowBypassGateV2(input([record()], { run_event: 'push' }), opts), /run_event=schedule/);
});

test('natural evidence requires a lineage proof fingerprint even for a root run', () => {
  const withoutLineage = { ...opts };
  delete withoutLineage.lineageProofFingerprint;
  assert.throws(() => evaluateStandardsShadowBypassGateV2(input([record()]), withoutLineage), /lineageProofFingerprint/);
});

test('any available but unmeasured native control blocks Gate B evaluation', () => {
  const candidate = input([record()]);
  candidate.controls.source_native_conditional.measured = false;
  assert.throws(() => evaluateStandardsShadowBypassGateV2(candidate, opts), /must be measured/);
});

test('records with fields outside the sanitized benchmark contract are rejected', () => {
  assert.throws(() => evaluateStandardsShadowBypassGateV2(input([record({ source: 'https://example.invalid' })]), opts), /outside the sanitized benchmark contract/);
});

test('milliseconds-only Gate B refuses nonzero monetary cost fields instead of silently ignoring them', () => {
  assert.throws(() => evaluateStandardsShadowBypassGateV2(input([record({ check_cost: 0.01 })]), opts), /monetary cost fields must be zero/);
});

test('fails closed when any record could have influenced the accepted path', () => {
  const out = evaluateStandardsShadowBypassGateV2(input([
    record(),
    record({ check_status: 'SAME_OBSERVED', policy_reusable: true, reuse_would_match_validation: true })
  ]), opts);
  assert.equal(out.gate_a.pass, false);
  assert.equal(out.gate_b.positive_conditional_headroom, false);
  assert.equal(out.gate_b.conditional_saved_ms, null);
  assert.equal(out.interpretation.conditional_shadow_check_bypass_candidate, false);
});

test('applies PRIVATE255 headroom bands without treating small positive headroom as admission', () => {
  const out = evaluateStandardsShadowBypassGateV2(input([record({ check_ms: 0.001 })]), opts);
  assert.equal(out.gate_b.positive_conditional_headroom, true);
  assert.equal(out.gate_b.above_marginal_floor, false);
  assert.equal(out.gate_b.headroom_band, 'marginal_below_private255_floor');
  assert.equal(out.gate_b.private255_marginal_headroom_floor_percent, 20);
});

test('mature natural sample below 20% emits the marginal kill signal', () => {
  const out = evaluateStandardsShadowBypassGateV2(input(Array.from({ length: 100 }, () => record({ baseline_ms: 100, check_ms: 10 }))), opts);
  assert.equal(out.gate_b.preliminary_sample_floor_met, true);
  assert.equal(out.gate_b.conditional_improvement_percent < 20, true);
  assert.equal(out.gate_b.marginal_kill_signal_for_this_workload, true);
  assert.equal(out.interpretation.next_step, 'DO_NOT_BROADEN_FROM_THIS_WORKLOAD');
});

test('gross headroom above 50% never proves commercial net savings', () => {
  const out = evaluateStandardsShadowBypassGateV2(input(Array.from({ length: 100 }, () => record({ baseline_ms: 100, check_ms: 120 }))), opts);
  assert.equal(out.gate_b.conditional_improvement_percent > 50, true);
  assert.equal(out.gate_b.commercial_net_savings_evaluable, false);
  assert.equal(out.gate_b.commercially_compelling_proven, false);
  assert.equal(out.interpretation.commercially_compelling_proven, false);
});

test('replayed input is diagnostic-only even at mature sample size and does not require lineage proof', () => {
  const replayOpts = { ...opts };
  delete replayOpts.lineageProofFingerprint;
  const out = evaluateStandardsShadowBypassGateV2(input(Array.from({ length: 100 }, () => record()), { sample_type: 'replayed' }), replayOpts);
  assert.equal(out.provenance.gate_b_admissible_source, false);
  assert.equal(out.gate_b.conditional_active_prototype_candidate_for_this_workload, false);
  assert.equal(out.gate_b.workload_evidence_ready, false);
  assert.ok(out.gate_b.admission_blockers.includes('replayed_input_is_diagnostic_only'));
  assert.equal(out.interpretation.next_step, 'REPLAY_DIAGNOSTIC_ONLY_COLLECT_SCHEDULED_NATURAL_EVIDENCE');
});

test('requires explicit evidence fingerprints', () => {
  assert.throws(() => evaluateStandardsShadowBypassGateV2(input([record()]), {}), /implementationEvidenceFingerprint/);
});
