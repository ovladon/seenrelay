const SAMPLE_TYPES = new Set(['natural_workload', 'replayed', 'commissioning', 'synthetic']);
const OPERATION_KINDS = new Set(['model', 'tool', 'retrieval', 'rerank', 'embedding', 'browser', 'network', 'memory', 'destination', 'storage', 'other']);
const ALTERNATIVE_TIERS = new Set(['retrospective_only', 'safely_predictable', 'capturable_now']);
const REPORT_TIERS = Object.freeze(['oracle_theoretical', 'safely_predictable', 'currently_capturable']);
const WORK_FIELDS = Object.freeze([
  'costUnits', 'monetaryUsd',
  'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens',
  'retrievalUnits', 'rerankUnits', 'embeddingUnits',
  'toolCalls', 'apiRequests', 'browserMs',
  'networkRequests', 'networkBytes', 'destinationComputeMs',
  'storageOps', 'retryCount'
]);

function monotonicNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}
function identifier(value, name) {
  const normalized = text(value, name);
  if (normalized.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:@\/-]*$/.test(normalized)) {
    throw new TypeError(`${name} must be an opaque identifier (1-160 safe ASCII characters)`);
  }
  return normalized;
}
function optionalIdentifier(value, name) {
  return value === undefined || value === null ? undefined : identifier(value, name);
}
function finiteNonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${name} must be a finite non-negative number`);
  return number;
}
function fingerprint(value, name) {
  if (value === undefined || value === null) return undefined;
  const normalized = text(value, name).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
  return normalized;
}
function normalizeWork(input = {}, name = 'work') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`${name} must be an object`);
  const output = {};
  for (const key of Object.keys(input)) {
    if (!WORK_FIELDS.includes(key)) throw new TypeError(`${name}.${key} is not a supported work field`);
    output[key] = finiteNonNegative(input[key], `${name}.${key}`);
  }
  return Object.freeze(output);
}
function addWork(target, source) {
  for (const field of WORK_FIELDS) if (source[field] !== undefined) target[field] = (target[field] ?? 0) + source[field];
  return target;
}
function outcome(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('outcome must be an object');
  for (const key of ['completed', 'correct', 'safetyAcceptable']) {
    if (typeof input[key] !== 'boolean') throw new TypeError(`outcome.${key} must be boolean`);
  }
  return Object.freeze({ completed: input.completed, correct: input.correct, safetyAcceptable: input.safetyAcceptable });
}
function outcomeAdmissible(value, evidence) {
  return value?.completed === true && value?.correct === true && value?.safetyAcceptable === true && Boolean(evidence);
}
function tierEligible(alternativeTier, reportTier) {
  if (reportTier === 'oracle_theoretical') return true;
  if (reportTier === 'safely_predictable') return alternativeTier !== 'retrospective_only';
  return alternativeTier === 'capturable_now';
}
function replacementCost(alternative) {
  return (alternative.replacementWork.costUnits ?? 0) + alternative.decisionOverheadCostUnits;
}
function percentHeadroom(actual, minimum) {
  if (actual === 0) return 0;
  return actual > 0 ? ((actual - minimum) / actual) * 100 : null;
}
function operationDuration(operation) {
  return operation.startedAtMs === undefined || operation.endedAtMs === undefined
    ? null
    : Math.max(0, operation.endedAtMs - operation.startedAtMs);
}

/**
 * Research-only local accounting. It never calls SeenRelay and never authorizes
 * suppression or reuse. Wall-clock latency is represented by intervals and by
 * trajectory elapsed time, never by summing nested operation durations.
 */
export class ShadowTrajectoryProfiler {
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
    this._now = typeof options.now === 'function' ? options.now : monotonicNow;
    this._trajectories = new Map();
  }

  startTrajectory(input) {
    const overheadStart = monotonicNow();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('trajectory input must be an object');
    const id = identifier(input.trajectoryId, 'trajectoryId');
    if (this._trajectories.has(id)) throw new TypeError(`trajectoryId already exists: ${id}`);
    const sampleType = text(input.sampleType, 'sampleType');
    if (!SAMPLE_TYPES.has(sampleType)) throw new TypeError(`unsupported sampleType: ${sampleType}`);
    const baselineDefinition = input.baselineDefinition ?? 'best_native_stack';
    if (baselineDefinition !== 'best_native_stack') throw new TypeError('baselineDefinition must be best_native_stack');
    let startupMeasurementFailures = 0;
    let startedAtCandidate = input.startedAtMs;
    if (startedAtCandidate === undefined) {
      try { startedAtCandidate = this._now(); }
      catch { startedAtCandidate = monotonicNow(); startupMeasurementFailures += 1; }
    }
    const trajectory = {
      id,
      workloadId: optionalIdentifier(input.workloadId, 'workloadId'),
      sampleType,
      baselineDefinition,
      baselineEvidenceFingerprint: fingerprint(input.baselineEvidenceFingerprint, 'baselineEvidenceFingerprint'),
      costUnitPolicyId: optionalIdentifier(input.costUnitPolicyId, 'costUnitPolicyId'),
      costUnitPolicyFingerprint: fingerprint(input.costUnitPolicyFingerprint, 'costUnitPolicyFingerprint'),
      startedAtMs: finiteNonNegative(startedAtCandidate, 'startedAtMs'),
      endedAtMs: undefined,
      operations: new Map(),
      alternatives: new Map(),
      outcome: undefined,
      outcomeEvidenceFingerprint: undefined,
      accountingOverheadMs: 0,
      extractorOverheadMs: 0,
      measurementFailures: startupMeasurementFailures
    };
    this._trajectories.set(id, trajectory);
    trajectory.accountingOverheadMs += Math.max(0, monotonicNow() - overheadStart);
    return id;
  }

  recordOperation(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('operation input must be an object');
    const trajectory = this._requireTrajectory(input.trajectoryId);
    return this._measureAccounting(trajectory, () => {
      if (trajectory.endedAtMs !== undefined) throw new TypeError('cannot record operation after trajectory finish');
      const operationId = identifier(input.operationId, 'operationId');
      if (trajectory.operations.has(operationId)) throw new TypeError(`operationId already exists: ${operationId}`);
      const kind = text(input.kind, 'kind');
      if (!OPERATION_KINDS.has(kind)) throw new TypeError(`unsupported operation kind: ${kind}`);
      const status = input.status ?? 'ok';
      if (!['ok', 'error'].includes(status)) throw new TypeError('status must be ok or error');
      const operation = Object.freeze({
        operationId,
        parentOperationId: optionalIdentifier(input.parentOperationId, 'parentOperationId'),
        kind,
        coordinateFingerprint: fingerprint(input.coordinateFingerprint, 'coordinateFingerprint'),
        status,
        work: normalizeWork(input.work ?? {}),
        startedAtMs: input.startedAtMs === undefined ? undefined : finiteNonNegative(input.startedAtMs, 'startedAtMs'),
        endedAtMs: input.endedAtMs === undefined ? undefined : finiteNonNegative(input.endedAtMs, 'endedAtMs')
      });
      if (operation.startedAtMs !== undefined && operation.endedAtMs !== undefined && operation.endedAtMs < operation.startedAtMs) {
        throw new TypeError('endedAtMs must be >= startedAtMs');
      }
      trajectory.operations.set(operationId, operation);
      return operation;
    });
  }

  recordProvenAlternative(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('alternative input must be an object');
    const trajectory = this._requireTrajectory(input.trajectoryId);
    return this._measureAccounting(trajectory, () => {
      if (trajectory.endedAtMs !== undefined) throw new TypeError('cannot record alternative after trajectory finish');
      const operationId = identifier(input.operationId, 'operationId');
      if (!trajectory.operations.has(operationId)) throw new TypeError(`unknown operationId: ${operationId}`);
      const alternativeId = identifier(input.alternativeId, 'alternativeId');
      const key = `${operationId}\u0000${alternativeId}`;
      if (trajectory.alternatives.has(key)) throw new TypeError(`alternative already exists: ${alternativeId}`);
      const tier = text(input.tier, 'tier');
      if (!ALTERNATIVE_TIERS.has(tier)) throw new TypeError(`unsupported alternative tier: ${tier}`);
      if (input.sameAcceptedOutcome !== true) throw new TypeError('sameAcceptedOutcome must be explicitly true');
      const proofFingerprint = fingerprint(input.proofFingerprint, 'proofFingerprint');
      if (!proofFingerprint) throw new TypeError('proofFingerprint is required');
      const predictionPolicyFingerprint = fingerprint(input.predictionPolicyFingerprint, 'predictionPolicyFingerprint');
      const captureMechanismFingerprint = fingerprint(input.captureMechanismFingerprint, 'captureMechanismFingerprint');
      if (tier !== 'retrospective_only' && !predictionPolicyFingerprint) {
        throw new TypeError('predictionPolicyFingerprint is required for safely predictable or capturable alternatives');
      }
      if (tier === 'capturable_now' && !captureMechanismFingerprint) {
        throw new TypeError('captureMechanismFingerprint is required for capturable alternatives');
      }
      const alternative = Object.freeze({
        operationId,
        alternativeId,
        tier,
        proofKind: identifier(input.proofKind, 'proofKind'),
        proofFingerprint,
        predictionPolicyFingerprint,
        captureMechanismFingerprint,
        replacementWork: normalizeWork(input.replacementWork ?? {}, 'replacementWork'),
        decisionOverheadCostUnits: finiteNonNegative(input.decisionOverheadCostUnits ?? 0, 'decisionOverheadCostUnits')
      });
      trajectory.alternatives.set(key, alternative);
      return alternative;
    });
  }

  finishTrajectory(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('finish input must be an object');
    const trajectory = this._requireTrajectory(input.trajectoryId);
    return this._measureAccounting(trajectory, () => {
      if (trajectory.endedAtMs !== undefined) throw new TypeError('trajectory already finished');
      const normalizedOutcome = outcome(input.outcome);
      const evidence = fingerprint(input.outcomeEvidenceFingerprint, 'outcomeEvidenceFingerprint');
      let endedAtCandidate = input.endedAtMs;
      if (endedAtCandidate === undefined) {
        try { endedAtCandidate = this._now(); }
        catch { endedAtCandidate = monotonicNow(); trajectory.measurementFailures += 1; }
      }
      const endedAtMs = finiteNonNegative(endedAtCandidate, 'endedAtMs');
      if (endedAtMs < trajectory.startedAtMs) throw new TypeError('endedAtMs must be >= startedAtMs');
      trajectory.outcome = normalizedOutcome;
      trajectory.outcomeEvidenceFingerprint = evidence;
      trajectory.endedAtMs = endedAtMs;
      return this._report(trajectory);
    });
  }

  async measureOperation(input, fn) {
    if (typeof fn !== 'function') throw new TypeError('fn must be a function');
    let trajectory;
    try { trajectory = this._requireTrajectory(input?.trajectoryId); } catch { trajectory = null; }
    const safeNow = () => {
      try { return finiteNonNegative(this._now(), 'measurement clock'); }
      catch { if (trajectory) trajectory.measurementFailures += 1; return undefined; }
    };
    const startedAtMs = safeNow();
    let result;
    let authoritativeError;
    try { result = await fn(); }
    catch (error) { authoritativeError = error; }
    const endedAtMs = safeNow();

    if (authoritativeError !== undefined) {
      try {
        this.recordOperation({ ...input, status: 'error', startedAtMs, endedAtMs, work: { ...(input?.work ?? {}) } });
      } catch { if (trajectory) trajectory.measurementFailures += 1; }
      throw authoritativeError;
    }

    try {
      let extraWork = {};
      if (typeof input?.workFromResult === 'function') {
        const extractorStart = monotonicNow();
        try { extraWork = input.workFromResult(result) ?? {}; }
        catch { if (trajectory) trajectory.measurementFailures += 1; }
        finally { if (trajectory) trajectory.extractorOverheadMs += Math.max(0, monotonicNow() - extractorStart); }
      }
      this.recordOperation({ ...input, status: 'ok', startedAtMs, endedAtMs, work: { ...(input?.work ?? {}), ...extraWork } });
    } catch { if (trajectory) trajectory.measurementFailures += 1; }
    return result;
  }

  getReport(trajectoryId) {
    return this._report(this._requireTrajectory(trajectoryId));
  }

  _measureAccounting(trajectory, fn) {
    const start = monotonicNow();
    try { return fn(); }
    finally { trajectory.accountingOverheadMs += Math.max(0, monotonicNow() - start); }
  }

  _requireTrajectory(trajectoryId) {
    const id = identifier(trajectoryId, 'trajectoryId');
    const trajectory = this._trajectories.get(id);
    if (!trajectory) throw new TypeError(`unknown trajectoryId: ${id}`);
    return trajectory;
  }

  _report(trajectory) {
    const operations = [...trajectory.operations.values()];
    const alternatives = [...trajectory.alternatives.values()];
    const alternativesByOperation = new Map();
    for (const alternative of alternatives) {
      const list = alternativesByOperation.get(alternative.operationId) ?? [];
      list.push(alternative);
      alternativesByOperation.set(alternative.operationId, list);
    }
    const actualWork = {};
    for (const operation of operations) addWork(actualWork, operation.work);
    const allOperationsHaveCostUnits = operations.every(operation => operation.work.costUnits !== undefined);
    const scalarAvailable = Boolean(
      trajectory.costUnitPolicyId && trajectory.costUnitPolicyFingerprint && trajectory.baselineEvidenceFingerprint &&
      operations.length > 0 && allOperationsHaveCostUnits && trajectory.endedAtMs !== undefined
    );
    const actualCostUnits = scalarAvailable ? operations.reduce((sum, operation) => sum + operation.work.costUnits, 0) : null;
    const admissibleOutcome = outcomeAdmissible(trajectory.outcome, trajectory.outcomeEvidenceFingerprint);
    const tiers = {};

    for (const reportTier of REPORT_TIERS) {
      let bestSaving = 0;
      let best = null;
      if (scalarAvailable) {
        for (const operation of operations) {
          for (const candidate of alternativesByOperation.get(operation.operationId) ?? []) {
            if (!tierEligible(candidate.tier, reportTier) || candidate.replacementWork.costUnits === undefined) continue;
            const candidateCost = replacementCost(candidate);
            const saving = operation.work.costUnits - candidateCost;
            if (saving > bestSaving) { bestSaving = saving; best = { operation, candidate, candidateCost }; }
          }
        }
      }
      const minimum = scalarAvailable ? actualCostUnits - bestSaving : null;
      tiers[reportTier] = Object.freeze({
        minimum_cost_units: minimum,
        headroom_percent: scalarAvailable && admissibleOutcome ? percentHeadroom(actualCostUnits, minimum) : null,
        selected_substitutions: Object.freeze(best ? [{
          operation_id: best.operation.operationId,
          alternative_id: best.candidate.alternativeId,
          replacement_cost_units: best.candidateCost
        }] : []),
        admissible_for_optimization_research: Boolean(scalarAvailable && admissibleOutcome),
        savings_claim_authorized: false
      });
    }

    return Object.freeze({
      schema: 'seenrelay-shadow-trajectory-report-v1',
      mode: 'measurement-only',
      hosted_operations_added: 0,
      seenrelay_network_calls: 0,
      automatic_suppression_authorized: false,
      active_optimization_authorized: false,
      savings_claim_authorized: false,
      raw_prompts_retained: false,
      raw_results_retained: false,
      raw_tool_arguments_retained: false,
      chain_of_thought_retained: false,
      trajectory: Object.freeze({
        trajectory_id: trajectory.id,
        workload_id: trajectory.workloadId ?? null,
        sample_type: trajectory.sampleType,
        baseline_definition: trajectory.baselineDefinition,
        baseline_evidence_fingerprint: trajectory.baselineEvidenceFingerprint ?? null,
        cost_unit_policy_id: trajectory.costUnitPolicyId ?? null,
        cost_unit_policy_fingerprint: trajectory.costUnitPolicyFingerprint ?? null,
        started_at_ms: trajectory.startedAtMs,
        ended_at_ms: trajectory.endedAtMs ?? null,
        elapsed_ms: trajectory.endedAtMs === undefined ? null : Math.max(0, trajectory.endedAtMs - trajectory.startedAtMs),
        complete: trajectory.endedAtMs !== undefined,
        outcome: trajectory.outcome ?? null,
        outcome_evidence_fingerprint: trajectory.outcomeEvidenceFingerprint ?? null
      }),
      accounting: Object.freeze({
        operation_count: operations.length,
        proven_alternative_count: alternatives.length,
        scalar_headroom_available: scalarAvailable,
        scalar_headroom_unavailable_reason: scalarAvailable ? null : (
          !trajectory.costUnitPolicyId ? 'missing_cost_unit_policy' :
          !trajectory.costUnitPolicyFingerprint ? 'missing_cost_unit_policy_fingerprint' :
          !trajectory.baselineEvidenceFingerprint ? 'missing_best_native_baseline_evidence' :
          operations.length === 0 ? 'no_operations' :
          !allOperationsHaveCostUnits ? 'missing_operation_cost_units' :
          trajectory.endedAtMs === undefined ? 'trajectory_not_finished' : 'unavailable'
        ),
        actual_cost_units: actualCostUnits,
        actual_work: Object.freeze({ ...actualWork }),
        profiler_recording_overhead_ms: trajectory.accountingOverheadMs,
        result_extractor_overhead_ms: trajectory.extractorOverheadMs,
        measurement_failures: trajectory.measurementFailures,
        headroom: Object.freeze(tiers),
        counterfactual_scope: 'one-proven-substitution-per-trajectory',
        compositional_counterfactuals_supported: false,
        'overlapping_multi-operation_skips_supported': false
      }),
      operations: Object.freeze(operations.map(operation => Object.freeze({
        operation_id: operation.operationId,
        parent_operation_id: operation.parentOperationId ?? null,
        kind: operation.kind,
        coordinate_fingerprint: operation.coordinateFingerprint ?? null,
        status: operation.status,
        work: operation.work,
        started_at_ms: operation.startedAtMs ?? null,
        ended_at_ms: operation.endedAtMs ?? null,
        duration_ms: operationDuration(operation)
      }))),
      proven_alternatives: Object.freeze(alternatives.map(alternative => Object.freeze({
        operation_id: alternative.operationId,
        alternative_id: alternative.alternativeId,
        tier: alternative.tier,
        proof_kind: alternative.proofKind,
        proof_fingerprint: alternative.proofFingerprint,
        prediction_policy_fingerprint: alternative.predictionPolicyFingerprint ?? null,
        capture_mechanism_fingerprint: alternative.captureMechanismFingerprint ?? null,
        same_accepted_outcome: true,
        replacement_work: alternative.replacementWork,
        decision_overhead_cost_units: alternative.decisionOverheadCostUnits
      }))),
      interpretation: Object.freeze({
        outcome_admissible: admissibleOutcome,
        equivalence_inferred_by_profiler: false,
        caller_proof_required_for_counterfactual: true,
        best_native_baseline_required: true,
        nested_wall_clock_durations_additive: false,
        next_step: scalarAvailable && admissibleOutcome
          ? 'RUN_GATE_A_B_ON_NATURAL_OR_LEGITIMATE_REPLAYED_TRAJECTORIES'
          : 'COLLECT_VALID_ACCOUNTING_WITH_ACCEPTED_OUTCOME'
      })
    });
  }
}

export function createShadowTrajectoryProfiler(options = {}) {
  return new ShadowTrajectoryProfiler(options);
}
