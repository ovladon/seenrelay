import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFleetTrace, fleetTraceSchemaVersion } from '../clients/typescript/scripts/fleet-trace-census-lib.mjs';

const H1 = 'sha256:' + 'a'.repeat(64);
const H2 = 'sha256:' + 'b'.repeat(64);

function call(overrides = {}) {
  return {
    schema_version: fleetTraceSchemaVersion,
    call_id: 'c1',
    worker_id: 'w1',
    clock_domain: 'unix-epoch-ms',
    coordinate_hash: H1,
    started_at_ms: 0,
    ended_at_ms: 100,
    side_effect_class: 'read_only',
    exact_single_answer_shareable: true,
    independent_samples_required: false,
    native_exact_cache_zero_cost: false,
    outcome: 'success',
    marginal_cost_usd: 1,
    cost_provenance: 'caller_measured',
    provider_units: 1,
    provider_unit_label: 'credit',
    ...overrides
  };
}

test('trace census models one leader plus exact in-flight followers without calling them savings', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'a', worker_id: 'w1', started_at_ms: 0, ended_at_ms: 100 }),
    call({ call_id: 'b', worker_id: 'w2', started_at_ms: 10, ended_at_ms: 90 }),
    call({ call_id: 'c', worker_id: 'w3', started_at_ms: 20, ended_at_ms: 80 })
  ]);

  assert.equal(report.eligible_events, 3);
  assert.equal(report.leader_starts_under_exact_singleflight_model, 1);
  assert.equal(report.observed_exact_overlap_starts, 2);
  assert.equal(report.cross_worker_overlap_starts, 2);
  assert.equal(report.successful_leader_overlap_opportunities, 2);
  assert.equal(report.gross_potential_avoided_cost_usd, 2);
  assert.equal(report.actual_avoided_executions, null);
  assert.equal(report.actual_net_savings_usd, null);
  assert.match(report.disclaimer, /not actual savings/i);
});

test('shadow follower tail does not create a false second leader chain', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'a', worker_id: 'w1', started_at_ms: 0, ended_at_ms: 100 }),
    call({ call_id: 'b', worker_id: 'w2', started_at_ms: 50, ended_at_ms: 200 }),
    call({ call_id: 'c', worker_id: 'w3', started_at_ms: 150, ended_at_ms: 250 })
  ]);

  assert.equal(report.observed_exact_overlap_starts, 1);
  assert.equal(report.leader_starts_under_exact_singleflight_model, 2);
  assert.equal(report.successful_leader_overlap_opportunities, 1);
});

test('sequential exact calls are not fleet overlap', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'a', started_at_ms: 0, ended_at_ms: 100 }),
    call({ call_id: 'b', started_at_ms: 100, ended_at_ms: 200 })
  ]);
  assert.equal(report.observed_exact_overlap_starts, 0);
  assert.equal(report.successful_leader_overlap_opportunities, 0);
});

test('different exact coordinates never coordinate', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'a', coordinate_hash: H1, started_at_ms: 0, ended_at_ms: 100 }),
    call({ call_id: 'b', coordinate_hash: H2, started_at_ms: 10, ended_at_ms: 90 })
  ]);
  assert.equal(report.observed_exact_overlap_starts, 0);
  assert.equal(report.unique_eligible_coordinates, 2);
});

test('native zero-cost exact cache and unsafe policy are excluded before economics', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'native', native_exact_cache_zero_cost: true }),
    call({ call_id: 'mutation', side_effect_class: 'mutation' }),
    call({ call_id: 'sampling', independent_samples_required: true })
  ]);
  assert.equal(report.eligible_events, 0);
  assert.equal(report.native_control_dominated_events, 1);
  assert.equal(report.policy_ineligible_events, 2);
  assert.equal(report.gross_potential_avoided_cost_usd, 0);
});

test('failed leader overlap is observed but not promoted to potential follower reuse', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'a', worker_id: 'w1', started_at_ms: 0, ended_at_ms: 100, outcome: 'error' }),
    call({ call_id: 'b', worker_id: 'w2', started_at_ms: 10, ended_at_ms: 90 })
  ]);
  assert.equal(report.observed_exact_overlap_starts, 1);
  assert.equal(report.successful_leader_overlap_opportunities, 0);
  assert.equal(report.gross_potential_avoided_cost_usd, 0);
});

test('cost coverage is explicit and unknown dollars are never invented', () => {
  const report = analyzeFleetTrace([
    call({ call_id: 'a', started_at_ms: 0, ended_at_ms: 100, marginal_cost_usd: undefined, cost_provenance: undefined }),
    call({ call_id: 'b', worker_id: 'w2', started_at_ms: 10, ended_at_ms: 90, marginal_cost_usd: undefined, cost_provenance: undefined })
  ]);
  assert.equal(report.eligible_costed_events, 0);
  assert.equal(report.cost_coverage_fraction, 0);
  assert.equal(report.gross_potential_avoided_cost_usd, 0);
  assert.equal(report.potential_avoided_costed_events, 0);
});

test('raw prompts, URLs and arguments are rejected instead of retained', () => {
  assert.throws(
    () => analyzeFleetTrace([call({ prompt: 'secret prompt' })]),
    /raw field "prompt" is not allowed/
  );
  assert.throws(
    () => analyzeFleetTrace([call({ url: 'https://private.example' })]),
    /raw field "url" is not allowed/
  );
  assert.throws(
    () => analyzeFleetTrace([call({ arguments: { q: 'secret' } })]),
    /raw field "arguments" is not allowed/
  );
});

test('eligible records require a cryptographic opaque coordinate hash', () => {
  assert.throws(
    () => analyzeFleetTrace([call({ coordinate_hash: 'same request' })]),
    /coordinate_hash must be sha256/
  );
});
