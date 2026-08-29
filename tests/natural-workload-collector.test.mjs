import test from 'node:test';
import assert from 'node:assert/strict';

import { SeenRelayShadowProof } from '../clients/typescript/dist/shadow-proof.js';
import { evaluateHostileBenchmark } from '../scripts/evaluate-hostile-benchmark.mjs';

const controls = {
  local_cache: { available: true, measured: true },
  source_native_conditional: { available: false, measured: false },
  provider_native_cache: { available: true, measured: true }
};

class NaturalClient {
  constructor(entries) {
    this.entries = [...entries];
  }

  async guardDetailed(options) {
    assert.equal(options.reuse, undefined, 'natural workload collection must remain strict shadow mode');
    const entry = this.entries.shift();
    if (!entry) throw new Error('missing fake entry');
    const check = entry.status ? { status: entry.status } : null;
    const value = await options.validate({ check, conditionalHeaders: {} });
    return {
      value,
      path: 'validated',
      check,
      relay: {
        checkOk: Boolean(check),
        observeOk: true,
        observeDeferred: false
      },
      timings: {
        checkMs: entry.checkMs ?? 10,
        validationMs: entry.validationMs ?? 100,
        observeMs: entry.observeMs ?? 20
      }
    };
  }

  getTelemetry() {
    return {
      checkNetworkRequests: 0,
      checkNetworkLatencyMsTotal: 0,
      checkNetworkLatencyMsAverage: 0,
      observeNetworkRequests: 0,
      observeNetworkLatencyMsTotal: 0,
      observeNetworkLatencyMsAverage: 0
    };
  }

  resetTelemetry() {}
}

function sameReuse(_check, knownValue) {
  return { reuse: true, value: knownValue };
}

test('natural workload export contains only sanitized benchmark fields', async () => {
  const secretFact = 'PRIVATE-FACT-SENTINEL';
  const secretSource = 'https://private.example/PRIVATE-SOURCE-SENTINEL';
  const secretValue = 'PRIVATE-VALUE-SENTINEL';
  const client = new NaturalClient([
    { status: 'SAME_OBSERVED', checkMs: 12, validationMs: 800, observeMs: 30 },
    { status: null, checkMs: 50, validationMs: 200, observeMs: 15 }
  ]);
  const proof = new SeenRelayShadowProof(client);

  await proof.guard({
    fact: { subject: secretFact, predicate: 'private.current', source: secretSource },
    knownValue: secretValue,
    validate: () => secretValue,
    benchmark: {
      reuse: sameReuse,
      baselineCost: 5,
      checkCost: 0.1,
      observeCost: 0.1,
      raw_value: secretValue
    }
  });

  await proof.guard({
    fact: { subject: `${secretFact}-2`, predicate: 'private.current', source: `${secretSource}/2` },
    knownValue: `${secretValue}-2`,
    validate: () => `${secretValue}-2`,
    benchmark: {
      reuse: sameReuse,
      baselineCost: 1,
      checkCost: 0.1,
      observeCost: 0.1
    }
  });

  const input = proof.hostileBenchmarkInput({ workloadId: 'opaque-run-1', controls });
  const serialized = JSON.stringify(input);

  assert.equal(input.schema_version, 2);
  assert.equal(input.records.length, 2);
  assert.equal(input.records[0].check_status, 'SAME_OBSERVED');
  assert.equal(input.records[0].policy_reusable, true);
  assert.equal(input.records[0].reuse_would_match_validation, true);
  assert.equal(input.records[1].check_status, null);
  assert.equal(input.records[1].policy_reusable, false);
  assert.equal(input.records[1].baseline_ms, 200);
  assert.equal(input.records[1].check_ms, 50);
  assert.equal(input.records[1].observe_ms, 15);
  assert.equal(serialized.includes(secretFact), false);
  assert.equal(serialized.includes(secretSource), false);
  assert.equal(serialized.includes(secretValue), false);
  assert.equal(serialized.includes('raw_value'), false);
  assert.equal(serialized.includes('knownValue'), false);
  assert.equal(serialized.includes('fact'), false);

  const snapshot = proof.benchmarkSnapshot();
  assert.equal(snapshot.rawValuesRetained, false);
  assert.equal(snapshot.factIdentityRetained, false);
  assert.equal(snapshot.timestampsRetained, false);
  assert.equal(snapshot.recordsDropped, 0);

  const report = evaluateHostileBenchmark(input);
  assert.equal(report.calls, 2);
  assert.equal(report.status_counts.CHECK_UNAVAILABLE, 1);
  assert.equal(report.safety.state, 'pass');
  assert.equal(report.decision.automatic_reuse_enabled_by_evaluator, false);
});

test('uncomparable policy reuse becomes incomplete evidence', async () => {
  const client = new NaturalClient([{ status: 'SAME_OBSERVED' }]);
  const proof = new SeenRelayShadowProof(client);
  const value = 10n;

  await proof.guard({
    fact: { subject: 'opaque', predicate: 'opaque.current', source: 'https://example.invalid' },
    knownValue: value,
    validate: () => value,
    benchmark: { reuse: sameReuse, baselineCost: 1 }
  });

  const input = proof.hostileBenchmarkInput({ controls });
  assert.equal(input.records[0].reuse_would_match_validation, null);
  const report = evaluateHostileBenchmark(input);
  assert.equal(report.safety.state, 'incomplete');
  assert.equal(report.decision.safety_pass, null);
  assert.equal(report.decision.beats_baseline_on_both, false);
});

test('record overflow invalidates export instead of silently biasing the sample', async () => {
  const client = new NaturalClient([
    { status: 'UNKNOWN' },
    { status: 'UNKNOWN' }
  ]);
  const proof = new SeenRelayShadowProof(client, { benchmarkRecordLimit: 1 });

  for (let i = 0; i < 2; i += 1) {
    await proof.guard({
      fact: { subject: `f${i}`, predicate: 'status.current', source: 'https://example.invalid' },
      knownValue: i,
      validate: () => i,
      benchmark: { baselineCost: 1 }
    });
  }

  const snapshot = proof.benchmarkSnapshot();
  assert.equal(snapshot.recordsRetained, 1);
  assert.equal(snapshot.recordsDropped, 1);
  assert.throws(() => proof.hostileBenchmarkInput({ controls }), /records exceeded the configured limit/);
});

test('an invalid simulated reuse policy cannot produce benchmark evidence', async () => {
  const client = new NaturalClient([{ status: 'CHANGED_OBSERVED' }]);
  const proof = new SeenRelayShadowProof(client);

  await proof.guard({
    fact: { subject: 'f', predicate: 'status.current', source: 'https://example.invalid' },
    knownValue: 'old',
    validate: () => 'new',
    benchmark: {
      reuse: (_check, knownValue) => ({ reuse: true, value: knownValue }),
      baselineCost: 1
    }
  });

  assert.deepEqual(proof.benchmarkSnapshot().invalidReasons, ['reuse_policy_accepted_non_same_observed']);
  assert.throws(() => proof.hostileBenchmarkInput({ controls }), /reuse_policy_accepted_non_same_observed/);
});
