import test from 'node:test';
import assert from 'node:assert/strict';

import { combineFleetLedgers } from '../scripts/evaluate-fleet-wrapper-ledgers.mjs';
import { WORKLOAD_ID, WORKLOAD_CLASS, COST_UNIT } from '../scripts/fleet-wrapper-shadow.mjs';

function record(overrides = {}) {
  return {
    check_status: 'UNKNOWN',
    policy_reusable: false,
    reuse_would_match_validation: null,
    observe_after_baseline: true,
    baseline_ms: 10,
    baseline_cost: 10,
    check_ms: 2,
    observe_ms: 1,
    check_cost: 2,
    observe_cost: 1,
    ...overrides
  };
}

function ledger(role, records, {
  naturalEvents = records.length,
  providerHits = 0,
  recordsDropped = 0,
  protectedCalls = records.length + recordsDropped
} = {}) {
  return {
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    role,
    cost_unit: COST_UNIT,
    natural_events: naturalEvents,
    protected_calls: protectedCalls,
    records_dropped: recordsDropped,
    control_evidence: {
      provider_native_queries: naturalEvents,
      provider_native_hits: providerHits,
      provider_native_query_failures: 0
    },
    records,
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  };
}

test('combined fleet evaluation merges both natural roles without creating new calls', () => {
  const ci = ledger('ci', [record({
    check_status: 'SAME_OBSERVED',
    policy_reusable: true,
    reuse_would_match_validation: true,
    observe_after_baseline: false
  })], { naturalEvents: 2, providerHits: 1 });
  const wrappers = ledger('client-wrappers', [record()], { naturalEvents: 1, providerHits: 0 });

  const result = combineFleetLedgers([ci, wrappers]);
  assert.equal(result.ledger.natural_events, 3);
  assert.equal(result.ledger.protected_calls, 2);
  assert.equal(result.ledger.control_evidence.provider_native_queries, 3);
  assert.equal(result.ledger.control_evidence.provider_native_hits, 1);
  assert.equal(result.summary.provider_native_hit_rate, 1 / 3);
  assert.equal(result.summary.cumulative_protected_calls, 2);
  assert.equal(result.benchmark.records.length, 2);
  assert.equal(result.evaluation.calls, 2);
  assert.equal(result.evaluation.policy_accepted_reuses, 1);
  assert.equal(result.evaluation.unsafe_hypothetical_reuses, 0);
  assert.equal(result.evaluation.automatic_reuse_enabled_by_evaluator, undefined);
  assert.equal(result.evaluation.decision.automatic_reuse_enabled_by_evaluator, false);
  for (const object of [result.ledger, result.summary]) {
    assert.equal(object.raw_values_retained, false);
    assert.equal(object.fact_identity_retained, false);
    assert.equal(object.sources_retained, false);
    assert.equal(object.timestamps_retained, false);
  }
});

test('combined fleet accounting preserves cumulative protected calls after record retention overflow', () => {
  const ci = ledger('ci', [record()], {
    naturalEvents: 1001,
    recordsDropped: 1000,
    protectedCalls: 1001
  });
  const wrappers = ledger('client-wrappers', [], { naturalEvents: 0, protectedCalls: 0 });

  const result = combineFleetLedgers([ci, wrappers]);
  assert.equal(result.ledger.records.length, 1);
  assert.equal(result.ledger.records_dropped, 1000);
  assert.equal(result.ledger.protected_calls, 1001);
  assert.equal(result.summary.cumulative_protected_calls, 1001);
  assert.equal(result.summary.preliminary_sample_floor_met, true);
  assert.equal(result.summary.evaluation_state, 'incomplete');
  assert.equal(result.summary.evaluation_reason, 'ledger_overflow');
  assert.equal(result.benchmark, null);
  assert.equal(result.evaluation, null);
});

test('combined fleet evaluation rejects duplicate roles, leaked fields, and inconsistent protected-call totals', () => {
  const ci = ledger('ci', [record()]);
  assert.throws(() => combineFleetLedgers([ci, ci]), /exactly CI and Client Wrappers/);

  const leaked = ledger('client-wrappers', [{ ...record(), source: 'not-allowed' }]);
  assert.throws(() => combineFleetLedgers([ci, leaked]), /non-sanitized fields/);

  const inconsistent = ledger('client-wrappers', [record()], { protectedCalls: 2 });
  assert.throws(() => combineFleetLedgers([ci, inconsistent]), /retained plus dropped protected records/);
});
