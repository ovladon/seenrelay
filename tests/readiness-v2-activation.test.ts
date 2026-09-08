import test from 'node:test';
import assert from 'node:assert/strict';
import { READINESS_V2_FREE_MONTHLY_HARD_CAP, ReadinessV2ActivationError, readinessV2ActivationState, runActivatedReadinessV2 } from '../src/readiness-v2-activation.js';

const ACTIVATION_ENV = [
  'READINESS_V2_ENABLED',
  'READINESS_V2_COST_COVERED',
  'READINESS_V2_COST_COVERAGE_MONTH',
  'READINESS_V2_PROVIDER_SPEND_BOUNDARY_CONFIRMED'
] as const;

function isolateActivationEnv() {
  const before = new Map<string, string | undefined>(ACTIVATION_ENV.map((key) => [key, process.env[key]]));
  for (const key of ACTIVATION_ENV) delete process.env[key];
  return () => {
    for (const key of ACTIVATION_ENV) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
}

test('readiness v2 is disabled by default and cannot spend before explicit activation', async () => {
  const restore = isolateActivationEnv();
  try {
    const state = readinessV2ActivationState(new Date('2026-09-08T12:00:00Z'));
    assert.equal(state.schema, 'seenrelay-readiness-v2-activation-v2');
    assert.equal(state.requestedEnabled, false);
    assert.equal(state.costCovered, false);
    assert.equal(state.costCoverageCurrent, false);
    assert.equal(state.providerSpendBoundaryConfirmed, false);
    assert.equal(state.enabled, false);
    assert.equal(state.mode, 'FREE_HARD_BOUNDED');
    assert.equal(state.monthlyHardCap, 1000);
    assert.equal(state.paidOverageAllowed, false);
    assert.deepEqual(state.activationBlockers, [
      'ENABLE_NOT_REQUESTED',
      'COST_NOT_COVERED',
      'COST_COVERAGE_NOT_CURRENT',
      'PROVIDER_SPEND_BOUNDARY_NOT_CONFIRMED'
    ]);
    await assert.rejects(() => runActivatedReadinessV2('example.com'), (err: unknown) => err instanceof ReadinessV2ActivationError && err.code === 'READINESS_V2_DISABLED');
  } finally {
    restore();
  }
});

test('requesting activation without explicit cost coverage remains fail-closed', async () => {
  const restore = isolateActivationEnv();
  process.env.READINESS_V2_ENABLED = 'true';
  try {
    const state = readinessV2ActivationState(new Date('2026-09-08T12:00:00Z'));
    assert.equal(state.requestedEnabled, true);
    assert.equal(state.costCovered, false);
    assert.equal(state.enabled, false);
    await assert.rejects(() => runActivatedReadinessV2('example.com'), (err: unknown) => err instanceof ReadinessV2ActivationError && err.code === 'READINESS_V2_DISABLED');
  } finally {
    restore();
  }
});

test('cost coverage is month-scoped and stale coverage cannot activate v2', () => {
  const restore = isolateActivationEnv();
  process.env.READINESS_V2_ENABLED = 'true';
  process.env.READINESS_V2_COST_COVERED = 'true';
  process.env.READINESS_V2_COST_COVERAGE_MONTH = '2026-08';
  process.env.READINESS_V2_PROVIDER_SPEND_BOUNDARY_CONFIRMED = 'true';
  try {
    const state = readinessV2ActivationState(new Date('2026-09-08T12:00:00Z'));
    assert.equal(state.costCoverageMonth, '2026-08');
    assert.equal(state.currentUtcMonth, '2026-09');
    assert.equal(state.costCoverageCurrent, false);
    assert.equal(state.enabled, false);
    assert.deepEqual(state.activationBlockers, ['COST_COVERAGE_NOT_CURRENT']);
  } finally {
    restore();
  }
});

test('provider spend boundary confirmation is independently required', () => {
  const restore = isolateActivationEnv();
  process.env.READINESS_V2_ENABLED = 'true';
  process.env.READINESS_V2_COST_COVERED = 'true';
  process.env.READINESS_V2_COST_COVERAGE_MONTH = '2026-09';
  try {
    const state = readinessV2ActivationState(new Date('2026-09-08T12:00:00Z'));
    assert.equal(state.costCoverageCurrent, true);
    assert.equal(state.providerSpendBoundaryConfirmed, false);
    assert.equal(state.enabled, false);
    assert.deepEqual(state.activationBlockers, ['PROVIDER_SPEND_BOUNDARY_NOT_CONFIRMED']);
  } finally {
    restore();
  }
});

test('all activation evidence can make state eligible without executing a real audit', () => {
  const restore = isolateActivationEnv();
  process.env.READINESS_V2_ENABLED = 'true';
  process.env.READINESS_V2_COST_COVERED = 'true';
  process.env.READINESS_V2_COST_COVERAGE_MONTH = '2026-09';
  process.env.READINESS_V2_PROVIDER_SPEND_BOUNDARY_CONFIRMED = 'true';
  try {
    const state = readinessV2ActivationState(new Date('2026-09-08T12:00:00Z'));
    assert.equal(state.costCoverageCurrent, true);
    assert.equal(state.providerSpendBoundaryConfirmed, true);
    assert.deepEqual(state.activationBlockers, []);
    assert.equal(state.enabled, true);
  } finally {
    restore();
  }
});

test('free readiness v2 monthly cap is a compile-time hard ceiling, not an environment price knob', () => {
  assert.equal(READINESS_V2_FREE_MONTHLY_HARD_CAP, 1000);
  const before = process.env.READINESS_V2_MONTHLY_CAP;
  process.env.READINESS_V2_MONTHLY_CAP = '999999999';
  try {
    assert.equal(readinessV2ActivationState().monthlyHardCap, 1000);
  } finally {
    if (before === undefined) delete process.env.READINESS_V2_MONTHLY_CAP; else process.env.READINESS_V2_MONTHLY_CAP = before;
  }
});
