import test from 'node:test';
import assert from 'node:assert/strict';
import { modelBreakEvenSurface } from '../scripts/model-break-even-surface.mjs';

const baseInput = {
  schema_version: 1,
  check_latency_ms: [120],
  validation_latency_ms: [500],
  observe_latency_ms: 100,
  observe_eligible_fraction: 1,
  observe_off_critical_path: false,
  reuse_rates: [0, 0.25, 0.5, 1],
  cost: {
    check_units: 0.1,
    observe_units: 0.1,
    validation_units: [5]
  }
};

test('blocking OBSERVE threshold includes the non-reuse observation path', () => {
  const report = modelBreakEvenSurface(baseInput);
  const row = report.latency.thresholds[0];
  assert.equal(row.break_even_reuse_rate_exclusive, 0.366667);
  assert.equal(row.state, 'feasible');

  const at25 = report.latency.surface.find((x) => x.reuse_rate === 0.25);
  const at50 = report.latency.surface.find((x) => x.reuse_rate === 0.5);
  assert.equal(at25.outcome, 'worse');
  assert.equal(at50.outcome, 'better');
});

test('off-critical-path OBSERVE reduces the latency threshold to CHECK over validation latency', () => {
  const report = modelBreakEvenSurface({ ...baseInput, observe_off_critical_path: true });
  assert.equal(report.latency.thresholds[0].break_even_reuse_rate_exclusive, 0.24);
});

test('non-observe-eligible baselines do not charge OBSERVE latency or cost', () => {
  const report = modelBreakEvenSurface({ ...baseInput, observe_eligible_fraction: 0 });
  assert.equal(report.latency.thresholds[0].break_even_reuse_rate_exclusive, 0.24);
  assert.equal(report.cost.thresholds[0].break_even_reuse_rate_exclusive, 0.02);
});

test('cost threshold uses caller-supplied marginal units', () => {
  const report = modelBreakEvenSurface(baseInput);
  assert.equal(report.cost.thresholds[0].break_even_reuse_rate_exclusive, 0.039216);
  assert.equal(report.cost.thresholds[0].state, 'feasible');
});

test('sparse hive makes remote CHECK latency strictly worse when CHECK has positive latency', () => {
  const report = modelBreakEvenSurface(baseInput);
  assert.equal(report.sparse_hive.reuse_rate, 0);
  assert.equal(report.sparse_hive.latency[0].prospective_ms, 720);
  assert.equal(report.sparse_hive.latency[0].delta_ms, 220);
  assert.equal(report.sparse_hive.latency[0].outcome, 'worse');
});

test('threshold at or above one is marked not strictly feasible', () => {
  const report = modelBreakEvenSurface({
    ...baseInput,
    check_latency_ms: [200],
    validation_latency_ms: [100],
    observe_latency_ms: 0,
    observe_off_critical_path: true
  });
  assert.equal(report.latency.thresholds[0].break_even_reuse_rate_exclusive, 2);
  assert.equal(report.latency.thresholds[0].state, 'not_strictly_feasible');
});

test('all-zero monetary inputs do not manufacture a cost saving', () => {
  const report = modelBreakEvenSurface({
    ...baseInput,
    observe_eligible_fraction: 0,
    cost: { check_units: 0, observe_units: 0, validation_units: [0] }
  });
  assert.equal(report.cost.thresholds[0].break_even_reuse_rate_exclusive, null);
  assert.equal(report.cost.thresholds[0].state, 'no_strict_saving_possible');
  assert.equal(report.cost.surface[0].outcome, 'equal');
});

test('invalid reuse rates fail closed', () => {
  assert.throws(() => modelBreakEvenSurface({ ...baseInput, reuse_rates: [1.01] }), /between 0 and 1/);
});
