import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';

const WORKLOAD_ID = 'standards-watch-daily-v1';
const NATURAL_COLLECTION_EPOCH = 'schedule-only-v2';
const NATURAL_PROVENANCE_SCHEMA_VERSION = 2;
const PRELIMINARY_SAMPLE_FLOOR = 100;
const MARGINAL_HEADROOM_PERCENT = 20;
const ACTIVE_PROTOTYPE_HEADROOM_PERCENT = 30;
const COMMERCIAL_NET_SAVINGS_REFERENCE_PERCENT = 50;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const RECORD_KEYS = Object.freeze([
  'check_status', 'policy_reusable', 'reuse_would_match_validation', 'observe_after_baseline',
  'baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost'
]);
const POLICY_TEXT = 'sequential-critical-path-ms-v1: costUnits equal measured milliseconds only for the reviewed standards shadow path where CHECK completes before authoritative validation begins; never apply to overlapping or nested spans';
const PREDICTION_TEXT = 'bypass only records with UNKNOWN CHECK, policy_reusable=false, reuse comparison unavailable, and no OBSERVE; preserve authoritative validation unchanged';
const CAPTURE_TEXT = 'omit the shadow CHECK invocation and execute the existing authoritative source-native validation exactly as before';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
function fp(value) {
  return `sha256:${sha256(value)}`;
}
function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  throw new TypeError('unsupported evidence value');
}
function evidenceFingerprint(value) {
  return fp(stable(value));
}
function evidence(value, name) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
  }
  return value;
}
function optionalEvidence(value, name) {
  if (value === null || value === undefined || value === '') return null;
  return evidence(value, name);
}
function nonNegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite non-negative number`);
  }
  return value;
}
function safeId(value, name) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new TypeError(`${name} must be a bounded opaque id`);
  return value;
}
function assertRecordContract(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError(`records[${index}] must be an object`);
  const keys = Object.keys(record).sort();
  const expected = [...RECORD_KEYS].sort();
  if (keys.length !== expected.length || expected.some((key, i) => keys[i] !== key)) {
    throw new TypeError(`records[${index}] contains fields outside the sanitized benchmark contract`);
  }
  nonNegative(record.baseline_ms, `records[${index}].baseline_ms`);
  nonNegative(record.check_ms, `records[${index}].check_ms`);
  nonNegative(record.observe_ms, `records[${index}].observe_ms`);
  nonNegative(record.baseline_cost, `records[${index}].baseline_cost`);
  nonNegative(record.check_cost, `records[${index}].check_cost`);
  nonNegative(record.observe_cost, `records[${index}].observe_cost`);
  if (record.baseline_cost !== 0 || record.check_cost !== 0 || record.observe_cost !== 0) {
    throw new TypeError(`records[${index}] monetary cost fields must be zero for the milliseconds-only Gate B policy`);
  }
}
function assertBestNativeControlsMeasured(input) {
  const controls = input?.controls;
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) throw new TypeError('controls must be present');
  for (const name of ['local_cache', 'source_native_conditional', 'provider_native_cache']) {
    const control = controls[name];
    if (!control || typeof control !== 'object' || Array.isArray(control)) throw new TypeError(`controls.${name} must be present`);
    if (typeof control.available !== 'boolean' || typeof control.measured !== 'boolean') {
      throw new TypeError(`controls.${name} must expose boolean available/measured`);
    }
    if (control.available && !control.measured) {
      throw new TypeError(`available native control ${name} must be measured before Gate B evaluation`);
    }
  }
}
function samplingProvenance(input) {
  if (input.sample_type === 'replayed') {
    return Object.freeze({ gateBAdmissible: false, reason: 'replayed_diagnostic_only', runId: null, parentRunId: null });
  }
  if (input.provenance_schema_version !== NATURAL_PROVENANCE_SCHEMA_VERSION) {
    throw new TypeError('natural evidence requires provenance_schema_version=2');
  }
  if (input.collection_epoch !== NATURAL_COLLECTION_EPOCH) {
    throw new TypeError(`natural evidence must belong to ${NATURAL_COLLECTION_EPOCH}`);
  }
  if (input.run_event !== 'schedule') throw new TypeError('natural evidence requires run_event=schedule');
  const runId = safeId(input.run_id, 'run_id');
  const parentRunId = input.parent_run_id === null ? null : safeId(input.parent_run_id, 'parent_run_id');
  return Object.freeze({ gateBAdmissible: true, reason: null, runId, parentRunId });
}
function eligibleRecord(record) {
  return record.check_status === 'UNKNOWN' &&
    record.policy_reusable === false &&
    record.reuse_would_match_validation === null &&
    record.observe_after_baseline === false &&
    record.observe_ms === 0 &&
    record.observe_cost === 0;
}

export function evaluateStandardsShadowBypassGateV2(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('benchmark input must be an object');
  if (input.schema_version !== 2) throw new TypeError('benchmark schema_version must be 2');
  if (input.workload_id !== WORKLOAD_ID) throw new TypeError(`workload_id must be ${WORKLOAD_ID}`);
  if (!['natural_workload', 'replayed'].includes(input.sample_type)) throw new TypeError('sample_type must be natural_workload or replayed');
  if (input.baseline_definition !== 'best_existing_non_shared_path') throw new TypeError('baseline must be best_existing_non_shared_path');
  if (!Array.isArray(input.records) || input.records.length === 0) throw new TypeError('records must be a non-empty array');

  assertBestNativeControlsMeasured(input);
  input.records.forEach(assertRecordContract);
  const provenance = samplingProvenance(input);

  const implementationEvidenceFingerprint = evidence(options.implementationEvidenceFingerprint, 'implementationEvidenceFingerprint');
  const benchmarkArtifactFingerprint = evidence(options.benchmarkEvidenceFingerprint, 'benchmarkEvidenceFingerprint');
  const behaviorProofFingerprint = evidence(options.behaviorProofFingerprint, 'behaviorProofFingerprint');
  const sequentialityProofFingerprint = evidence(options.sequentialityProofFingerprint, 'sequentialityProofFingerprint');
  const lineageProofFingerprint = provenance.gateBAdmissible
    ? evidence(options.lineageProofFingerprint, 'lineageProofFingerprint')
    : optionalEvidence(options.lineageProofFingerprint, 'lineageProofFingerprint');
  const benchmarkCanonicalFingerprint = evidenceFingerprint(input);
  const costPolicyFingerprint = fp(POLICY_TEXT);
  const predictionPolicyFingerprint = fp(PREDICTION_TEXT);
  const captureMechanismFingerprint = fp(CAPTURE_TEXT);

  const trajectories = [];
  let baselineTotalMs = 0;
  let checkTotalMs = 0;
  let prospectiveTotalMs = 0;
  let eligibleCount = 0;

  input.records.forEach((record, index) => {
    const baselineMs = record.baseline_ms;
    const checkMs = record.check_ms;
    baselineTotalMs += baselineMs;
    checkTotalMs += checkMs;
    prospectiveTotalMs += baselineMs + checkMs;

    if (!eligibleRecord(record)) {
      trajectories.push(Object.freeze({ index, eligible: false, reason: 'record_not_structurally_bypassable' }));
      return;
    }
    eligibleCount += 1;

    const profiler = createShadowTrajectoryProfiler({ now: () => 0 });
    const trajectoryId = `standards-shadow-${index + 1}`;
    const recordEvidence = evidenceFingerprint({
      benchmarkCanonicalFingerprint,
      benchmarkArtifactFingerprint,
      implementationEvidenceFingerprint,
      behaviorProofFingerprint,
      sequentialityProofFingerprint,
      lineageProofFingerprint,
      index,
      record
    });
    profiler.startTrajectory({
      trajectoryId,
      workloadId: WORKLOAD_ID,
      sampleType: input.sample_type,
      baselineDefinition: 'best_native_stack',
      baselineEvidenceFingerprint: benchmarkCanonicalFingerprint,
      costUnitPolicyId: 'sequential-critical-path-ms-v1',
      costUnitPolicyFingerprint: costPolicyFingerprint,
      startedAtMs: 0
    });
    profiler.recordOperation({
      trajectoryId,
      operationId: 'shared-check',
      kind: 'network',
      work: { costUnits: checkMs },
      startedAtMs: 0,
      endedAtMs: checkMs
    });
    profiler.recordOperation({
      trajectoryId,
      operationId: 'authoritative-validation',
      kind: 'network',
      work: { costUnits: baselineMs },
      startedAtMs: checkMs,
      endedAtMs: checkMs + baselineMs
    });
    profiler.recordProvenAlternative({
      trajectoryId,
      operationId: 'shared-check',
      alternativeId: 'bypass-shadow-check',
      tier: 'capturable_now',
      sameAcceptedOutcome: true,
      proofKind: 'external-proof-required-unconditional-authoritative-validation',
      proofFingerprint: recordEvidence,
      predictionPolicyFingerprint,
      captureMechanismFingerprint,
      replacementWork: { costUnits: 0 },
      decisionOverheadCostUnits: 0
    });
    const report = profiler.finishTrajectory({
      trajectoryId,
      outcome: { completed: true, correct: true, safetyAcceptable: true },
      outcomeEvidenceFingerprint: recordEvidence,
      endedAtMs: checkMs + baselineMs
    });
    trajectories.push(Object.freeze({
      index,
      eligible: true,
      check_ms: checkMs,
      baseline_ms: baselineMs,
      prospective_ms: checkMs + baselineMs,
      bypass_ms: baselineMs,
      conditional_capturable_headroom_percent: report.accounting.headroom.currently_capturable.headroom_percent,
      selected_substitution: report.accounting.headroom.currently_capturable.selected_substitutions[0] ?? null
    }));
  });

  const gateAPass = eligibleCount === input.records.length;
  const savedMs = gateAPass ? checkTotalMs : null;
  const bypassTotalMs = gateAPass ? baselineTotalMs : null;
  const improvementPercent = gateAPass && prospectiveTotalMs > 0 ? (checkTotalMs / prospectiveTotalMs) * 100 : null;
  const gateBPositive = gateAPass && checkTotalMs > 0 && bypassTotalMs < prospectiveTotalMs;
  const sampleFloorMet = input.records.length >= PRELIMINARY_SAMPLE_FLOOR;
  const aboveMarginalFloor = gateBPositive && improvementPercent >= MARGINAL_HEADROOM_PERCENT;
  const conditionalActivePrototypeCandidate = provenance.gateBAdmissible && sampleFloorMet && gateBPositive && improvementPercent >= ACTIVE_PROTOTYPE_HEADROOM_PERCENT;
  const marginalKillSignal = provenance.gateBAdmissible && sampleFloorMet && gateBPositive && improvementPercent < MARGINAL_HEADROOM_PERCENT;
  const headroomBand = !gateBPositive ? 'no_positive_headroom'
    : improvementPercent < MARGINAL_HEADROOM_PERCENT ? 'marginal_below_private255_floor'
      : improvementPercent < ACTIVE_PROTOTYPE_HEADROOM_PERCENT ? 'material_below_active_prototype_threshold'
        : 'conditional_active_prototype_candidate_band';

  const admissionBlockers = [];
  if (!provenance.gateBAdmissible) admissionBlockers.push('replayed_input_is_diagnostic_only');
  if (!sampleFloorMet) admissionBlockers.push('natural_sample_floor_not_met');
  if (!gateAPass) admissionBlockers.push('not_all_records_structurally_bypassable');
  if (!gateBPositive) admissionBlockers.push('no_positive_conditional_headroom');
  if (provenance.gateBAdmissible) {
    admissionBlockers.push('behavior_proof_not_verified_by_harness');
    admissionBlockers.push('sequentiality_proof_not_verified_by_harness');
    admissionBlockers.push('lineage_proof_not_verified_by_harness');
  }

  const nextStep = !provenance.gateBAdmissible
    ? 'REPLAY_DIAGNOSTIC_ONLY_COLLECT_SCHEDULED_NATURAL_EVIDENCE'
    : !gateAPass || !gateBPositive
      ? 'DO_NOT_ADVANCE_THIS_BYPASS_CANDIDATE'
      : !sampleFloorMet
        ? 'COLLECT_MORE_SCHEDULED_NATURAL_SAMPLES_BEFORE_GATE_B_ADMISSION'
        : improvementPercent < MARGINAL_HEADROOM_PERCENT
          ? 'DO_NOT_BROADEN_FROM_THIS_WORKLOAD'
          : improvementPercent < ACTIVE_PROTOTYPE_HEADROOM_PERCENT
            ? 'KEEP_AS_MATERIAL_HEADROOM_BUT_DO_NOT_BUILD_ACTIVE_PROTOTYPE'
            : 'VERIFY_EXTERNAL_PROOFS_AND_TEST_A_SECOND_USEFUL_WORKLOAD';

  return Object.freeze({
    schema: 'seenrelay-standards-shadow-bypass-gate-v2',
    workload_id: WORKLOAD_ID,
    sample_type: input.sample_type,
    records: input.records.length,
    provenance: Object.freeze({
      gate_b_admissible_source: provenance.gateBAdmissible,
      collection_epoch: provenance.gateBAdmissible ? input.collection_epoch : null,
      run_event: provenance.gateBAdmissible ? input.run_event : null,
      run_id: provenance.runId,
      parent_run_id: provenance.parentRunId,
      replay_reason: provenance.reason
    }),
    evidence: Object.freeze({
      benchmark_artifact_fingerprint: benchmarkArtifactFingerprint,
      benchmark_canonical_fingerprint: benchmarkCanonicalFingerprint,
      benchmark_artifact_fingerprint_verified_by_harness: false,
      implementation_evidence_fingerprint: implementationEvidenceFingerprint,
      behavior_proof_fingerprint: behaviorProofFingerprint,
      sequentiality_proof_fingerprint: sequentialityProofFingerprint,
      lineage_proof_fingerprint: lineageProofFingerprint,
      behavior_proof_verified_by_harness: false,
      sequentiality_proof_verified_by_harness: false,
      lineage_proof_verified_by_harness: false,
      cost_policy_fingerprint: costPolicyFingerprint,
      prediction_policy_fingerprint: predictionPolicyFingerprint,
      capture_mechanism_fingerprint: captureMechanismFingerprint
    }),
    gate_a: Object.freeze({
      pass: gateAPass,
      eligible_records: eligibleCount,
      total_records: input.records.length,
      sanitized_record_contract_enforced: true,
      all_available_native_controls_measured: true,
      criterion: 'all records are sanitized and structurally bypass-eligible after all available native controls have been measured',
      automatic_behavior_equivalence_proof: false
    }),
    gate_b: Object.freeze({
      positive_conditional_headroom: gateBPositive,
      workload_evidence_ready: false,
      global_gate_pass: false,
      admission_blockers: Object.freeze(admissionBlockers),
      preliminary_sample_floor: PRELIMINARY_SAMPLE_FLOOR,
      preliminary_sample_floor_met: sampleFloorMet,
      private255_marginal_headroom_floor_percent: MARGINAL_HEADROOM_PERCENT,
      private255_active_prototype_headroom_percent: ACTIVE_PROTOTYPE_HEADROOM_PERCENT,
      private255_commercial_net_savings_reference_percent: COMMERCIAL_NET_SAVINGS_REFERENCE_PERCENT,
      above_marginal_floor: aboveMarginalFloor,
      conditional_active_prototype_candidate_for_this_workload: conditionalActivePrototypeCandidate,
      active_prototype_candidate_for_this_workload: false,
      marginal_kill_signal_for_this_workload: marginalKillSignal,
      headroom_band: headroomBand,
      cross_workload_confirmation_required: true,
      commercial_net_savings_evaluable: false,
      commercially_compelling_proven: false,
      baseline_total_ms: baselineTotalMs,
      current_shadow_path_total_ms: prospectiveTotalMs,
      bypass_total_ms: bypassTotalMs,
      conditional_saved_ms: savedMs,
      conditional_improvement_percent: improvementPercent,
      measurement_scope: 'first_party_shadow_instrumentation_path_only',
      external_proof_verification_required_for_admission: true
    }),
    trajectories: Object.freeze(trajectories),
    interpretation: Object.freeze({
      seenrelay_reuse_value_proven: false,
      behavior_equivalence_inferred_by_harness: false,
      source_native_replacement_enabled: false,
      conditional_shadow_check_bypass_candidate: gateAPass && gateBPositive,
      shadow_check_bypass_supported_for_this_workload: false,
      generalization_authorized: false,
      optimizer_authorized: false,
      attention_microkernel_prototype_authorized: false,
      commercially_compelling_proven: false,
      next_step: nextStep
    })
  });
}

async function main() {
  const [inputPath, implementationFingerprint, benchmarkFingerprint, behaviorProofFingerprint, sequentialityProofFingerprint, lineageProofFingerprint = ''] = process.argv.slice(2);
  if (!inputPath || !implementationFingerprint || !benchmarkFingerprint || !behaviorProofFingerprint || !sequentialityProofFingerprint) {
    throw new Error('usage: node scripts/replay-standards-shadow-bypass-gate-v2.mjs <benchmark.json> <implementation-sha256> <benchmark-artifact-sha256> <behavior-proof-sha256> <sequentiality-proof-sha256> [lineage-proof-sha256]');
  }
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  console.log(JSON.stringify(evaluateStandardsShadowBypassGateV2(input, {
    implementationEvidenceFingerprint: implementationFingerprint,
    benchmarkEvidenceFingerprint: benchmarkFingerprint,
    behaviorProofFingerprint,
    sequentialityProofFingerprint,
    lineageProofFingerprint
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
