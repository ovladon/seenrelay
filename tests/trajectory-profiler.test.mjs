import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';

const FP_A = `sha256:${'a'.repeat(64)}`;
const FP_B = `sha256:${'b'.repeat(64)}`;
const FP_C = `sha256:${'c'.repeat(64)}`;

function start(profiler, extra = {}) {
  return profiler.startTrajectory({
    trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0,
    costUnitPolicyId: 'test-v1', costUnitPolicyFingerprint: FP_A,
    baselineEvidenceFingerprint: FP_B, ...extra
  });
}
function finish(profiler, extra = {}) {
  return profiler.finishTrajectory({
    trajectoryId: 't1',
    outcome: { completed: true, correct: true, safetyAcceptable: true },
    outcomeEvidenceFingerprint: FP_C, endedAtMs: 20, ...extra
  });
}

test('profiler is local measurement-only and does not infer equivalence', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'tool-1', kind: 'tool', work: { costUnits: 10, toolCalls: 1 } });
  const r = finish(p);
  assert.equal(r.hosted_operations_added, 0);
  assert.equal(r.seenrelay_network_calls, 0);
  assert.equal(r.automatic_suppression_authorized, false);
  assert.equal(r.raw_prompts_retained, false);
  assert.equal(r.raw_results_retained, false);
  assert.equal(r.interpretation.equivalence_inferred_by_profiler, false);
  assert.equal(r.accounting.headroom.oracle_theoretical.headroom_percent, 0);
});

test('counterfactual hierarchy separates retrospective, predictable, and capturable headroom', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  start(p, { sampleType: 'natural_workload' });
  p.recordOperation({ trajectoryId: 't1', operationId: 'model', kind: 'model', work: { costUnits: 60, inputTokens: 1000, outputTokens: 100 } });
  p.recordOperation({ trajectoryId: 't1', operationId: 'tool', kind: 'tool', work: { costUnits: 40, toolCalls: 1 } });
  p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'model', alternativeId: 'retrospective-local-state', tier: 'retrospective_only', sameAcceptedOutcome: true, proofKind: 'replay_same_evaluator_outcome', proofFingerprint: FP_A, replacementWork: { costUnits: 10 } });
  p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'tool', alternativeId: 'source-validator', tier: 'safely_predictable', sameAcceptedOutcome: true, proofKind: 'source_not_modified', proofFingerprint: FP_B, predictionPolicyFingerprint: FP_A, replacementWork: { costUnits: 5 } });
  p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'tool', alternativeId: 'native-cache', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'provider_cache_equivalence', proofFingerprint: FP_C, predictionPolicyFingerprint: FP_A, captureMechanismFingerprint: FP_B, replacementWork: { costUnits: 8 }, decisionOverheadCostUnits: 2 });
  const r = finish(p);
  assert.equal(r.accounting.actual_cost_units, 100);
  assert.equal(r.accounting.headroom.oracle_theoretical.headroom_percent, 50);
  assert.equal(r.accounting.headroom.safely_predictable.headroom_percent, 35);
  assert.equal(r.accounting.headroom.currently_capturable.headroom_percent, 30);
});

test('headroom is not admissible when the final outcome is not accepted', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 10 } });
  p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'cheap', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'replay', proofFingerprint: FP_A, predictionPolicyFingerprint: FP_B, captureMechanismFingerprint: FP_C, replacementWork: { costUnits: 1 } });
  const r = finish(p, { outcome: { completed: true, correct: false, safetyAcceptable: true } });
  assert.equal(r.interpretation.outcome_admissible, false);
  assert.equal(r.accounting.headroom.oracle_theoretical.headroom_percent, null);
});

test('scalar headroom refuses arbitrary unit mixing without a cost policy', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  p.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0 });
  p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'model', work: { inputTokens: 100 } });
  const r = finish(p);
  assert.equal(r.accounting.scalar_headroom_available, false);
  assert.equal(r.accounting.scalar_headroom_unavailable_reason, 'missing_cost_unit_policy');
});

test('measureOperation preserves successful result and original errors when accounting fails', async () => {
  let t = 0; const p = createShadowTrajectoryProfiler({ now: () => (t += 5) }); start(p);
  const value = { secret: 'not-retained' };
  assert.equal(await p.measureOperation({ trajectoryId: 't1', operationId: 'ok', kind: 'tool', workFromResult: () => ({ unsupported: 1 }) }, async () => value), value);
  const expected = new Error('authoritative failure');
  await assert.rejects(p.measureOperation({ trajectoryId: 't1', operationId: 'bad', kind: 'tool' }, async () => { throw expected; }), error => error === expected);
  const r = p.getReport('t1');
  assert.ok(r.accounting.measurement_failures >= 1);
  assert.equal(JSON.stringify(r).includes('not-retained'), false);
});

test('alternatives require explicit same-outcome proof and SHA-256 evidence', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  assert.throws(() => p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'bad', tier: 'capturable_now', sameAcceptedOutcome: false, proofKind: 'guess', proofFingerprint: FP_A, predictionPolicyFingerprint: FP_B, captureMechanismFingerprint: FP_C, replacementWork: { costUnits: 0 } }), /sameAcceptedOutcome/);
  assert.throws(() => p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'bad2', tier: 'retrospective_only', sameAcceptedOutcome: true, proofKind: 'guess', proofFingerprint: 'raw-proof', replacementWork: { costUnits: 0 } }), /sha256/);
});

test('predictable and capturable tiers require prospective mechanism evidence', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  assert.throws(() => p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'p', tier: 'safely_predictable', sameAcceptedOutcome: true, proofKind: 'replay', proofFingerprint: FP_A, replacementWork: { costUnits: 1 } }), /predictionPolicyFingerprint/);
  assert.throws(() => p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'x', alternativeId: 'c', tier: 'capturable_now', sameAcceptedOutcome: true, proofKind: 'replay', proofFingerprint: FP_A, predictionPolicyFingerprint: FP_B, replacementWork: { costUnits: 1 } }), /captureMechanismFingerprint/);
});

test('accepted flags without outcome evidence do not authorize headroom', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  const r = p.finishTrajectory({ trajectoryId: 't1', outcome: { completed: true, correct: true, safetyAcceptable: true }, endedAtMs: 2 });
  assert.equal(r.interpretation.outcome_admissible, false);
  assert.equal(r.accounting.headroom.oracle_theoretical.headroom_percent, null);
});

test('single-operation scope prevents double counting nested skips', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'a', kind: 'model', work: { costUnits: 10 } });
  p.recordOperation({ trajectoryId: 't1', operationId: 'b', parentOperationId: 'a', kind: 'tool', work: { costUnits: 10 } });
  p.recordProvenAlternative({ trajectoryId: 't1', operationId: 'a', alternativeId: 'a-zero', tier: 'retrospective_only', sameAcceptedOutcome: true, proofKind: 'isolated-replay', proofFingerprint: FP_A, replacementWork: { costUnits: 0 } });
  const r = finish(p);
  assert.equal(r.accounting.headroom.oracle_theoretical.minimum_cost_units, 10);
  assert.equal(r.accounting.counterfactual_scope, 'one-proven-substitution-per-trajectory');
  assert.equal(r.accounting.compositional_counterfactuals_supported, false);
  assert.equal(r.accounting['overlapping_multi-operation_skips_supported'], false);
});

test('retained metadata identifiers reject free-form prose', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  assert.throws(() => p.startTrajectory({ trajectoryId: 'this is a raw prompt', sampleType: 'replayed' }), /opaque identifier/);
  start(p);
  assert.throws(() => p.recordOperation({ trajectoryId: 't1', operationId: 'contains private prose', kind: 'tool', work: { costUnits: 1 } }), /opaque identifier/);
});

test('scalar headroom requires reproducible policy and best-native baseline evidence', () => {
  const p1 = createShadowTrajectoryProfiler({ now: () => 1 });
  p1.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'test', baselineEvidenceFingerprint: FP_B, startedAtMs: 0 });
  p1.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  assert.equal(finish(p1).accounting.scalar_headroom_unavailable_reason, 'missing_cost_unit_policy_fingerprint');
  const p2 = createShadowTrajectoryProfiler({ now: () => 1 });
  p2.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', costUnitPolicyId: 'test', costUnitPolicyFingerprint: FP_A, startedAtMs: 0 });
  p2.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 5 } });
  assert.equal(finish(p2).accounting.scalar_headroom_unavailable_reason, 'missing_best_native_baseline_evidence');
});

test('invalid finish timestamps do not partially close a trajectory', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p, { startedAtMs: 10 });
  assert.throws(() => finish(p, { endedAtMs: 5 }), /endedAtMs/);
  p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { costUnits: 1 } });
  assert.equal(finish(p, { endedAtMs: 20 }).trajectory.complete, true);
});

test('individually proven substitutions are never composed without joint evidence', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 }); start(p);
  p.recordOperation({ trajectoryId: 't1', operationId: 'a', kind: 'model', work: { costUnits: 50 } });
  p.recordOperation({ trajectoryId: 't1', operationId: 'b', kind: 'tool', work: { costUnits: 50 } });
  for (const [operationId, fp] of [['a', FP_A], ['b', FP_B]]) p.recordProvenAlternative({ trajectoryId: 't1', operationId, alternativeId: `${operationId}-zero`, tier: 'retrospective_only', sameAcceptedOutcome: true, proofKind: 'isolated-replay', proofFingerprint: fp, replacementWork: { costUnits: 0 } });
  const r = finish(p);
  assert.equal(r.accounting.headroom.oracle_theoretical.minimum_cost_units, 50);
  assert.equal(r.accounting.headroom.oracle_theoretical.selected_substitutions.length, 1);
});

test('elapsed latency is trajectory-level and nested operation durations are not additive work', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  p.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0 });
  p.recordOperation({ trajectoryId: 't1', operationId: 'parent', kind: 'model', work: { inputTokens: 100 }, startedAtMs: 0, endedAtMs: 100 });
  p.recordOperation({ trajectoryId: 't1', operationId: 'child', parentOperationId: 'parent', kind: 'tool', work: { toolCalls: 1 }, startedAtMs: 20, endedAtMs: 80 });
  const r = finish(p, { endedAtMs: 100 });
  assert.equal(r.trajectory.elapsed_ms, 100);
  assert.equal(r.operations[0].duration_ms, 100);
  assert.equal(r.operations[1].duration_ms, 60);
  assert.equal(Object.hasOwn(r.accounting.actual_work, 'wallMs'), false);
  assert.equal(r.interpretation.nested_wall_clock_durations_additive, false);
});

test('wall-clock duration cannot be supplied as additive work', () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  p.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0 });
  assert.throws(() => p.recordOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { wallMs: 10 } }), /wallMs is not a supported work field/);
});

test('measureOperation records an interval without injecting additive wall-clock work', async () => {
  let t = 0; const p = createShadowTrajectoryProfiler({ now: () => (t += 5) });
  p.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0 });
  assert.equal(await p.measureOperation({ trajectoryId: 't1', operationId: 'x', kind: 'tool', work: { toolCalls: 1 } }, async () => 'ok'), 'ok');
  const op = p.getReport('t1').operations[0];
  assert.equal(op.started_at_ms, 5); assert.equal(op.ended_at_ms, 10); assert.equal(op.duration_ms, 5);
  assert.deepEqual(op.work, { toolCalls: 1 });
});

test('measurement failures are isolated per trajectory', async () => {
  const p = createShadowTrajectoryProfiler({ now: () => 1 });
  p.startTrajectory({ trajectoryId: 'a', sampleType: 'replayed', startedAtMs: 0 });
  p.startTrajectory({ trajectoryId: 'b', sampleType: 'replayed', startedAtMs: 0 });
  await p.measureOperation({ trajectoryId: 'a', operationId: 'bad', kind: 'tool', workFromResult: () => ({ unsupported: 1 }) }, async () => 'ok');
  await p.measureOperation({ trajectoryId: 'b', operationId: 'good', kind: 'tool', work: { toolCalls: 1 } }, async () => 'ok');
  assert.equal(p.getReport('a').accounting.measurement_failures, 1);
  assert.equal(p.getReport('b').accounting.measurement_failures, 0);
});
