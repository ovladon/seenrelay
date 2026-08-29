const STATUSES = ['SAME_OBSERVED', 'CHANGED_OBSERVED', 'CONTESTED', 'STALE', 'UNKNOWN'];

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function nonNegativeFinite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return number;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${name} must be a positive integer`);
  return number;
}

function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('value is not JSON-serializable');
}

function emptyProof() {
  return {
    calls: 0,
    checksWithoutUsableResponse: 0,
    conditionalHintsSeen: 0,
    validationMsTotal: 0,
    sameObservedValidationMs: 0,
    sameObservedMatchesValidation: 0,
    sameObservedMismatchesValidation: 0,
    sameObservedComparisonUnavailable: 0,
    statuses: {
      SAME_OBSERVED: 0,
      CHANGED_OBSERVED: 0,
      CONTESTED: 0,
      STALE: 0,
      UNKNOWN: 0
    }
  };
}

function safetySummary(metrics) {
  const opportunities = metrics.statuses.SAME_OBSERVED;
  const comparable = metrics.sameObservedMatchesValidation + metrics.sameObservedMismatchesValidation;
  const agreementRate = comparable > 0 ? metrics.sameObservedMatchesValidation / comparable : null;

  if (opportunities === 0) {
    return { state: 'no_opportunities', pass: null, comparable, agreementRate };
  }
  if (metrics.sameObservedMismatchesValidation > 0) {
    return { state: 'fail', pass: false, comparable, agreementRate };
  }
  if (metrics.sameObservedComparisonUnavailable > 0) {
    return { state: 'incomplete', pass: null, comparable, agreementRate };
  }
  return { state: 'pass', pass: true, comparable, agreementRate };
}

function sanitizeControls(controls) {
  const names = ['local_cache', 'source_native_conditional', 'provider_native_cache'];
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    throw new TypeError('controls must be an object');
  }
  return Object.freeze(Object.fromEntries(names.map((name) => {
    const control = controls[name];
    if (!control || typeof control.available !== 'boolean' || typeof control.measured !== 'boolean') {
      throw new TypeError(`controls.${name} must declare available and measured booleans`);
    }
    return [name, Object.freeze({ available: control.available, measured: control.measured })];
  })));
}

/**
 * Measures SeenRelay in strict shadow mode: CHECK always runs, validation is
 * never suppressed, and the caller's existing validation remains authoritative.
 * No telemetry is uploaded by this helper. Raw values are not retained in its metrics.
 */
export class SeenRelayShadowProof {
  constructor(client, options = {}) {
    if (!client || typeof client.guardDetailed !== 'function' || typeof client.getTelemetry !== 'function') {
      throw new TypeError('client must be a SeenRelayClient-compatible instance');
    }
    this.client = client;
    this.metrics = emptyProof();
    this.benchmarkRecordLimit = positiveInteger(options.benchmarkRecordLimit ?? 10000, 'benchmarkRecordLimit');
    this.benchmarkRecords = [];
    this.benchmarkRecordsDropped = 0;
    this.benchmarkInvalidReasons = new Set();
  }

  reset() {
    this.metrics = emptyProof();
    this.benchmarkRecords = [];
    this.benchmarkRecordsDropped = 0;
    this.benchmarkInvalidReasons = new Set();
    if (typeof this.client.resetTelemetry === 'function') this.client.resetTelemetry();
  }

  snapshot() {
    const m = this.metrics;
    const safety = safetySummary(m);
    return Object.freeze({
      calls: m.calls,
      checksWithoutUsableResponse: m.checksWithoutUsableResponse,
      conditionalHintsSeen: m.conditionalHintsSeen,
      validationMsTotal: m.validationMsTotal,
      validationMsAverage: m.calls > 0 ? m.validationMsTotal / m.calls : 0,
      sameObservedValidationMs: m.sameObservedValidationMs,
      sameObservedMatchesValidation: m.sameObservedMatchesValidation,
      sameObservedMismatchesValidation: m.sameObservedMismatchesValidation,
      sameObservedComparisonUnavailable: m.sameObservedComparisonUnavailable,
      sameObservedComparable: safety.comparable,
      sameObservedAgreementRate: safety.agreementRate,
      safetyEvidence: safety.state,
      safetyPass: safety.pass,
      statuses: Object.freeze({ ...m.statuses })
    });
  }

  benchmarkSnapshot() {
    return Object.freeze({
      recordsRetained: this.benchmarkRecords.length,
      recordsDropped: this.benchmarkRecordsDropped,
      recordLimit: this.benchmarkRecordLimit,
      invalidReasons: Object.freeze([...this.benchmarkInvalidReasons]),
      rawValuesRetained: false,
      factIdentityRetained: false,
      timestampsRetained: false
    });
  }

  captureBenchmarkRecord(options, result) {
    const benchmark = options.benchmark;
    if (!benchmark) return;

    if (this.benchmarkRecords.length >= this.benchmarkRecordLimit) {
      this.benchmarkRecordsDropped += 1;
      return;
    }

    const timings = result?.timings;
    if (!timings || !Number.isFinite(timings.checkMs) || !Number.isFinite(timings.validationMs) || !Number.isFinite(timings.observeMs)) {
      this.benchmarkInvalidReasons.add('missing_or_invalid_call_timings');
      return;
    }

    const status = STATUSES.includes(result?.check?.status) ? result.check.status : null;
    let policyReusable = false;
    let reuseWouldMatchValidation = null;

    if (benchmark.reuse && result?.check) {
      let decision;
      try {
        decision = benchmark.reuse(result.check, options.knownValue);
      } catch {
        this.benchmarkInvalidReasons.add('reuse_policy_threw');
        return;
      }
      if (!decision || typeof decision.reuse !== 'boolean') {
        this.benchmarkInvalidReasons.add('reuse_policy_returned_invalid_decision');
        return;
      }
      if (decision.reuse) {
        if (status !== 'SAME_OBSERVED') {
          this.benchmarkInvalidReasons.add('reuse_policy_accepted_non_same_observed');
          return;
        }
        policyReusable = true;
        try {
          reuseWouldMatchValidation = stableJson(decision.value) === stableJson(result.value);
        } catch {
          reuseWouldMatchValidation = null;
        }
      }
    }

    const observeAfterBaseline = benchmark.observeAfterBaseline ?? true;
    if (typeof observeAfterBaseline !== 'boolean') {
      this.benchmarkInvalidReasons.add('observe_after_baseline_not_boolean');
      return;
    }

    let baselineCost;
    let checkCost;
    let observeCost;
    try {
      baselineCost = nonNegativeFinite(benchmark.baselineCost ?? 0, 'benchmark.baselineCost');
      checkCost = nonNegativeFinite(benchmark.checkCost ?? 0, 'benchmark.checkCost');
      observeCost = nonNegativeFinite(benchmark.observeCost ?? 0, 'benchmark.observeCost');
    } catch {
      this.benchmarkInvalidReasons.add('invalid_cost_input');
      return;
    }

    this.benchmarkRecords.push(Object.freeze({
      check_status: status,
      policy_reusable: policyReusable,
      reuse_would_match_validation: policyReusable ? reuseWouldMatchValidation : null,
      observe_after_baseline: observeAfterBaseline,
      baseline_ms: Math.max(0, timings.validationMs),
      baseline_cost: baselineCost,
      check_ms: Math.max(0, timings.checkMs),
      observe_ms: Math.max(0, timings.observeMs),
      check_cost: checkCost,
      observe_cost: observeCost
    }));
  }

  hostileBenchmarkInput({ workloadId = null, controls, observeOffCriticalPath = false } = {}) {
    const benchmark = this.benchmarkSnapshot();
    if (benchmark.invalidReasons.length > 0) throw new Error(`natural workload benchmark is incomplete: ${benchmark.invalidReasons.join(', ')}`);
    if (benchmark.recordsDropped > 0) throw new Error(`natural workload benchmark is incomplete: ${benchmark.recordsDropped} records exceeded the configured limit`);
    if (benchmark.recordsRetained === 0) throw new Error('no natural workload benchmark records were retained');
    if (workloadId !== null && typeof workloadId !== 'string') throw new TypeError('workloadId must be a string or null');
    if (typeof observeOffCriticalPath !== 'boolean') throw new TypeError('observeOffCriticalPath must be boolean');

    return Object.freeze({
      schema_version: 2,
      workload_id: workloadId,
      sample_type: 'natural_workload',
      baseline_definition: 'best_existing_non_shared_path',
      controls: sanitizeControls(controls),
      observe_off_critical_path: observeOffCriticalPath,
      records: Object.freeze(this.benchmarkRecords.map((record) => Object.freeze({ ...record })))
    });
  }

  async guard(options) {
    if (!options || typeof options.validate !== 'function') throw new TypeError('validate must be a function');
    let validationMs = 0;
    const originalValidate = options.validate;
    const result = await this.client.guardDetailed({
      ...options,
      // Shadow proof must never suppress validation. benchmark.reuse is simulated only after validation.
      reuse: undefined,
      validate: async (context) => {
        const started = nowMs();
        try {
          return await originalValidate(context);
        } finally {
          validationMs += Math.max(0, nowMs() - started);
        }
      }
    });

    this.metrics.calls += 1;
    this.metrics.validationMsTotal += validationMs;

    const status = result?.check?.status;
    if (STATUSES.includes(status)) {
      this.metrics.statuses[status] += 1;
      if (status === 'SAME_OBSERVED') {
        this.metrics.sameObservedValidationMs += validationMs;
        try {
          if (stableJson(options.knownValue) === stableJson(result.value)) {
            this.metrics.sameObservedMatchesValidation += 1;
          } else {
            this.metrics.sameObservedMismatchesValidation += 1;
          }
        } catch {
          this.metrics.sameObservedComparisonUnavailable += 1;
        }
      }
    } else {
      this.metrics.checksWithoutUsableResponse += 1;
    }

    if (result?.check?.conditional_request_hint && typeof result.check.conditional_request_hint === 'object') {
      this.metrics.conditionalHintsSeen += 1;
    }

    this.captureBenchmarkRecord(options, result);
    return result.value;
  }

  report({ avoidedValidationCost = 0, checkRequestCost = 0, observeRequestCost = 0, observeOffCriticalPath = false } = {}) {
    const avoided = nonNegativeFinite(avoidedValidationCost, 'avoidedValidationCost');
    const checkCost = nonNegativeFinite(checkRequestCost, 'checkRequestCost');
    const observeCost = nonNegativeFinite(observeRequestCost, 'observeRequestCost');
    const proof = this.snapshot();
    const relay = this.client.getTelemetry();

    const same = proof.statuses.SAME_OBSERVED;
    const calls = proof.calls;
    const observedSameRate = calls > 0 ? same / calls : 0;
    const prospectiveObserveRequests = Math.max(0, relay.observeNetworkRequests - same);

    const grossPotentialSavings = same * avoided;
    const prospectiveRelayRequestCost = relay.checkNetworkRequests * checkCost + prospectiveObserveRequests * observeCost;
    const netPotentialSavings = grossPotentialSavings - prospectiveRelayRequestCost;

    const checkAverageMs = relay.checkNetworkLatencyMsAverage || 0;
    const observeAverageMs = relay.observeNetworkLatencyMsAverage || 0;
    const validationAverageMs = proof.validationMsAverage;
    const offCriticalPath = observeOffCriticalPath === true;
    const prospectiveRelayLatencyMs = relay.checkNetworkLatencyMsTotal + (offCriticalPath ? 0 : prospectiveObserveRequests * observeAverageMs);
    const potentialNetTimeSavedMs = proof.sameObservedValidationMs - prospectiveRelayLatencyMs;

    const breakEvenReuseRateByTime = offCriticalPath
      ? (validationAverageMs > 0 ? checkAverageMs / validationAverageMs : null)
      : (validationAverageMs + observeAverageMs > 0
        ? (checkAverageMs + observeAverageMs) / (validationAverageMs + observeAverageMs)
        : null);
    const breakEvenReuseRateByCost = avoided + observeCost > 0
      ? (checkCost + observeCost) / (avoided + observeCost)
      : null;

    const safetyAdjustedGrossPotentialSavings = proof.safetyPass === true ? grossPotentialSavings : null;
    const safetyAdjustedNetPotentialSavings = proof.safetyPass === true ? netPotentialSavings : null;

    return Object.freeze({
      mode: 'shadow-proof',
      calls,
      statusCounts: proof.statuses,
      observedSameRate,
      conditionalHintsSeen: proof.conditionalHintsSeen,
      validationMsAverage: validationAverageMs,
      checkNetworkLatencyMsAverage: checkAverageMs,
      observeNetworkLatencyMsAverage: observeAverageMs,
      potentialValidationCallsAvoided: same,
      grossPotentialSavings,
      prospectiveRelayRequestCost,
      netPotentialSavings,
      sameObservedValidationMs: proof.sameObservedValidationMs,
      sameObservedMatchesValidation: proof.sameObservedMatchesValidation,
      sameObservedMismatchesValidation: proof.sameObservedMismatchesValidation,
      sameObservedComparisonUnavailable: proof.sameObservedComparisonUnavailable,
      sameObservedComparable: proof.sameObservedComparable,
      sameObservedAgreementRate: proof.sameObservedAgreementRate,
      safetyEvidence: proof.safetyEvidence,
      safetyPass: proof.safetyPass,
      safetyAdjustedGrossPotentialSavings,
      safetyAdjustedNetPotentialSavings,
      prospectiveRelayLatencyMs,
      potentialNetTimeSavedMs,
      breakEvenReuseRateByTime,
      breakEvenReuseRateByCost,
      assumptions: Object.freeze({
        directReuseOnly: true,
        conditionalRequestSavingsExcluded: true,
        activeModeWouldNotObserveDirectReuseHits: true,
        callerSuppliedCostUnits: true,
        noSavingsClaimWhenSameObservedIsZero: true,
        authoritativeValidationAlwaysRuns: true,
        rawValuesRetainedByShadowProof: false,
        observeOffCriticalPath: offCriticalPath
      })
    });
  }
}
