import test from 'node:test';
import assert from 'node:assert/strict';
import { READINESS_V2_FREE_MONTHLY_HARD_CAP, ReadinessV2ActivationError, readinessV2ActivationState, runActivatedReadinessV2 } from '../src/readiness-v2-activation.js';

test('readiness v2 is disabled by default and cannot spend before explicit activation', async () => {
  const previous = process.env.READINESS_V2_ENABLED;
  delete process.env.READINESS_V2_ENABLED;
  try {
    const state = readinessV2ActivationState();
    assert.equal(state.enabled, false);
    assert.equal(state.mode, 'FREE_HARD_BOUNDED');
    assert.equal(state.monthlyHardCap, 1000);
    assert.equal(state.paidOverageAllowed, false);
    await assert.rejects(() => runActivatedReadinessV2('example.com'), (err: unknown) => err instanceof ReadinessV2ActivationError && err.code === 'READINESS_V2_DISABLED');
  } finally {
    if (previous === undefined) delete process.env.READINESS_V2_ENABLED; else process.env.READINESS_V2_ENABLED = previous;
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
