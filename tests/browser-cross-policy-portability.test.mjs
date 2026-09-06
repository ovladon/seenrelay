import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCrossPolicy,
  evaluateCrossPolicyPortability
} from '../scripts/screen-browser-cross-policy-portability.mjs';

function contract({ task_id, base_task_id, persona_policy, surface_request, evidence_to_collect_json }) {
  return { task_id, base_task_id, persona_policy, surface_request, evidence_to_collect_json };
}

test('cross-policy portability requires same base task, different policy, and same surface request', () => {
  const rows = [
    contract({ task_id: 'a-1', base_task_id: 'a', persona_policy: 'p1', surface_request: 'same', evidence_to_collect_json: '{"b":2,"a":1}' }),
    contract({ task_id: 'a-2', base_task_id: 'a', persona_policy: 'p2', surface_request: 'same', evidence_to_collect_json: '{"a":1,"b":2}' }),
    contract({ task_id: 'a-3', base_task_id: 'a', persona_policy: 'p3', surface_request: 'same', evidence_to_collect_json: '{"a":1,"b":3}' }),
    contract({ task_id: 'a-4', base_task_id: 'a', persona_policy: 'p4', surface_request: 'different', evidence_to_collect_json: '{"a":1,"b":2}' }),
    contract({ task_id: 'a-5', base_task_id: 'a', persona_policy: 'p1', surface_request: 'same', evidence_to_collect_json: '{"a":1,"b":2}' }),
    contract({ task_id: 'b-1', base_task_id: 'b', persona_policy: 'p1', surface_request: 'same', evidence_to_collect_json: '["x","y"]' }),
    contract({ task_id: 'b-2', base_task_id: 'b', persona_policy: 'p2', surface_request: 'same', evidence_to_collect_json: '["y","x"]' }),
    contract({ task_id: 'bad', base_task_id: 'bad', persona_policy: 'p', surface_request: 'r', evidence_to_collect_json: '{}' })
  ];

  const report = evaluateCrossPolicyPortability(rows, {
    sourceRevision: 'rev',
    sourceSha256: 'a'.repeat(64),
    sourceBytes: 123
  });

  assert.equal(report.records_seen, 8);
  assert.equal(report.eligible_contracts, 7);
  assert.deepEqual(report.rejected_records, { empty_evidence: 1 });
  assert.equal(report.base_task_ids_with_eligible_contracts, 2);
  assert.equal(report.base_tasks_with_eligible_pair, 2);
  assert.equal(report.eligible_cross_policy_pairs, 6);
  assert.equal(report.identical_evidence_pairs, 2);
  assert.equal(report.identical_evidence_pair_percent, 33.333333);
  assert.equal(report.base_tasks_with_cross_policy_portable_evidence, 1);
  assert.equal(report.base_task_cross_policy_portability_percent, 50);
  assert.equal(report.eligible_contracts_with_prior_cross_policy_candidate, 4);
  assert.equal(report.contract_reuse_opportunities, 2);
  assert.equal(report.contract_reuse_opportunity_percent, 50);
  assert.equal(report.classification, 'INSUFFICIENT_CONTROLLED_SAMPLE');
  assert.equal(report.methodology.same_surface_request_required, true);
  assert.equal(report.methodology.semantic_matching_used, false);
  assert.equal(report.methodology.result_is_natural_prevalence, false);
  assert.equal(report.methodology.establishes_advantage_over_surface_request_only_cache, false);
  assert.equal(report.privacy.aggregate_counts_only, true);
});

test('array order remains evidence-significant', () => {
  const rows = [
    contract({ task_id: 'x-1', base_task_id: 'x', persona_policy: 'p1', surface_request: 'r', evidence_to_collect_json: '[1,2]' }),
    contract({ task_id: 'x-2', base_task_id: 'x', persona_policy: 'p2', surface_request: 'r', evidence_to_collect_json: '[2,1]' })
  ];
  const report = evaluateCrossPolicyPortability(rows);
  assert.equal(report.eligible_cross_policy_pairs, 1);
  assert.equal(report.identical_evidence_pairs, 0);
});

test('same policy is excluded even if task ids and evidence differ', () => {
  const rows = [
    contract({ task_id: 'x-1', base_task_id: 'x', persona_policy: 'p', surface_request: 'r', evidence_to_collect_json: '[1]' }),
    contract({ task_id: 'x-2', base_task_id: 'x', persona_policy: 'p', surface_request: 'r', evidence_to_collect_json: '[1]' })
  ];
  const report = evaluateCrossPolicyPortability(rows);
  assert.equal(report.eligible_cross_policy_pairs, 0);
  assert.equal(report.base_tasks_with_eligible_pair, 0);
});

test('different surface request is excluded even across different policies', () => {
  const rows = [
    contract({ task_id: 'x-1', base_task_id: 'x', persona_policy: 'p1', surface_request: 'r1', evidence_to_collect_json: '[1]' }),
    contract({ task_id: 'x-2', base_task_id: 'x', persona_policy: 'p2', surface_request: 'r2', evidence_to_collect_json: '[1]' })
  ];
  const report = evaluateCrossPolicyPortability(rows);
  assert.equal(report.eligible_cross_policy_pairs, 0);
});

test('lexical task ordering makes reuse opportunity metric input-order invariant', () => {
  const rows = [
    contract({ task_id: 'x-3', base_task_id: 'x', persona_policy: 'p3', surface_request: 'r', evidence_to_collect_json: '[2]' }),
    contract({ task_id: 'x-1', base_task_id: 'x', persona_policy: 'p1', surface_request: 'r', evidence_to_collect_json: '[1]' }),
    contract({ task_id: 'x-2', base_task_id: 'x', persona_policy: 'p2', surface_request: 'r', evidence_to_collect_json: '[1]' })
  ];
  const a = evaluateCrossPolicyPortability(rows);
  const b = evaluateCrossPolicyPortability([...rows].reverse());
  assert.equal(a.eligible_contracts_with_prior_cross_policy_candidate, 2);
  assert.equal(a.contract_reuse_opportunities, 1);
  assert.equal(a.contract_reuse_opportunity_percent, 50);
  assert.equal(a.contract_reuse_opportunities, b.contract_reuse_opportunities);
  assert.equal(a.contract_reuse_opportunity_percent, b.contract_reuse_opportunity_percent);
});

test('classification thresholds are frozen at 100 pairs, 5 percent and 20 percent', () => {
  assert.equal(classifyCrossPolicy({ eligiblePairs: 99, identicalPairPercent: 100 }), 'INSUFFICIENT_CONTROLLED_SAMPLE');
  assert.equal(classifyCrossPolicy({ eligiblePairs: 100, identicalPairPercent: 4.999 }), 'LOW_CROSS_POLICY_PORTABILITY');
  assert.equal(classifyCrossPolicy({ eligiblePairs: 100, identicalPairPercent: 5 }), 'LIMITED_CROSS_POLICY_PORTABILITY');
  assert.equal(classifyCrossPolicy({ eligiblePairs: 100, identicalPairPercent: 19.999 }), 'LIMITED_CROSS_POLICY_PORTABILITY');
  assert.equal(classifyCrossPolicy({ eligiblePairs: 100, identicalPairPercent: 20 }), 'MATERIAL_CROSS_POLICY_PORTABILITY');
});
