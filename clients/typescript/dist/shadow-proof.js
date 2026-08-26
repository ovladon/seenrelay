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

function emptyProof() {
  return {
    calls: 0,
    checksWithoutUsableResponse: 0,
    conditionalHintsSeen: 0,
    validationMsTotal: 0,
    sameObservedValidationMs: 0,
    statuses: {
      SAME_OBSERVED: 0,
      CHANGED_OBSERVED: 0,
      CONTESTED: 0,
      STALE: 0,
      UNKNOWN: 0
    }
  };
}

/**
 * Measures SeenRelay in strict shadow mode: CHECK always runs, validation is
 * never suppressed, and the caller's existing validation remains authoritative.
 * No telemetry is uploaded by this helper.
 */
export class SeenRelayShadowProof {
  constructor(client) {
    if (!client || typeof client.guardDetailed !== 'function' || typeof client.getTelemetry !== 'function') {
      throw new TypeError('client must be a SeenRelayClient-compatible instance');
    }
    this.client = client;
    this.metrics = emptyProof();
  }

  reset() {
    this.metrics = emptyProof();
    if (typeof this.client.resetTelemetry === 'function') this.client.resetTelemetry();
  }

  snapshot() {
    const m = this.metrics;
    return Object.freeze({
      calls: m.calls,
      checksWithoutUsableResponse: m.checksWithoutUsableResponse,
      conditionalHintsSeen: m.conditionalHintsSeen,
      validationMsTotal: m.validationMsTotal,
      validationMsAverage: m.calls > 0 ? m.validationMsTotal / m.calls : 0,
      sameObservedValidationMs: m.sameObservedValidationMs,
      statuses: Object.freeze({ ...m.statuses })
    });
  }

  async guard(options) {
    if (!options || typeof options.validate !== 'function') throw new TypeError('validate must be a function');
    let validationMs = 0;
    const originalValidate = options.validate;
    const result = await this.client.guardDetailed({
      ...options,
      // Shadow proof must never suppress validation.
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
      if (status === 'SAME_OBSERVED') this.metrics.sameObservedValidationMs += validationMs;
    } else {
      this.metrics.checksWithoutUsableResponse += 1;
    }

    if (result?.check?.conditional_request_hint && typeof result.check.conditional_request_hint === 'object') {
      this.metrics.conditionalHintsSeen += 1;
    }

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
        observeOffCriticalPath: offCriticalPath
      })
    });
  }
}
