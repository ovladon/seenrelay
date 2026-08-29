import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHostileBenchmark } from '../scripts/evaluate-hostile-benchmark.mjs';

const controls = {
  local_cache: { available: true, measured: true },
  source_native_conditional: { available: false, measured: false },
  provider_native_cache: { available: true, measured: true }
};

const baseInput = {
  schema_version: 1,
  workload_id: 'fixture',
  sample_type: 'natural_workload',
  baseline_definition: 'best_existing_non_shared_path',
  controls,
  observe_off_critical_path: false,
  records: [
    {
      check_status: 'SAME_OBSERVED',
      policy_reusable: true,
      reuse_would_match_validation: true,
      observe_after_baseline: true,
      baseline_ms: 1000,
      baseline_cost: 5,
      check_ms: 100,
      observe_ms: 100,
      check_cost: 0.1,
      observe_cost: 0.1
    },
    {
      check_status: 'UNKNOWN',
      policy_reusable: false,
      observe_after_baseline: true,
      baseline_ms: 1000,
      baseline_cost: 5,
      check_ms: 100,
      observe_ms: 100,
      check_cost: 0.1,
      observe_cost: 0.1
    }
  ]
};

test('hostile benchmark compares shared CHECK to the best measured non-shared path', () => {
  const report = evaluateHostileBenchmark(baseInput);
  assert.equal(report.calls, 2);
  assert.equal(report.policy_accepted_reuses, 1);
  assert.equal(report.policy_accepted_reuse_rate, 0.5);
  assert.equal(report.unsafe_hypothetical_reuses, 0);
  assert.equal(report.prospective_observe_requests, 1);
  assert.equal(report.latency.baseline_total_ms, 2000);
  assert.equal(report.latency.prospective_total_ms, 1300);
  assert.equal(report.latency.outcome, 'better');
  assert.equal(report.cost.baseline_total_units, 10);
  assert.ok(Math.abs(report.cost.prospective_total_units - 5.3) < 1e-12);
  assert.equal(report.cost.outcome, 'better');
  assert.equal(report.safety.state, 'pass');
  assert.equal(report.decision.safety_pass, true);
  assert.equal(report.decision.beats_baseline_on_both, true);
  assert.equal(report.decision.automatic_reuse_enabled_by_evaluator, false);
});

test('fixed-fact smoke results remain mechanics-only evidence', () => {
  const report = evaluateHostileBenchmark({ ...baseInput, sample_type: 'fixed_fact_smoke' });
  assert.equal(report.evidence_scope, 'mechanics_only');
});

test('benchmark rejects an available provider-native cache that was not measured', () => {
  assert.throws(() => evaluateHostileBenchmark({
    ...baseInput,
    controls: {
      ...controls,
      provider_native_cache: { available: true, measured: false }
    }
  }), /provider_native_cache is available but was not measured/);
});

test('benchmark never treats non-matching CHECK outcomes as reusable', () => {
  const bad = structuredClone(baseInput);
  bad.records[1].policy_reusable = true;
  bad.records[1].reuse_would_match_validation = true;
  assert.throws(() => evaluateHostileBenchmark(bad), /cannot be policy_reusable unless CHECK is SAME_OBSERVED/);
});

test('one unsafe hypothetical reuse fails the safety decision', () => {
  const bad = structuredClone(baseInput);
  bad.records[0].reuse_would_match_validation = false;
  const report = evaluateHostileBenchmark(bad);
  assert.equal(report.unsafe_hypothetical_reuses, 1);
  assert.equal(report.safety.state, 'fail');
  assert.equal(report.decision.safety_pass, false);
  assert.equal(report.decision.beats_baseline_on_both, false);
});

test('provider-cache baseline can be modeled without falsely adding an OBSERVE', () => {
  const cached = structuredClone(baseInput);
  cached.records[1].observe_after_baseline = false;
  const report = evaluateHostileBenchmark(cached);
  assert.equal(report.prospective_observe_requests, 0);
  assert.equal(report.latency.prospective_total_ms, 1200);
  assert.ok(Math.abs(report.cost.prospective_total_units - 5.2) < 1e-12);
});

test('schema v2 retains CHECK-unavailable calls as non-reusable workload evidence', () => {
  const v2 = structuredClone(baseInput);
  v2.schema_version = 2;
  v2.records[1].check_status = null;
  v2.records[1].reuse_would_match_validation = null;
  const report = evaluateHostileBenchmark(v2);
  assert.equal(report.calls, 2);
  assert.equal(report.status_counts.CHECK_UNAVAILABLE, 1);
  assert.equal(report.policy_accepted_reuses, 1);
  assert.equal(report.safety.state, 'pass');
});

test('schema v2 marks an uncomparable hypothetical reuse incomplete instead of safe', () => {
  const v2 = structuredClone(baseInput);
  v2.schema_version = 2;
  v2.records[0].reuse_would_match_validation = null;
  const report = evaluateHostileBenchmark(v2);
  assert.equal(report.reuse_comparison_unavailable, 1);
  assert.equal(report.safety.state, 'incomplete');
  assert.equal(report.decision.safety_pass, null);
  assert.equal(report.decision.evidence_ready, false);
  assert.equal(report.decision.beats_baseline_on_both, false);
});

test('zero policy reuse opportunities are not labeled a safety pass', () => {
  const v2 = structuredClone(baseInput);
  v2.schema_version = 2;
  for (const record of v2.records) {
    record.policy_reusable = false;
    record.reuse_would_match_validation = null;
  }
  const report = evaluateHostileBenchmark(v2);
  assert.equal(report.policy_accepted_reuses, 0);
  assert.equal(report.safety.state, 'no_opportunities');
  assert.equal(report.decision.safety_pass, null);
  assert.equal(report.decision.evidence_ready, false);
});
