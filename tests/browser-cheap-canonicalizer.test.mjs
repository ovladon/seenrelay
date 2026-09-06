import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCanonicalizer,
  evaluateCheapCanonicalizer,
  renderFrozenTemplate
} from '../scripts/evaluate-browser-cheap-canonicalizer.mjs';

function task(overrides = {}) {
  return {
    sites: ['shopping_admin'],
    task_id: 1,
    intent_template_id: 10,
    intent: 'Get the top-1 product in 2022',
    intent_template: 'Get the top-{{ n }} {{entity}} in {{period}}',
    instantiation_dict: { n: 1, entity: 'product', period: 2022 },
    eval: [
      {
        evaluator: 'AgentResponseEvaluator',
        expected: { task_type: 'retrieve', status: 'SUCCESS', retrieved_data: ['secret'] }
      }
    ],
    ...overrides
  };
}

test('frozen renderer resolves only scalar own-properties with exact identifier lookup', () => {
  assert.deepEqual(
    renderFrozenTemplate('A {{ x }} B {{y}} C {{ flag }}', { x: 1, y: 'two', flag: false }),
    { ok: true, reason: null, rendered: 'A 1 B two C false', replacement_count: 3 }
  );
  assert.equal(renderFrozenTemplate('A {{x}}', {}).reason, 'missing_placeholder_value');
  assert.equal(renderFrozenTemplate('A {{x}}', { x: null }).reason, 'unsupported_placeholder_value_type');
  assert.equal(renderFrozenTemplate('A {{x}}', { x: [1] }).reason, 'unsupported_placeholder_value_type');
  assert.equal(renderFrozenTemplate('A {{x}}', { x: { a: 1 } }).reason, 'unsupported_placeholder_value_type');
});

test('renderer does not collapse case, punctuation, or internal whitespace', () => {
  const rendered = renderFrozenTemplate('Hello, {{name}}!', { name: 'World' });
  assert.equal(rendered.ok, true);
  assert.equal(rendered.rendered, 'Hello, World!');
  const report = evaluateCheapCanonicalizer([
    task({ intent: 'hello, World!', intent_template: 'Hello, {{entity}}!', instantiation_dict: { entity: 'World' } })
  ]);
  assert.equal(report.renderer_fully_resolved_tasks, 1);
  assert.equal(report.exact_roundtrip_tasks, 0);
  assert.equal(report.cheap_canonicalizer_hit_tasks, 0);
});

test('cheap canonicalizer exact hit requires mechanical roundtrip while tagged payload cache misses', () => {
  const report = evaluateCheapCanonicalizer([task()]);
  assert.equal(report.locked_retrieval_tasks, 1);
  assert.equal(report.renderer_attempted_tasks, 1);
  assert.equal(report.renderer_fully_resolved_tasks, 1);
  assert.equal(report.exact_roundtrip_tasks, 1);
  assert.equal(report.exact_payload_cache_miss_tasks, 1);
  assert.equal(report.cheap_canonicalizer_hit_tasks, 1);
  assert.equal(report.cheap_canonicalizer_hit_percent_of_locked, 100);
  assert.equal(report.classification, 'INSUFFICIENT_CONTROLLED_CANONICALIZER_SAMPLE');
});

test('evaluation never reads retrieved_data', () => {
  let read = false;
  const expected = new Proxy(
    { task_type: 'retrieve', status: 'SUCCESS', retrieved_data: ['forbidden'] },
    {
      get(target, property, receiver) {
        if (property === 'retrieved_data') {
          read = true;
          throw new Error('retrieved_data accessed');
        }
        return Reflect.get(target, property, receiver);
      }
    }
  );
  const report = evaluateCheapCanonicalizer([
    task({ eval: [{ evaluator: 'AgentResponseEvaluator', expected }] })
  ]);
  assert.equal(read, false);
  assert.equal(report.locked_retrieval_tasks, 1);
  assert.equal(report.methodology.retrieved_data_property_read, false);
  assert.equal(report.methodology.retrieved_data_contents_inspected, false);
});

test('non-retrieval and identity-incomplete tasks never enter locked denominator', () => {
  const report = evaluateCheapCanonicalizer([
    task({ eval: [{ evaluator: 'AgentResponseEvaluator', expected: { task_type: 'navigate', status: 'SUCCESS' } }] }),
    task({ sites: [] }),
    task()
  ]);
  assert.equal(report.locked_retrieval_tasks, 1);
});

test('classification is frozen solely on cheap canonicalizer hit count at floor 100', () => {
  assert.equal(classifyCanonicalizer(99), 'INSUFFICIENT_CONTROLLED_CANONICALIZER_SAMPLE');
  assert.equal(classifyCanonicalizer(100), 'CHEAP_CANONICALIZER_PARITY_EXISTS_ON_CONTROLLED_SUBSET');
});

test('report is aggregate-only and never retains request, render, IDs or answers', () => {
  const report = evaluateCheapCanonicalizer([task()], {
    repository: 'ServiceNow/webarena-verified',
    revision: 'rev',
    datasetSha256: 'a'.repeat(64),
    datasetBytes: 1
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('Get the top-1 product in 2022'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(report.privacy.aggregate_counts_only, true);
  assert.equal(report.privacy.raw_intents_retained, false);
  assert.equal(report.privacy.rendered_intents_retained, false);
  assert.equal(report.privacy.instantiation_values_retained, false);
  assert.equal(report.privacy.retrieved_data_retained, false);
  assert.equal(report.privacy.task_ids_retained, false);
  assert.equal(report.methodology.result_is_controlled_falsification_only, true);
  assert.equal(report.methodology.seenrelay_specific_advantage_proven, false);
});
