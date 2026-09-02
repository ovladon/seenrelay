import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';

test('throw undefined remains an authoritative failure rather than becoming a success', async () => {
  const profiler = createShadowTrajectoryProfiler({ now: () => 1 });
  profiler.startTrajectory({ trajectoryId: 't1', sampleType: 'replayed', startedAtMs: 0 });
  await assert.rejects(
    profiler.measureOperation(
      { trajectoryId: 't1', operationId: 'x', kind: 'tool' },
      async () => { throw undefined; }
    ),
    error => error === undefined
  );
  assert.equal(profiler.getReport('t1').operations[0]?.status, 'error');
});
