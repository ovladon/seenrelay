import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPortability,
  evaluatePortability,
  normalizeContract,
  parseEvidence,
  taskRecords
} from '../scripts/screen-browser-evidence-portability.mjs';

function contract({
  task_id,
  base_task_id,
  persona_policy,
  surface_request,
  evidence_to_collect_json
}) {
  return { task_id, base_task_id, persona_policy, surface_request, evidence_to_collect_json };
}

test('evidence identity ignores object key order but preserves array order', () => {
  const a = parseEvidence('{"b":[1,2],"a":{"y":2,"x":1}}');
  const b = parseEvidence('{"a":{"x":1,"y":2},"b":[1,2]}');
  const c = parseEvidence('{"a":{"x":1,"y":2},"b":[2,1]}');
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, true);
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, c.key);
});

test('empty and invalid evidence are rejected fail-closed', () => {
  assert.deepEqual(parseEvidence(''), { ok: false, reason: 'empty_evidence' });
  assert.deepEqual(parseEvidence('[]'), { ok: false, reason: 'empty_evidence' });
  assert.deepEqual(parseEvidence('{}'), { ok: false, reason: 'empty_evidence' });
  assert.deepEqual(parseEvidence('null'), { ok: false, reason: 'empty_evidence' });
  assert.deepEqual(parseEvidence('{bad'), { ok: false, reason: 'invalid_evidence_json' });
});

test('contract normalization requires every preregistered field', () => {
  const base = contract({
    task_id: 't1',
    base_task_id: 'b1',
    persona_policy: 'p1',
    surface_request: 'request',
    evidence_to_collect_json: '["source"]'
  });
  assert.equal(normalizeContract(base).ok, true);
  for (const field of ['task_id', 'base_task_id', 'persona_policy', 'surface_request']) {
    const broken = { ...base, [field]: '   ' };
    assert.equal(normalizeContract(broken).ok, false);
  }
});

test('controlled portability counts only cross-policy cross-request pairs', () => {
  const tasks = [
    contract({
      task_id: 'a-1', base_task_id: 'base-a', persona_policy: 'policy-a', surface_request: 'request A',
      evidence_to_collect_json: '{"items":["x","y"],"source":"public"}'
    }),
    contract({
      task_id: 'a-2', base_task_id: 'base-a', persona_policy: 'policy-b', surface_request: 'request B',
      evidence_to_collect_json: '{"source":"public","items":["x","y"]}'
    }),
    contract({
      task_id: 'a-3', base_task_id: 'base-a', persona_policy: 'policy-c', surface_request: 'request C',
      evidence_to_collect_json: '{"source":"public","items":["y","x"]}'
    }),
    contract({
      task_id: 'b-1', base_task_id: 'base-b', persona_policy: 'policy-a', surface_request: 'same request',
      evidence_to_collect_json: '["z"]'
    }),
    contract({
      task_id: 'b-2', base_task_id: 'base-b', persona_policy: 'policy-b', surface_request: 'same request',
      evidence_to_collect_json: '["z"]'
    }),
    contract({
      task_id: 'c-1', base_task_id: 'base-c', persona_policy: 'same-policy', surface_request: 'request 1',
      evidence_to_collect_json: '["z"]'
    }),
    contract({
      task_id: 'c-2', base_task_id: 'base-c', persona_policy: 'same-policy', surface_request: 'request 2',
      evidence_to_collect_json: '["z"]'
    }),
    contract({
      task_id: 'bad-1', base_task_id: 'base-bad', persona_policy: 'policy-x', surface_request: 'request x',
      evidence_to_collect_json: '{}'
    })
  ];

  const report = evaluatePortability(tasks, {
    sourceRevision: 'rev',
    sourceSha256: 'a'.repeat(64),
    sourceBytes: 123
  });

  assert.equal(report.records_seen, 8);
  assert.equal(report.eligible_contracts, 7);
  assert.deepEqual(report.rejected_records, { empty_evidence: 1 });
  assert.equal(report.base_task_ids_with_eligible_contracts, 3);
  assert.equal(report.base_tasks_with_eligible_pair, 1);
  assert.equal(report.eligible_cross_policy_cross_request_pairs, 3);
  assert.equal(report.identical_evidence_pairs, 1);
  assert.equal(report.identical_evidence_pair_percent, 33.333333);
  assert.equal(report.base_tasks_with_portable_evidence, 1);
  assert.equal(report.base_task_portability_percent, 100);
  assert.equal(report.eligible_contracts_with_prior_cross_policy_cross_request_candidate, 2);
  assert.equal(report.contract_reuse_opportunities, 1);
  assert.equal(report.contract_reuse_opportunity_percent, 50);
  assert.equal(report.classification, 'INSUFFICIENT_CONTROLLED_SAMPLE');
  assert.equal(report.methodology.semantic_matching_used, false);
  assert.equal(report.methodology.result_is_natural_prevalence, false);
  assert.equal(report.methodology.result_authorizes_private285_pass, false);
  assert.equal(report.privacy.aggregate_counts_only, true);
});

test('lexical task ordering makes reuse opportunity metric input-order invariant', () => {
  const rows = [
    contract({ task_id: 'x-2', base_task_id: 'x', persona_policy: 'p2', surface_request: 'r2', evidence_to_collect_json: '[1]' }),
    contract({ task_id: 'x-1', base_task_id: 'x', persona_policy: 'p1', surface_request: 'r1', evidence_to_collect_json: '[1]' }),
    contract({ task_id: 'x-3', base_task_id: 'x', persona_policy: 'p3', surface_request: 'r3', evidence_to_collect_json: '[2]' })
  ];
  const a = evaluatePortability(rows);
  const b = evaluatePortability([...rows].reverse());
  assert.equal(a.eligible_contracts_with_prior_cross_policy_cross_request_candidate, 2);
  assert.equal(a.contract_reuse_opportunities, 1);
  assert.equal(a.contract_reuse_opportunity_percent, 50);
  assert.equal(a.contract_reuse_opportunities, b.contract_reuse_opportunities);
  assert.equal(a.contract_reuse_opportunity_percent, b.contract_reuse_opportunity_percent);
});

test('task document accepts only explicit record arrays', () => {
  assert.equal(taskRecords([{ task_id: 'x' }]).length, 1);
  assert.equal(taskRecords({ tasks: [{ task_id: 'x' }] }).length, 1);
  assert.equal(taskRecords({ records: [{ task_id: 'x' }] }).length, 1);
  assert.equal(taskRecords({ data: [{ task_id: 'x' }] }).length, 1);
  assert.throws(() => taskRecords({ items: [] }), /tasks\/records\/data array/);
});

test('classification thresholds are frozen at 100 pairs, 5 percent and 20 percent', () => {
  assert.equal(classifyPortability({ eligiblePairs: 99, identicalPairPercent: 100 }), 'INSUFFICIENT_CONTROLLED_SAMPLE');
  assert.equal(classifyPortability({ eligiblePairs: 100, identicalPairPercent: 4.999 }), 'LOW_CONTROLLED_PORTABILITY');
  assert.equal(classifyPortability({ eligiblePairs: 100, identicalPairPercent: 5 }), 'LIMITED_CONTROLLED_PORTABILITY');
  assert.equal(classifyPortability({ eligiblePairs: 100, identicalPairPercent: 19.999 }), 'LIMITED_CONTROLLED_PORTABILITY');
  assert.equal(classifyPortability({ eligiblePairs: 100, identicalPairPercent: 20 }), 'MATERIAL_CONTROLLED_PORTABILITY');
});
