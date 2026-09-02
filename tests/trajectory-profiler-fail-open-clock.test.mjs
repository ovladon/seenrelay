import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';

test('measurement clock failure cannot replace an authoritative success', async () => {
  let calls = 0;
  const profiler = createShadowTrajectoryProfiler({
    now: () => {
      calls += 1;
      if (calls >= 2) throw new Error('clock failed');
      return 0;
    }
  });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed' });
  const value = { ok: true };
  const result = await profiler.measureOperation(
    { trajectoryId: 't1', operationId: 'x', kind: 'tool' },
    async () => value
  );
  assert.equal(result, value);
  assert.ok(profiler.getReport('t1').accounting.measurement_failures >= 1);
});

test('measurement clock failure cannot replace the original authoritative error', async () => {
  let calls = 0;
  const profiler = createShadowTrajectoryProfiler({
    now: () => {
      calls += 1;
      if (calls >= 2) throw new Error('clock failed');
      return 0;
    }
  });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed' });
  const expected = new Error('authoritative');
  await assert.rejects(
    profiler.measureOperation(
      { trajectoryId: 't1', operationId: 'x', kind: 'tool' },
      async () => { throw expected; }
    ),
    error => error === expected
  );
  assert.ok(profiler.getReport('t1').accounting.measurement_failures >= 1);
});
