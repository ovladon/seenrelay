import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStructuredSurface,
  diagnoseGeometry,
  hasRequiredInputIdentity,
  isDeterministicRetrievalTask,
  stableJson
} from '../scripts/diagnose-browser-request-representation-geometry.mjs';

function baseTask(overrides = {}) {
  return {
    sites: ['shopping_admin'],
    task_id: 7,
    intent_template_id: 79,
    intent: 'Get the top product.',
    intent_template: 'Get the top {{entity}}.',
    instantiation_dict: { entity: 'product' },
    eval: [
      {
        evaluator: 'AgentResponseEvaluator',
        expected: { task_type: 'retrieve', status: 'SUCCESS', retrieved_data: ['secret-answer'] }
      }
    ],
    ...overrides
  };
}

test('geometry recognizes deterministic retrieval without reading retrieved_data', () => {
  let retrievedDataRead = false;
  const expected = new Proxy(
    { task_type: 'retrieve', status: 'SUCCESS', retrieved_data: ['must-not-be-read'] },
    {
      get(target, property, receiver) {
        if (property === 'retrieved_data') {
          retrievedDataRead = true;
          throw new Error('retrieved_data was accessed');
        }
        return Reflect.get(target, property, receiver);
      }
    }
  );
  const task = baseTask({ eval: [{ evaluator: 'AgentResponseEvaluator', expected }] });
  assert.equal(isDeterministicRetrievalTask(task), true);
  const report = diagnoseGeometry([task]);
  assert.equal(retrievedDataRead, false);
  assert.equal(report.retrieval_tasks, 1);
  assert.equal(report.retrieval_tasks_with_required_input_identity_fields, 1);
  assert.equal(report.retrieval_tasks_with_distinct_surface_a_and_surface_b, 1);
  assert.equal(report.methodology.retrieved_data_property_read, false);
  assert.equal(report.methodology.retrieved_data_contents_inspected, false);
});

test('retrieval classification requires AgentResponseEvaluator retrieve SUCCESS metadata', () => {
  assert.equal(isDeterministicRetrievalTask(baseTask()), true);
  assert.equal(isDeterministicRetrievalTask(baseTask({ eval: [{ evaluator: 'AgentResponseEvaluator', expected: { task_type: 'retrieve', status: 'FAILURE' } }] })), false);
  assert.equal(isDeterministicRetrievalTask(baseTask({ eval: [{ evaluator: 'OtherEvaluator', expected: { task_type: 'retrieve', status: 'SUCCESS' } }] })), false);
  assert.equal(isDeterministicRetrievalTask(baseTask({ eval: [{ evaluator: 'AgentResponseEvaluator', expected: { task_type: 'navigate', status: 'SUCCESS' } }] })), false);
});

test('identity eligibility uses input metadata only and requires all frozen fields', () => {
  assert.equal(hasRequiredInputIdentity(baseTask()), true);
  assert.equal(hasRequiredInputIdentity(baseTask({ sites: [] })), false);
  assert.equal(hasRequiredInputIdentity(baseTask({ intent: '   ' })), false);
  assert.equal(hasRequiredInputIdentity(baseTask({ intent_template_id: '79' })), false);
  assert.equal(hasRequiredInputIdentity(baseTask({ intent_template: '' })), false);
  assert.equal(hasRequiredInputIdentity(baseTask({ instantiation_dict: [] })), false);
});

test('structured surface is deterministic across object-key insertion order while preserving arrays', () => {
  const a = baseTask({
    sites: ['shopping_admin', 'map'],
    instantiation_dict: { z: 2, a: { y: 1, x: [2, 1] } }
  });
  const b = baseTask({
    sites: ['shopping_admin', 'map'],
    instantiation_dict: { a: { x: [2, 1], y: 1 }, z: 2 }
  });
  assert.equal(buildStructuredSurface(a), buildStructuredSurface(b));
  assert.notEqual(stableJson([1, 2]), stableJson([2, 1]));
});

test('task_id and evaluator answer changes do not change structured surface', () => {
  const a = baseTask({ task_id: 1 });
  const b = baseTask({
    task_id: 999,
    eval: [{ evaluator: 'AgentResponseEvaluator', expected: { task_type: 'retrieve', status: 'SUCCESS', retrieved_data: ['different'] } }]
  });
  assert.equal(buildStructuredSurface(a), buildStructuredSurface(b));
});

test('geometry report retains only aggregate counts and source metadata', () => {
  const report = diagnoseGeometry([baseTask()], {
    repository: 'ServiceNow/webarena-verified',
    revision: 'rev',
    datasetSha256: 'a'.repeat(64),
    datasetBytes: 100
  });
  assert.equal(report.records_seen, 1);
  assert.equal(report.parseable_records, 1);
  assert.equal(report.privacy.aggregate_counts_only, true);
  assert.equal(report.privacy.raw_intents_retained, false);
  assert.equal(report.privacy.structured_surfaces_retained, false);
  assert.equal(report.privacy.task_ids_retained, false);
  assert.equal(report.privacy.retrieved_data_retained, false);
  assert.equal(report.methodology.eval_expected_used_to_construct_identity, false);
  assert.equal(JSON.stringify(report).includes('secret-answer'), false);
});
