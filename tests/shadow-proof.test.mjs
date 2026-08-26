import test from 'node:test';
import assert from 'node:assert/strict';

import { SeenRelayShadowProof } from '../clients/typescript/dist/shadow-proof.js';

class FakeClient {
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
    assert.equal(options.reuse, undefined, 'Shadow Proof must force validation to remain enabled');
    const status = this.statuses.shift();
    this.telemetry.checkNetworkRequests += 1;
    this.telemetry.checkNetworkLatencyMsTotal += 2;
    this.telemetry.checkNetworkLatencyMsAverage = this.telemetry.checkNetworkLatencyMsTotal / this.telemetry.checkNetworkRequests;

    const check = status ? {
      status,
      ...(status === 'SAME_OBSERVED' ? {
        conditional_request_hint: { request_header: 'If-None-Match', header_value: '"abc"' }
      } : {})
    } : null;

    const value = await options.validate({ check, conditionalHeaders: {} });
    this.telemetry.observeNetworkRequests += 1;
    this.telemetry.observeNetworkLatencyMsTotal += 3;
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

test('Shadow Proof measures potential reuse without suppressing validation', async () => {
  const client = new FakeClient(['SAME_OBSERVED', 'UNKNOWN']);
  const proof = new SeenRelayShadowProof(client);
  let validations = 0;

  for (let index = 0; index < 2; index += 1) {
    const value = await proof.guard({
      fact: { source_url: 'https://example.invalid/status', predicate: 'status.value' },
      knownValue: 'ok',
      validate: async () => {
        validations += 1;
        await new Promise((resolve) => setTimeout(resolve, 2));
        return 'ok';
      }
    });
    assert.equal(value, 'ok');
  }

  assert.equal(validations, 2, 'shadow mode must keep both original validations');
  const snapshot = proof.snapshot();
  assert.equal(snapshot.calls, 2);
  assert.equal(snapshot.statuses.SAME_OBSERVED, 1);
  assert.equal(snapshot.statuses.UNKNOWN, 1);
  assert.equal(snapshot.conditionalHintsSeen, 1);
  assert.ok(snapshot.sameObservedValidationMs > 0);

  const report = proof.report({
    avoidedValidationCost: 2,
    checkRequestCost: 0.1,
    observeRequestCost: 0.1
  });
  assert.equal(report.potentialValidationCallsAvoided, 1);
  assert.equal(report.grossPotentialSavings, 2);
  assert.ok(Math.abs(report.prospectiveRelayRequestCost - 0.3) < 1e-9);
  assert.ok(Math.abs(report.netPotentialSavings - 1.7) < 1e-9);
  assert.equal(report.assumptions.conditionalRequestSavingsExcluded, true);
});

test('Shadow Proof makes no savings claim when no SAME_OBSERVED result exists', async () => {
  const proof = new SeenRelayShadowProof(new FakeClient(['UNKNOWN']));
  await proof.guard({
    fact: { source_url: 'https://example.invalid/version', predicate: 'version.latest' },
    knownValue: '1',
    validate: () => '1'
  });
  const report = proof.report({ avoidedValidationCost: 100 });
  assert.equal(report.potentialValidationCallsAvoided, 0);
  assert.equal(report.grossPotentialSavings, 0);
  assert.equal(report.assumptions.noSavingsClaimWhenSameObservedIsZero, true);
});

test('client packages are publication-ready and client-only MIT licensed', async () => {
  const fs = await import('node:fs');
  const npmPackage = JSON.parse(fs.readFileSync(new URL('../clients/typescript/package.json', import.meta.url), 'utf8'));
  const pyproject = fs.readFileSync(new URL('../clients/python/pyproject.toml', import.meta.url), 'utf8');
  const clientLicense = fs.readFileSync(new URL('../clients/LICENSE', import.meta.url), 'utf8');

  assert.equal(npmPackage.name, 'seenrelay');
  assert.equal(npmPackage.license, 'MIT');
  assert.equal(npmPackage.private, undefined);
  assert.equal(npmPackage.dependencies, undefined);
  assert.match(pyproject, /^name = "seenrelay"$/m);
  assert.match(pyproject, /^dependencies = \[\]$/m);
  assert.match(pyproject, /^license = "MIT"$/m);
  assert.match(clientLicense, /client-only license does not grant rights/i);
});
