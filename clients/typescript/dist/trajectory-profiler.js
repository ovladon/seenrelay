const SAMPLE_TYPES = new Set(['natural_workload', 'replayed', 'commissioning', 'synthetic']);
const OPERATION_KINDS = new Set(['model', 'tool', 'retrieval', 'rerank', 'embedding', 'browser', 'network', 'memory', 'destination', 'storage', 'other']);
const ALTERNATIVE_TIERS = new Set(['retrospective_only', 'safely_predictable', 'capturable_now']);
const WORK_FIELDS = Object.freeze([
  'costUnits',
  'monetaryUsd',
  'wallMs',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'retrievalUnits',
  'rerankUnits',
  'embeddingUnits',
  'toolCalls',
  'apiRequests',
  'browserMs',
  'networkRequests',
  'networkBytes',
  'destinationComputeMs',
  'storageOps',
  'retryCount'
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
function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
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
  for (const field of WORK_FIELDS) {
    if (input[field] !== undefined) output[field] = finiteNonNegative(input[field], `${name}.${field}`);
  }
  for (const key of Object.keys(input)) {
    if (!WORK_FIELDS.includes(key)) throw new TypeError(`${name}.${key} is not a supported work field`);
  }
  return output;
}
function addWork(target, source) {
  for (const field of WORK_FIELDS) {
    if (source[field] !== undefined) target[field] = (target[field] ?? 0) + source[field];
  }
  return target;
}
function cloneWork(work) {
  return Object.freeze({ ...work });
}
function outcomeAdmissible(outcome, outcomeEvidenceFingerprint) {
  return outcome?.completed === true && outcome?.correct === true && outcome?.safetyAcceptable === true && Boolean(outcomeEvidenceFingerprint);
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
  if (!(actual > 0)) return actual === 0 ? 0 : null;
  return ((actual - minimum) / actual) * 100;
}

/**
 * Research-only, local shadow accounting for one or more agent trajectories.
 * It does not call SeenRelay, does not retain prompts/results/tool arguments,
 * and never authorizes an optimization. Counterfactual savings are counted only
 * when the caller supplies an explicit same-outcome proof for a single operation.
 */
export class ShadowTrajectoryProfiler {
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
    this._now = typeof options.now === 'function' ? options.now : monotonicNow;
    this._trajectories = new Map();
    this._measurementFailures = 0;
    this._accountingOverheadMs = 0;
    this._extractorOverheadMs = 0;
  }

  _account(fn) {
    const started = monotonicNow();
    try {
      return fn();
    } finally {
      this._accountingOverheadMs += Math.max(0, monotonicNow() - started);
    }
  }

  startTrajectory(input) {
    return this._account(() => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('trajectory input must be an object');
      const id = identifier(input.trajectoryId, 'trajectoryId');
      if (this._trajectories.has(id)) throw new TypeError(`trajectoryId already exists: ${id}`);
      const sampleType = text(input.sampleType, 'sampleType');
      if (!SAMPLE_TYPES.has(sampleType)) throw new TypeError(`unsupported sampleType: ${sampleType}`);
      const baselineDefinition = input.baselineDefinition ?? 'best_native_stack';
      if (baselineDefinition !== 'best_native_stack') throw new TypeError('baselineDefinition must be best_native_stack');
      const trajectory = {
        id,
        workloadId: optionalIdentifier(input.workloadId, 'workloadId'),
        sampleType,
        baselineDefinition,
        baselineEvidenceFingerprint: fingerprint(input.baselineEvidenceFingerprint, 'baselineEvidenceFingerprint'),
        costUnitPolicyId: optionalIdentifier(input.costUnitPolicyId, 'costUnitPolicyId'),
        costUnitPolicyFingerprint: fingerprint(input.costUnitPolicyFingerprint, 'costUnitPolicyFingerprint'),
        startedAtMs: finiteNonNegative(input.startedAtMs ?? this._now(), 'startedAtMs'),
        endedAtMs: undefined,
        operations: new Map(),
        alternatives: new Map(),
        outcome: undefined,
        outcomeEvidenceFingerprint: undefined
      };
      this._trajectories.set(id, trajectory);
      return id;
    });
  }

  recordOperation(input) {
    return this._account(() => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('operation input must be an object');
      const trajectory = this._requireTrajectory(input.trajectoryId);
      if (trajectory.endedAtMs !== undefined) throw new TypeError('cannot record operation after trajectory finish');
      const operationId = identifier(input.operationId, 'operationId');
      if (trajectory.operations.has(operationId)) throw new TypeError(`operationId already exists: ${operationId}`);
      const kind = text(input.kind, 'kind');
      if (!OPERATION_KINDS.has(kind)) throw new TypeError(`unsupported operation kind: ${kind}`);
      const status = input.status ?? 'ok';
      if (!['ok', 'error'].includes(status)) throw new TypeError('status must be ok or error');
      const work = normalizeWork(input.work ?? {}, 'work');
      const operation = Object.freeze({
        operationId,
        parentOperationId: optionalIdentifier(input.parentOperationId, 'parentOperationId'),
        kind,
        coordinateFingerprint: fingerprint(input.coordinateFingerprint, 'coordinateFingerprint'),
        status,
        work: cloneWork(work),
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
    return this._account(() => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('alternative input must be an object');
      const trajectory = this._requireTrajectory(input.trajectoryId);
      if (trajectory.endedAtMs !== undefined) throw new TypeError('cannot record alternative after trajectory finish');
      const operationId = identifier(input.operationId, 'operationId');
      const operation = trajectory.operations.get(operationId);
      if (!operation) throw new TypeError(`unknown operationId: ${operationId}`);
      const alternativeId = identifier(input.alternativeId, 'alternativeId');
      const key = `${operationId}\u0000${alternativeId}`;
      if (trajectory.alternatives.has(key)) throw new TypeError(`alternative already exists: ${alternativeId}`);
      const tier = text(input.tier, 'tier');
      if (!ALTERNATIVE_TIERS.has(tier)) throw new TypeError(`unsupported alternative tier: ${tier}`);
      if (input.sameAcceptedOutcome !== true) throw new TypeError('sameAcceptedOutcome must be explicitly true');
      const proofKind = identifier(input.proofKind, 'proofKind');
      const proofFingerprint = fingerprint(input.proofFingerprint, 'proofFingerprint');
      if (!proofFingerprint) throw new TypeError('proofFingerprint is required');
      const replacementWork = normalizeWork(input.replacementWork ?? {}, 'replacementWork');
      const decisionOverheadCostUnits = finiteNonNegative(input.decisionOverheadCostUnits ?? 0, 'decisionOverheadCostUnits');
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
        proofKind,
        proofFingerprint,
        predictionPolicyFingerprint,
        captureMechanismFingerprint,
        sameAcceptedOutcome: true,
        replacementWork: cloneWork(replacementWork),
        decisionOverheadCostUnits
      });
      trajectory.alternatives.set(key, alternative);
      return alternative;
    });
  }

  finishTrajectory(input) {
    return this._account(() => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('finish input must be an object');
      const trajectory = this._requireTrajectory(input.trajectoryId);
      if (trajectory.endedAtMs !== undefined) throw new TypeError('trajectory already finished');
      const outcome = input.outcome;
      if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) throw new TypeError('outcome must be an object');
      const normalizedOutcome = Object.freeze({
        completed: boolean(outcome.completed, 'outcome.completed'),
        correct: boolean(outcome.correct, 'outcome.correct'),
        safetyAcceptable: boolean(outcome.safetyAcceptable, 'outcome.safetyAcceptable')
      });
      const outcomeEvidenceFingerprint = fingerprint(input.outcomeEvidenceFingerprint, 'outcomeEvidenceFingerprint');
      const endedAtMs = finiteNonNegative(input.endedAtMs ?? this._now(), 'endedAtMs');
      if (endedAtMs < trajectory.startedAtMs) throw new TypeError('endedAtMs must be >= startedAtMs');
      trajectory.outcome = normalizedOutcome;
      trajectory.outcomeEvidenceFingerprint = outcomeEvidenceFingerprint;
      trajectory.endedAtMs = endedAtMs;
      return this.getReport(trajectory.id);
    });
  }

  async measureOperation(input, fn) {
    if (typeof fn !== 'function') throw new TypeError('fn must be a function');
    const startedAtMs = this._now();
    let result;
    try {
      result = await fn();
    } catch (error) {
      const endedAtMs = this._now();
      try {
        this.recordOperation({
          ...input,
          status: 'error',
          startedAtMs,
          endedAtMs,
          work: { ...(input?.work ?? {}), wallMs: Math.max(0, endedAtMs - startedAtMs) }
        });
      } catch {
        this._measurementFailures += 1;
      }
      throw error;
    }
    const endedAtMs = this._now();
    try {
      let extraWork = {};
      if (typeof input?.workFromResult === 'function') {
        const extractorStarted = monotonicNow();
        try {
          extraWork = input.workFromResult(result) ?? {};
        } catch {
          this._measurementFailures += 1;
        } finally {
          this._extractorOverheadMs += Math.max(0, monotonicNow() - extractorStarted);
        }
      }
      this.recordOperation({
        ...input,
        status: 'ok',
        startedAtMs,
        endedAtMs,
        work: { ...(input?.work ?? {}), ...extraWork, wallMs: Math.max(0, endedAtMs - startedAtMs) }
      });
    } catch {
      this._measurementFailures += 1;
    }
    return result;
  }

  getReport(trajectoryId) {
    return this._account(() => {
      const trajectory = this._requireTrajectory(trajectoryId);
      const operations = [...trajectory.operations.values()];
      const alternatives = [...trajectory.alternatives.values()];
      const alternativesByOperation = new Map();
      for (const alternative of alternatives) {
        const bucket = alternativesByOperation.get(alternative.operationId);
        if (bucket) bucket.push(alternative);
        else alternativesByOperation.set(alternative.operationId, [alternative]);
      }
      const actualWork = {};
      for (const operation of operations) addWork(actualWork, operation.work);
      const allOperationsHaveCostUnits = operations.every(operation => operation.work.costUnits !== undefined);
      const admissibleOutcome = outcomeAdmissible(trajectory.outcome, trajectory.outcomeEvidenceFingerprint);
      const scalarAvailable = Boolean(trajectory.costUnitPolicyId) && Boolean(trajectory.costUnitPolicyFingerprint) && Boolean(trajectory.baselineEvidenceFingerprint) && operations.length > 0 && allOperationsHaveCostUnits && trajectory.endedAtMs !== undefined;
      const actualCostUnits = scalarAvailable ? operations.reduce((sum, operation) => sum + operation.work.costUnits, 0) : null;

      const tiers = {};
      for (const reportTier of ['oracle_theoretical', 'safely_predictable', 'currently_capturable']) {
        let minimum = actualCostUnits;
        let selected = [];
        if (scalarAvailable) {
          minimum = 0;
          for (const operation of operations) {
            const candidates = alternativesByOperation.get(operation.operationId) ?? [];
            let bestCost = operation.work.costUnits;
            let best = null;
            for (const candidate of candidates) {
              if (!tierEligible(candidate.tier, reportTier) || candidate.replacementWork.costUnits === undefined) continue;
              const candidateCost = replacementCost(candidate);
              if (candidateCost < bestCost) {
                bestCost = candidateCost;
                best = candidate;
              }
            }
            minimum += bestCost;
            if (best) selected.push(Object.freeze({ operation_id: operation.operationId, alternative_id: best.alternativeId, replacement_cost_units: bestCost }));
          }
        }
        const headroomPercent = scalarAvailable && admissibleOutcome ? percentHeadroom(actualCostUnits, minimum) : null;
        tiers[reportTier] = Object.freeze({
          minimum_cost_units: scalarAvailable ? minimum : null,
          headroom_percent: headroomPercent,
          selected_substitutions: Object.freeze(selected),
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
          actual_work: cloneWork(actualWork),
          profiler_accounting_overhead_ms: this._accountingOverheadMs,
          result_extractor_overhead_ms: this._extractorOverheadMs,
          measurement_failures: this._measurementFailures,
          headroom: Object.freeze(tiers),
          counterfactual_scope: 'single-operation-proven-substitutions-only',
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
          ended_at_ms: operation.endedAtMs ?? null
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
          next_step: scalarAvailable && admissibleOutcome ? 'RUN_GATE_A_B_ON_NATURAL_OR_LEGITIMATE_REPLAYED_TRAJECTORIES' : 'COLLECT_VALID_ACCOUNTING_WITH_ACCEPTED_OUTCOME'
        })
      });
    });
  }

  _requireTrajectory(trajectoryId) {
    const id = identifier(trajectoryId, 'trajectoryId');
    const trajectory = this._trajectories.get(id);
    if (!trajectory) throw new TypeError(`unknown trajectoryId: ${id}`);
    return trajectory;
  }
}

export function createShadowTrajectoryProfiler(options = {}) {
  return new ShadowTrajectoryProfiler(options);
}
