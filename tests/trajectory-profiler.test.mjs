import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';

const FP_A = `sha256:${'a'.repeat(64)}`;
const FP_B = `sha256:${'b'.repeat(64)}`;
const FP_C = `sha256:${'c'.repeat(64)}`;

function completed(profiler, id = 't1') {
  return profiler.finishTrajectory({
    trajectoryId: id,
    outcome: { completed: true, correct: true, safetyAcceptable: true },
    outcomeEvidenceFingerprint: FP_C,
    endedAtMs: 20
  });
}

test('profiler is local measurement-only and does not infer equivalence', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'usd-v1', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'tool-1', kind: 'tool', coordinateFingerprint: FP_A, work: { costUnits: 10, toolCalls: 1, wallMs: 5 } });
  const report = completed(profiler);
  assert.equal(report.hosted_operations_added, 0);
  assert.equal(report.seenrelay_network_calls, 0);
  assert.equal(report.automatic_suppression_authorized, false);
  assert.equal(report.raw_prompts_retained, false);
  assert.equal(report.raw_results_retained, false);
  assert.equal(report.interpretation.equivalence_inferred_by_profiler, false);
  assert.equal(report.accounting.headroom.oracle_theoretical.headroom_percent, 0);
});

test('counterfactual hierarchy separates retrospective, predictable, and capturable headroom', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'natural_workload', costUnitPolicyId: 'normalized-test-v1', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'model', kind: 'model', work: { costUnits: 60, inputTokens: 1000, outputTokens: 100 } });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'tool', kind: 'tool', work: { costUnits: 40, toolCalls: 1 } });
  profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'model', alternativeId: 'retrospective-local-state', tier: 'retrospective_only', sameAcceptedOutcome: true, proofKind: 'replay_same_evaluator_outcome', proofFingerprint: FP_A, replacementWork: { costUnits: 10 } });
  profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'tool', alternativeId: 'source-validator', tier: 'safely_predictable', sameAcceptedOutcome: true, proofKind: 'source_not_modified', proofFingerprint: FP_B, predictionPolicyFingerprint: FP_A, replacementWork: { costUnits: 5 } });
  profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'tool', alternativeId: 'capturable-native-cache', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'provider_cache_equivalence', proofFingerprint: FP_C, predictionPolicyFingerprint: FP_A, captureMechanismFingerprint: FP_B, replacementWork: { costUnits: 8 }, decisionOverheadCostUnits: 2 });
  const report = completed(profiler);
  assert.equal(report.accounting.actual_cost_units, 100);
  assert.equal(report.accounting.headroom.oracle_theoretical.minimum_cost_units, 15);
  assert.equal(report.accounting.headroom.oracle_theoretical.headroom_percent, 85);
  assert.equal(report.accounting.headroom.safely_predictable.minimum_cost_units, 65);
  assert.equal(report.accounting.headroom.safely_predictable.headroom_percent, 35);
  assert.equal(report.accounting.headroom.currently_capturable.minimum_cost_units, 70);
  assert.equal(report.accounting.headroom.currently_capturable.headroom_percent, 30);
});

test('headroom is not admissible when task outcome is not accepted', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'usd-v1', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 10 } });
  profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'cheap', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'replay', proofFingerprint: FP_A, predictionPolicyFingerprint: FP_B, captureMechanismFingerprint: FP_C, replacementWork: { costUnits: 1 } });
  const report = profiler.finishTrajectory({ trajectoryId: 't1', outcome: { completed: true, correct: false, safetyAcceptable: true }, endedAtMs: 2 });
  assert.equal(report.interpretation.outcome_admissible, false);
  assert.equal(report.accounting.headroom.oracle_theoretical.headroom_percent, null);
  assert.equal(report.accounting.headroom.currently_capturable.admissible_for_optimization_research, false);
});

test('scalar headroom refuses arbitrary unit mixing without an explicit cost policy', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'model', work: { inputTokens: 100, wallMs: 20 } });
  const report = completed(profiler);
  assert.equal(report.accounting.scalar_headroom_available, false);
  assert.equal(report.accounting.scalar_headroom_unavailable_reason, 'missing_cost_unit_policy');
  assert.equal(report.accounting.actual_cost_units, null);
});

test('measureOperation preserves successful result and original thrown error even if accounting input is invalid', async () => {
  let t = 0;
  const profiler = createShadowTrajectoryProfiler({ now: () => (t += 5) });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'test', startedAtMs: 0 });
  const value = { secret: 'not-retained' };
  const result = await profiler.measureOperation({ trajectoryId: 't1', operationId: 'ok', kind: 'tool', workFromResult: () => ({ unsupported: 1 }) }, async () => value);
  assert.equal(result, value);
  const expected = new Error('authoritative failure');
  await assert.rejects(
    profiler.measureOperation({ trajectoryId: 't1', operationId: 'bad', kind: 'tool' }, async () => { throw expected; }),
    error => error === expected
  );
  const report = profiler.getReport('t1');
  assert.ok(report.accounting.measurement_failures >= 1);
  assert.equal(JSON.stringify(report).includes('not-retained'), false);
});

test('alternatives require explicit same-outcome proof and SHA-256 evidence fingerprint', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'synthetic', costUnitPolicyId: 'test', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  assert.throws(() => profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'bad', tier: 'capturable_now', sameAcceptedOutcome: false, proofKind: 'guess', proofFingerprint: FP_A, predictionPolicyFingerprint: FP_B, captureMechanismFingerprint: FP_C, replacementWork: { costUnits: 0 } }), /sameAcceptedOutcome/);
  assert.throws(() => profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'bad2', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'guess', proofFingerprint: 'raw-private-proof', predictionPolicyFingerprint: FP_B, captureMechanismFingerprint: FP_C, replacementWork: { costUnits: 0 } }), /sha256/);
});

test('predictable and capturable tiers require prospective-policy evidence rather than caller labels alone', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'test', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  assert.throws(() => profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'predictable-without-policy', tier: 'safely_predictable', sameAcceptedOutcome: true, proofKind: 'replay', proofFingerprint: FP_A, replacementWork: { costUnits: 1 } }), /predictionPolicyFingerprint/);
  assert.throws(() => profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'capturable-without-mechanism', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'replay', proofFingerprint: FP_A, predictionPolicyFingerprint: FP_B, replacementWork: { costUnits: 1 } }), /captureMechanismFingerprint/);
});

test('accepted outcome flags without evidence fingerprint do not authorize headroom', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'test', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  const report = profiler.finishTrajectory({ trajectoryId: 't1', outcome: { completed: true, correct: true, safetyAcceptable: true }, endedAtMs: 2 });
  assert.equal(report.interpretation.outcome_admissible, false);
  assert.equal(report.accounting.headroom.oracle_theoretical.headroom_percent, null);
});

test('single-operation scope prevents double counting across overlapping trajectory skips', () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'test', startedAtMs: 0 });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'a', kind: 'model', work: { costUnits: 10 } });
  profiler.recordOperation({ trajectoryId: 't1', operationId: 'b', parentOperationId: 'a', kind: 'tool', work: { costUnits: 10 } });
  profiler.recordProvenAlternative({ trajectoryId: 't1', operationId: 'a', alternativeId: 'a-cheap', tier: 'retrospective_only', sameAcceptedOutcome: true, proofKind: 'single-op-replay', proofFingerprint: FP_A, replacementWork: { costUnits: 0 } });
  const report = completed(profiler);
  assert.equal(report.accounting.headroom.oracle_theoretical.minimum_cost_units, 10);
  assert.equal(report.accounting.counterfactual_scope, 'single-operation-proven-substitutions-only');
  assert.equal(report.accounting['overlapping_multi-operation_skips_supported'], false);
});
