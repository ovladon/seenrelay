const STATUSES = new Set(['SAME_OBSERVED', 'CHANGED_OBSERVED', 'CONTESTED', 'STALE', 'UNKNOWN']);
const CONTROL_NAMES = ['local_cache', 'source_native_conditional', 'provider_native_cache'];

function nonNegative(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return n;
}

function percentile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function compare(candidate, baseline) {
  if (candidate < baseline) return 'better';
  if (candidate > baseline) return 'worse';
  return 'equal';
}

function safetySummary(opportunities, unsafe, unavailable) {
  if (opportunities === 0) return { state: 'no_opportunities', pass: null };
  if (unsafe > 0) return { state: 'fail', pass: false };
  if (unavailable > 0) return { state: 'incomplete', pass: null };
  return { state: 'pass', pass: true };
}

function validateEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
    throw new TypeError('evaluation must be an object returned by evaluateHostileBenchmark');
  }
  if (!Number.isInteger(evaluation.calls) || evaluation.calls < 1) {
    throw new TypeError('evaluation.calls must be a positive integer');
  }
  if (!['natural_workload', 'fixed_fact_smoke'].includes(evaluation.sample_type)) {
    throw new TypeError('evaluation.sample_type is invalid');
  }
  if (!evaluation.controls || typeof evaluation.controls !== 'object' || Array.isArray(evaluation.controls)) {
    throw new TypeError('evaluation.controls must be an object');
  }
  for (const name of CONTROL_NAMES) {
    const control = evaluation.controls[name];
    if (!control || typeof control.available !== 'boolean' || typeof control.measured !== 'boolean') {
      throw new TypeError(`evaluation.controls.${name} must declare available and measured booleans`);
    }
  }
  if (!Number.isInteger(evaluation.unsafe_hypothetical_reuses) || evaluation.unsafe_hypothetical_reuses < 0) {
    throw new TypeError('evaluation.unsafe_hypothetical_reuses must be a non-negative integer');
  }
  if (!Number.isInteger(evaluation.reuse_comparison_unavailable) || evaluation.reuse_comparison_unavailable < 0) {
    throw new TypeError('evaluation.reuse_comparison_unavailable must be a non-negative integer');
  }
  if (!Number.isInteger(evaluation.policy_accepted_reuses) || evaluation.policy_accepted_reuses < 0) {
    throw new TypeError('evaluation.policy_accepted_reuses must be a non-negative integer');
  }
  if (!evaluation.safety || typeof evaluation.safety !== 'object') {
    throw new TypeError('evaluation.safety must be an object');
  }
  if (!evaluation.decision || typeof evaluation.decision !== 'object') {
    throw new TypeError('evaluation.decision must be an object');
  }
  if (evaluation.decision.automatic_reuse_enabled_by_evaluator !== false) {
    throw new TypeError('evaluation must preserve automatic_reuse_enabled_by_evaluator=false');
  }
}

/**
 * Convert one hostile benchmark evaluation into the public three-way audit verdict.
 *
 * This deliberately reuses the same conservative evidence rules as the natural-workload
 * gate. An observed hypothetical-reuse mismatch is a hard negative even when the sample
 * is still small. Otherwise a natural workload must meet the sample floor and comparison
 * completeness before it can receive USE or a conclusive economics-based DO NOT USE.
 * The classifier never enables reuse.
 */
export function classifyHostileBenchmarkVerdict(evaluation, { minimumCalls = 100 } = {}) {
  validateEvaluation(evaluation);
  if (!Number.isInteger(minimumCalls) || minimumCalls < 1) {
    throw new TypeError('minimumCalls must be a positive integer');
  }

  const sampleFloorMet = evaluation.calls >= minimumCalls;
  const comparisonComplete = evaluation.reuse_comparison_unavailable === 0;
  const controlsComplete = CONTROL_NAMES.every((name) => {
    const control = evaluation.controls[name];
    return control.available === false || control.measured === true;
  });
  const naturalWorkload = evaluation.sample_type === 'natural_workload' && evaluation.evidence_scope === 'workload_evidence';
  const unsafe = evaluation.unsafe_hypothetical_reuses > 0 || evaluation.safety.state === 'fail' || evaluation.safety.pass === false;
  const reasons = [];
  let verdict;

  if (!naturalWorkload) {
    verdict = 'INSUFFICIENT EVIDENCE';
    reasons.push('natural_workload_required');
  } else if (unsafe) {
    verdict = 'DO NOT USE';
    reasons.push('unsafe_hypothetical_reuse');
  } else if (!controlsComplete) {
    verdict = 'INSUFFICIENT EVIDENCE';
    reasons.push('stronger_native_control_unmeasured');
  } else if (!comparisonComplete || evaluation.safety.state === 'incomplete') {
    verdict = 'INSUFFICIENT EVIDENCE';
    reasons.push('reuse_comparison_incomplete');
  } else if (!sampleFloorMet) {
    verdict = 'INSUFFICIENT EVIDENCE';
    reasons.push('sample_below_minimum');
  } else if (evaluation.safety.state === 'no_opportunities' || evaluation.policy_accepted_reuses === 0) {
    verdict = 'DO NOT USE';
    reasons.push('no_policy_accepted_reuse_opportunities');
  } else if (evaluation.decision.safety_pass !== true) {
    verdict = 'INSUFFICIENT EVIDENCE';
    reasons.push('safety_not_established');
  } else if (evaluation.decision.beats_baseline_on_both === true) {
    verdict = 'USE';
    reasons.push('safe_candidate_beats_best_existing_path_on_cost_and_latency');
  } else {
    verdict = 'DO NOT USE';
    if (evaluation.decision.positive_on_latency !== true) reasons.push('latency_not_better_than_best_existing_path');
    if (evaluation.decision.positive_on_cost !== true) reasons.push('cost_not_better_than_best_existing_path');
    if (reasons.length === 0) reasons.push('best_existing_path_not_beaten');
  }

  return Object.freeze({
    verdict,
    reasons: Object.freeze(reasons),
    minimum_calls: minimumCalls,
    calls: evaluation.calls,
    sample_floor_met: sampleFloorMet,
    comparison_complete: comparisonComplete,
    controls_complete: controlsComplete,
    safety_state: evaluation.safety.state,
    policy_accepted_reuses: evaluation.policy_accepted_reuses,
    latency_outcome: evaluation.latency?.outcome ?? null,
    cost_outcome: evaluation.cost?.outcome ?? null,
    automatic_reuse_enabled: false
  });
}

/**
 * Evaluate natural-workload or mechanics-only evidence against the best measured
 * non-shared validation path. The evaluator never enables reuse.
 */
export function evaluateHostileBenchmark(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('benchmark input must be an object');
  if (![1, 2].includes(input.schema_version)) throw new TypeError('schema_version must be 1 or 2');
  const schemaV2 = input.schema_version === 2;
  if (!['natural_workload', 'fixed_fact_smoke'].includes(input.sample_type)) {
    throw new TypeError('sample_type must be natural_workload or fixed_fact_smoke');
  }
  if (input.baseline_definition !== 'best_existing_non_shared_path') {
    throw new TypeError('baseline_definition must be best_existing_non_shared_path');
  }

  const controls = input.controls;
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) throw new TypeError('controls must be an object');
  for (const name of CONTROL_NAMES) {
    const control = controls[name];
    if (!control || typeof control.available !== 'boolean' || typeof control.measured !== 'boolean') {
      throw new TypeError(`controls.${name} must declare available and measured booleans`);
    }
    if (control.available && !control.measured) {
      throw new Error(`hostile benchmark incomplete: ${name} is available but was not measured`);
    }
  }

  if (!Array.isArray(input.records) || input.records.length === 0) throw new TypeError('records must be a non-empty array');
  const observeOffCriticalPath = input.observe_off_critical_path === true;

  const baselineLatency = [];
  const prospectiveLatency = [];
  const baselineCost = [];
  const prospectiveCost = [];
  const statusCounts = Object.fromEntries([...STATUSES].map((status) => [status, 0]));
  statusCounts.CHECK_UNAVAILABLE = 0;
  let policyAcceptedReuses = 0;
  let unsafeHypotheticalReuses = 0;
  let comparisonUnavailable = 0;
  let prospectiveObserveRequests = 0;

  input.records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError(`records[${index}] must be an object`);
    const checkStatus = record.check_status;
    if (schemaV2) {
      if (checkStatus !== null && !STATUSES.has(checkStatus)) throw new TypeError(`records[${index}].check_status is invalid`);
    } else if (!STATUSES.has(checkStatus)) {
      throw new TypeError(`records[${index}].check_status is invalid`);
    }
    if (typeof record.policy_reusable !== 'boolean') throw new TypeError(`records[${index}].policy_reusable must be boolean`);
    if (typeof record.observe_after_baseline !== 'boolean') throw new TypeError(`records[${index}].observe_after_baseline must be boolean`);
    if (record.policy_reusable && checkStatus !== 'SAME_OBSERVED') {
      throw new Error(`records[${index}] cannot be policy_reusable unless CHECK is SAME_OBSERVED`);
    }
    if (record.policy_reusable) {
      if (schemaV2) {
        if (record.reuse_would_match_validation !== null && typeof record.reuse_would_match_validation !== 'boolean') {
          throw new TypeError(`records[${index}].reuse_would_match_validation must be boolean or null for policy-reusable records`);
        }
      } else if (typeof record.reuse_would_match_validation !== 'boolean') {
        throw new TypeError(`records[${index}].reuse_would_match_validation must be boolean for policy-reusable records`);
      }
    }

    const baseMs = nonNegative(record.baseline_ms, `records[${index}].baseline_ms`);
    const baseCost = nonNegative(record.baseline_cost, `records[${index}].baseline_cost`);
    const checkMs = nonNegative(record.check_ms, `records[${index}].check_ms`);
    const observeMs = nonNegative(record.observe_ms, `records[${index}].observe_ms`);
    const checkCost = nonNegative(record.check_cost, `records[${index}].check_cost`);
    const observeCost = nonNegative(record.observe_cost, `records[${index}].observe_cost`);

    const reuse = checkStatus === 'SAME_OBSERVED' && record.policy_reusable;
    const observe = !reuse && record.observe_after_baseline;
    if (checkStatus === null) statusCounts.CHECK_UNAVAILABLE += 1;
    else statusCounts[checkStatus] += 1;
    if (reuse) {
      policyAcceptedReuses += 1;
      if (record.reuse_would_match_validation === false) unsafeHypotheticalReuses += 1;
      if (record.reuse_would_match_validation === null) comparisonUnavailable += 1;
    }
    if (observe) prospectiveObserveRequests += 1;

    baselineLatency.push(baseMs);
    baselineCost.push(baseCost);
    prospectiveLatency.push(checkMs + (reuse ? 0 : baseMs) + (observe && !observeOffCriticalPath ? observeMs : 0));
    prospectiveCost.push(checkCost + (reuse ? 0 : baseCost) + (observe ? observeCost : 0));
  });

  const baselineLatencyTotal = sum(baselineLatency);
  const prospectiveLatencyTotal = sum(prospectiveLatency);
  const baselineCostTotal = sum(baselineCost);
  const prospectiveCostTotal = sum(prospectiveCost);
  const calls = input.records.length;
  const safety = safetySummary(policyAcceptedReuses, unsafeHypotheticalReuses, comparisonUnavailable);
  const positiveOnLatency = prospectiveLatencyTotal < baselineLatencyTotal;
  const positiveOnCost = prospectiveCostTotal < baselineCostTotal;

  return Object.freeze({
    schema_version: input.schema_version,
    evaluator_version: 2,
    workload_id: typeof input.workload_id === 'string' ? input.workload_id : null,
    sample_type: input.sample_type,
    evidence_scope: input.sample_type === 'natural_workload' ? 'workload_evidence' : 'mechanics_only',
    baseline_definition: input.baseline_definition,
    controls,
    observe_off_critical_path: observeOffCriticalPath,
    calls,
    status_counts: statusCounts,
    policy_accepted_reuses: policyAcceptedReuses,
    policy_accepted_reuse_rate: policyAcceptedReuses / calls,
    unsafe_hypothetical_reuses: unsafeHypotheticalReuses,
    reuse_comparison_unavailable: comparisonUnavailable,
    prospective_observe_requests: prospectiveObserveRequests,
    safety: {
      authoritative_shadow_validation_required: true,
      policy_reuse_opportunities: policyAcceptedReuses,
      unsafe_hypothetical_reuses: unsafeHypotheticalReuses,
      comparison_unavailable: comparisonUnavailable,
      state: safety.state,
      pass: safety.pass
    },
    latency: {
      baseline_total_ms: baselineLatencyTotal,
      prospective_total_ms: prospectiveLatencyTotal,
      delta_ms: prospectiveLatencyTotal - baselineLatencyTotal,
      outcome: compare(prospectiveLatencyTotal, baselineLatencyTotal),
      improvement_percent: baselineLatencyTotal > 0 ? ((baselineLatencyTotal - prospectiveLatencyTotal) / baselineLatencyTotal) * 100 : null,
      baseline_p50_ms: percentile(baselineLatency, 0.5),
      baseline_p95_ms: percentile(baselineLatency, 0.95),
      prospective_p50_ms: percentile(prospectiveLatency, 0.5),
      prospective_p95_ms: percentile(prospectiveLatency, 0.95)
    },
    cost: {
      baseline_total_units: baselineCostTotal,
      prospective_total_units: prospectiveCostTotal,
      delta_units: prospectiveCostTotal - baselineCostTotal,
      outcome: compare(prospectiveCostTotal, baselineCostTotal),
      improvement_percent: baselineCostTotal > 0 ? ((baselineCostTotal - prospectiveCostTotal) / baselineCostTotal) * 100 : null
    },
    decision: {
      safety_pass: safety.pass,
      evidence_ready: safety.pass === true,
      positive_on_latency: positiveOnLatency,
      positive_on_cost: positiveOnCost,
      beats_baseline_on_both: safety.pass === true && positiveOnLatency && positiveOnCost,
      automatic_reuse_enabled_by_evaluator: false
    }
  });
}
