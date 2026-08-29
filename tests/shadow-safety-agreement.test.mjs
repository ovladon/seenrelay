import test from 'node:test';
import assert from 'node:assert/strict';

import { SeenRelayShadowProof } from '../clients/typescript/dist/shadow-proof.js';

class SafetyClient {
  constructor(statuses) {
    this.statuses = [...statuses];
    this.telemetry = {
      checkNetworkRequests: 0,
      checkNetworkLatencyMsTotal: 0,
      checkNetworkLatencyMsAverage: 0,
      observeNetworkRequests: 0,
      observeNetworkLatencyMsTotal: 0,
      observeNetworkLatencyMsAverage: 0
    };
  }

  async guardDetailed(options) {
    assert.equal(options.reuse, undefined, 'shadow safety measurement must never enable reuse');
    const status = this.statuses.shift();
    this.telemetry.checkNetworkRequests += 1;
    this.telemetry.checkNetworkLatencyMsTotal += 1;
    this.telemetry.checkNetworkLatencyMsAverage = this.telemetry.checkNetworkLatencyMsTotal / this.telemetry.checkNetworkRequests;
    const check = status ? { status } : null;
    const value = await options.validate({ check, conditionalHeaders: {} });
    this.telemetry.observeNetworkRequests += 1;
    this.telemetry.observeNetworkLatencyMsTotal += 1;
    this.telemetry.observeNetworkLatencyMsAverage = this.telemetry.observeNetworkLatencyMsTotal / this.telemetry.observeNetworkRequests;
    return { value, check, relay: { checkOk: Boolean(check), observeOk: true } };
  }

  getTelemetry() { return { ...this.telemetry }; }
  resetTelemetry() {
    this.telemetry = {
      checkNetworkRequests: 0,
      checkNetworkLatencyMsTotal: 0,
      checkNetworkLatencyMsAverage: 0,
      observeNetworkRequests: 0,
      observeNetworkLatencyMsTotal: 0,
      observeNetworkLatencyMsAverage: 0
    };
  }
}

const fact = {
  subject: 'shadow-safety-fixture',
  predicate: 'fixture.value',
  source: 'https://example.invalid/shadow-safety'
};

test('SAME_OBSERVED agreement passes only after authoritative validation still runs', async () => {
  const proof = new SeenRelayShadowProof(new SafetyClient(['SAME_OBSERVED']));
  let validations = 0;
  const value = await proof.guard({
    fact,
    knownValue: { state: 'ready', count: 2 },
    validate: async () => {
      validations += 1;
      return { count: 2, state: 'ready' };
    }
  });

  assert.deepEqual(value, { count: 2, state: 'ready' });
  assert.equal(validations, 1);

  const snapshot = proof.snapshot();
  assert.equal(snapshot.sameObservedMatchesValidation, 1);
  assert.equal(snapshot.sameObservedMismatchesValidation, 0);
  assert.equal(snapshot.sameObservedComparisonUnavailable, 0);
  assert.equal(snapshot.sameObservedAgreementRate, 1);
  assert.equal(snapshot.safetyEvidence, 'pass');
  assert.equal(snapshot.safetyPass, true);

  const report = proof.report({ avoidedValidationCost: 2, checkRequestCost: 0.1, observeRequestCost: 0.1 });
  assert.equal(report.safetyAdjustedGrossPotentialSavings, report.grossPotentialSavings);
  assert.equal(report.safetyAdjustedNetPotentialSavings, report.netPotentialSavings);
  assert.equal(report.assumptions.authoritativeValidationAlwaysRuns, true);
  assert.equal(report.assumptions.rawValuesRetainedByShadowProof, false);
});

test('one SAME_OBSERVED disagreement fails safety evidence regardless of potential savings', async () => {
  const proof = new SeenRelayShadowProof(new SafetyClient(['SAME_OBSERVED']));
  await proof.guard({
    fact,
    knownValue: 'old-value',
    validate: () => 'new-value'
  });

  const snapshot = proof.snapshot();
  assert.equal(snapshot.sameObservedMatchesValidation, 0);
  assert.equal(snapshot.sameObservedMismatchesValidation, 1);
  assert.equal(snapshot.safetyEvidence, 'fail');
  assert.equal(snapshot.safetyPass, false);

  const report = proof.report({ avoidedValidationCost: 1000 });
  assert.equal(report.grossPotentialSavings, 1000);
  assert.equal(report.safetyAdjustedGrossPotentialSavings, null);
  assert.equal(report.safetyAdjustedNetPotentialSavings, null);
});

test('non-deterministically comparable SAME_OBSERVED value produces incomplete evidence, never a pass', async () => {
  const proof = new SeenRelayShadowProof(new SafetyClient(['SAME_OBSERVED']));
  await proof.guard({
    fact,
    knownValue: undefined,
    validate: () => undefined
  });

  const snapshot = proof.snapshot();
  assert.equal(snapshot.sameObservedComparisonUnavailable, 1);
  assert.equal(snapshot.sameObservedComparable, 0);
  assert.equal(snapshot.sameObservedAgreementRate, null);
  assert.equal(snapshot.safetyEvidence, 'incomplete');
  assert.equal(snapshot.safetyPass, null);
  assert.equal(proof.report({ avoidedValidationCost: 1000 }).safetyAdjustedNetPotentialSavings, null);
});

test('no SAME_OBSERVED opportunity cannot be misrepresented as a safety pass', async () => {
  const proof = new SeenRelayShadowProof(new SafetyClient(['UNKNOWN']));
  await proof.guard({ fact, knownValue: 'known', validate: () => 'authoritative' });

  const snapshot = proof.snapshot();
  assert.equal(snapshot.safetyEvidence, 'no_opportunities');
  assert.equal(snapshot.safetyPass, null);
  assert.equal(snapshot.sameObservedComparable, 0);
  assert.equal(proof.report().safetyAdjustedGrossPotentialSavings, null);
});

test('shadow safety metrics retain counters only, not compared raw values', async () => {
  const knownSecret = 'RAW-KNOWN-SENTINEL-7xQ2';
  const validatedSecret = 'RAW-VALIDATED-SENTINEL-9mP4';
  const proof = new SeenRelayShadowProof(new SafetyClient(['SAME_OBSERVED']));

  await proof.guard({ fact, knownValue: knownSecret, validate: () => validatedSecret });

  const serialized = JSON.stringify({ snapshot: proof.snapshot(), report: proof.report() });
  assert.doesNotMatch(serialized, new RegExp(knownSecret));
  assert.doesNotMatch(serialized, new RegExp(validatedSecret));
  assert.match(serialized, /sameObservedMismatchesValidation/);
  assert.match(serialized, /rawValuesRetainedByShadowProof/);
});
