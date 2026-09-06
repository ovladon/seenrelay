import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnoseVariation } from '../scripts/diagnose-browser-contract-variation.mjs';

function row(taskId, baseTaskId, policy, request) {
  return {
    task_id: taskId,
    base_task_id: baseTaskId,
    persona_policy: policy,
    surface_request: request,
    evidence_to_collect_json: '["ignored-by-diagnostic"]'
  };
}

test('diagnostic separates policy variation from request variation without reading evidence identity', () => {
  const report = diagnoseVariation([
    row('a1', 'a', 'p1', 'same'),
    row('a2', 'a', 'p2', 'same'),
    row('a3', 'a', 'p3', 'different'),
    row('b1', 'b', 'p', 'r1'),
    row('b2', 'b', 'p', 'r2'),
    row('c1', 'c', 'p', 'r')
  ], {
    sourceRevision: 'rev',
    sourceSha256: 'a'.repeat(64),
    sourceBytes: 1
  });

  assert.equal(report.records_seen, 6);
  assert.equal(report.records_with_required_variation_fields, 6);
  assert.equal(report.base_tasks, 3);
  assert.equal(report.base_tasks_with_multiple_contracts, 2);
  assert.equal(report.base_tasks_with_multiple_persona_policies, 1);
  assert.equal(report.base_tasks_with_multiple_surface_requests, 2);
  assert.equal(report.base_tasks_with_both_policy_and_surface_variation, 1);
  assert.equal(report.same_base_different_task_pairs, 4);
  assert.equal(report.same_base_different_policy_pairs, 3);
  assert.equal(report.same_base_different_surface_request_pairs, 3);
  assert.equal(report.same_base_different_policy_and_surface_request_pairs, 2);
  assert.equal(report.boundaries.evidence_identity_evaluated, false);
  assert.equal(report.boundaries.evidence_similarity_evaluated, false);
  assert.equal(report.boundaries.posthoc_explanatory_only, true);
  assert.equal(report.privacy.aggregate_counts_only, true);
});

test('invalid variation fields are excluded fail-closed', () => {
  const report = diagnoseVariation([
    row('x1', 'x', 'p1', 'r1'),
    { task_id: 'x2', base_task_id: 'x', persona_policy: '', surface_request: 'r2' },
    null
  ]);
  assert.equal(report.records_seen, 3);
  assert.equal(report.records_with_required_variation_fields, 1);
  assert.equal(report.base_tasks, 1);
  assert.equal(report.same_base_different_task_pairs, 0);
});
