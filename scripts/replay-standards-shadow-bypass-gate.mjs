import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';

const WORKLOAD_ID = 'standards-watch-daily-v1';
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
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
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
function nonNegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a finite non-negative number`);
  return value;
}
function eligibleRecord(record) {
  return record?.check_status === 'UNKNOWN' &&
    record?.policy_reusable === false &&
    record?.reuse_would_match_validation === null &&
    record?.observe_after_baseline === false &&
    record?.observe_ms === 0 &&
    record?.observe_cost === 0;
}

export function evaluateStandardsShadowBypassGate(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('benchmark input must be an object');
  if (input.workload_id !== WORKLOAD_ID) throw new TypeError(`workload_id must be ${WORKLOAD_ID}`);
  if (!['natural_workload', 'replayed'].includes(input.sample_type)) throw new TypeError('sample_type must be natural_workload or replayed');
  if (input.baseline_definition !== 'best_existing_non_shared_path') throw new TypeError('baseline must be best_existing_non_shared_path');
  if (!Array.isArray(input.records) || input.records.length === 0) throw new TypeError('records must be a non-empty array');

  const implementationEvidenceFingerprint = evidence(options.implementationEvidenceFingerprint, 'implementationEvidenceFingerprint');
  const benchmarkEvidenceFingerprint = evidence(options.benchmarkEvidenceFingerprint, 'benchmarkEvidenceFingerprint');
  const behaviorProofFingerprint = evidence(options.behaviorProofFingerprint, 'behaviorProofFingerprint');
  const sequentialityProofFingerprint = evidence(options.sequentialityProofFingerprint, 'sequentialityProofFingerprint');
  const costPolicyFingerprint = fp(POLICY_TEXT);
  const predictionPolicyFingerprint = fp(PREDICTION_TEXT);
  const captureMechanismFingerprint = fp(CAPTURE_TEXT);

  const trajectories = [];
  let baselineTotalMs = 0;
  let checkTotalMs = 0;
  let prospectiveTotalMs = 0;
  let eligibleCount = 0;

  input.records.forEach((record, index) => {
    const baselineMs = nonNegative(record?.baseline_ms, `records[${index}].baseline_ms`);
    const checkMs = nonNegative(record?.check_ms, `records[${index}].check_ms`);
    baselineTotalMs += baselineMs;
    checkTotalMs += checkMs;
    prospectiveTotalMs += baselineMs + checkMs;

    if (!eligibleRecord(record)) {
      trajectories.push(Object.freeze({ index, eligible: false, reason: 'record_not_structurally_bypassable' }));
      return;
    }
    eligibleCount += 1;

    const p = createShadowTrajectoryProfiler({ now: () => 0 });
    const trajectoryId = `standards-shadow-${index + 1}`;
    const recordEvidence = evidenceFingerprint({
      benchmarkEvidenceFingerprint,
      implementationEvidenceFingerprint,
      behaviorProofFingerprint,
      sequentialityProofFingerprint,
      index,
      record
    });
    p.startTrajectory({
      trajectoryId,
      workloadId: WORKLOAD_ID,
      sampleType: input.sample_type,
      baselineDefinition: 'best_native_stack',
      baselineEvidenceFingerprint: benchmarkEvidenceFingerprint,
      costUnitPolicyId: 'sequential-critical-path-ms-v1',
      costUnitPolicyFingerprint: costPolicyFingerprint,
      startedAtMs: 0
    });
    p.recordOperation({
      trajectoryId,
      operationId: 'shared-check',
      kind: 'network',
      work: { costUnits: checkMs },
      startedAtMs: 0,
      endedAtMs: checkMs
    });
    p.recordOperation({
      trajectoryId,
      operationId: 'authoritative-validation',
      kind: 'network',
      work: { costUnits: baselineMs },
      startedAtMs: checkMs,
      endedAtMs: checkMs + baselineMs
    });
    p.recordProvenAlternative({
      trajectoryId,
      operationId: 'shared-check',
      alternativeId: 'bypass-shadow-check',
      tier: 'capturable_now',
      sameAcceptedOutcome: true,
      proofKind: 'unconditional-authoritative-validation',
      proofFingerprint: recordEvidence,
      predictionPolicyFingerprint,
      captureMechanismFingerprint,
      replacementWork: { costUnits: 0 },
      decisionOverheadCostUnits: 0
    });
    const report = p.finishTrajectory({
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
      capturable_headroom_percent: report.accounting.headroom.currently_capturable.headroom_percent,
      selected_substitution: report.accounting.headroom.currently_capturable.selected_substitutions[0] ?? null
    }));
  });

  const gateAPass = eligibleCount === input.records.length;
  const savedMs = gateAPass ? checkTotalMs : null;
  const bypassTotalMs = gateAPass ? baselineTotalMs : null;
  const improvementPercent = gateAPass && prospectiveTotalMs > 0 ? (checkTotalMs / prospectiveTotalMs) * 100 : null;
  const gateBPositive = gateAPass && checkTotalMs > 0 && bypassTotalMs < prospectiveTotalMs;

  return Object.freeze({
    schema: 'seenrelay-standards-shadow-bypass-gate-v1',
    workload_id: WORKLOAD_ID,
    sample_type: input.sample_type,
    records: input.records.length,
    evidence: Object.freeze({
      benchmark_evidence_fingerprint: benchmarkEvidenceFingerprint,
      implementation_evidence_fingerprint: implementationEvidenceFingerprint,
      behavior_proof_fingerprint: behaviorProofFingerprint,
      sequentiality_proof_fingerprint: sequentialityProofFingerprint,
      behavior_proof_verified_by_harness: false,
      sequentiality_proof_verified_by_harness: false,
      cost_policy_fingerprint: costPolicyFingerprint,
      prediction_policy_fingerprint: predictionPolicyFingerprint,
      capture_mechanism_fingerprint: captureMechanismFingerprint
    }),
    gate_a: Object.freeze({
      pass: gateAPass,
      eligible_records: eligibleCount,
      total_records: input.records.length,
      criterion: 'all records are structurally bypass-eligible under an externally reviewed proof that authoritative validation is unchanged',
      conditional_on_external_behavior_proof: true,
      external_behavior_proof_required: true,
      automatic_behavior_equivalence_proof: false
    }),
    gate_b: Object.freeze({
      positive_headroom: gateBPositive,
      admission_threshold_applied: false,
      baseline_total_ms: baselineTotalMs,
      current_shadow_path_total_ms: prospectiveTotalMs,
      bypass_total_ms: bypassTotalMs,
      measured_saved_ms: savedMs,
      measured_improvement_percent: improvementPercent,
      criterion: 'under an externally reviewed sequentiality proof, bypass has positive measured critical-path headroom; no product threshold is inferred',
      measurement_scope: 'first_party_shadow_instrumentation_path_only',
      conditional_on_external_sequentiality_proof: true,
      external_sequentiality_proof_required: true
    }),
    trajectories: Object.freeze(trajectories),
    interpretation: Object.freeze({
      seenrelay_reuse_value_proven: false,
      behavior_equivalence_inferred_by_harness: false,
      source_native_replacement_enabled: false,
      shadow_check_bypass_supported_for_this_workload: gateAPass && gateBPositive,
      generalization_authorized: false,
      optimizer_authorized: false,
      next_step: gateAPass && gateBPositive
        ? 'TEST_THE_PROFILER_ON_A_SECOND_LEGITIMATE_TRAJECTORY_CLASS'
        : 'DO_NOT_ADVANCE_THIS_BYPASS_CANDIDATE'
    })
  });
}

async function main() {
  const [inputPath, implementationFingerprint, benchmarkFingerprint, behaviorProofFingerprint, sequentialityProofFingerprint] = process.argv.slice(2);
  if (!inputPath || !implementationFingerprint || !benchmarkFingerprint || !behaviorProofFingerprint || !sequentialityProofFingerprint) {
    throw new Error('usage: node scripts/replay-standards-shadow-bypass-gate.mjs <benchmark.json> <implementation-sha256> <benchmark-sha256> <behavior-proof-sha256> <sequentiality-proof-sha256>');
  }
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  console.log(JSON.stringify(evaluateStandardsShadowBypassGate(input, {
    implementationEvidenceFingerprint: implementationFingerprint,
    benchmarkEvidenceFingerprint: benchmarkFingerprint,
    behaviorProofFingerprint,
    sequentialityProofFingerprint
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
