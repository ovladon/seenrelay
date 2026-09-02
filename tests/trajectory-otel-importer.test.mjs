import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowTrajectoryProfiler } from '../clients/typescript/dist/trajectory-profiler.js';
import { importOtlpTrajectory } from '../clients/typescript/dist/trajectory-otel-importer.js';

const attr = (key, value) => ({ key, value: typeof value === 'number' ? { intValue: String(value) } : { stringValue: value } });
const span = ({ traceId = 'trace-secret', spanId, parentSpanId = '', start = 0, end = 10, attributes = [], status, name = 'ignored-span-name', events = [] } = {}) => ({
  traceId, spanId, parentSpanId, name, events,
  startTimeUnixNano: String(BigInt(start) * 1000000n),
  endTimeUnixNano: String(BigInt(end) * 1000000n),
  attributes,
  ...(status ? { status } : {})
});

function profiler() { return createShadowTrajectoryProfiler({ now: () => 1 }); }

test('imports OTLP JSON spans without retaining raw IDs, names, prompts, messages, tool content, or MCP URIs', () => {
  const p = profiler();
  const input = { spans: [span({
    spanId: 'span-secret',
    attributes: [
      attr('gen_ai.operation.name', 'chat'),
      attr('gen_ai.system', 'openai'),
      attr('gen_ai.request.model', 'private-model-label'),
      attr('gen_ai.usage.input_tokens', 100),
      attr('gen_ai.usage.output_tokens', 20),
      attr('gen_ai.input.messages', 'SECRET PROMPT'),
      attr('gen_ai.output.messages', 'SECRET RESPONSE'),
      attr('mcp.resource.uri', 'file:///secret/path')
    ],
    name: 'SECRET SPAN NAME'
  })]};
  const imported = importOtlpTrajectory(p, input);
  const report = p.getReport(imported.trajectory_id);
  const serialized = JSON.stringify({ imported, report });
  for (const secret of ['trace-secret','span-secret','SECRET PROMPT','SECRET RESPONSE','file:///secret/path','SECRET SPAN NAME','private-model-label']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(imported.raw_ids_retained, false);
  assert.equal(imported.raw_content_retained, false);
  assert.equal(imported.ignored_content_attributes, 3);
  assert.deepEqual(report.operations[0].work, { inputTokens: 100, outputTokens: 20 });
});

test('maps GenAI operations conservatively and never creates cost units or money', () => {
  const p = profiler();
  const input = { spans: [
    span({ spanId: 'a', attributes: [attr('gen_ai.operation.name','chat'), attr('gen_ai.usage.input_tokens',10)] }),
    span({ spanId: 'b', start: 10, end: 20, attributes: [attr('gen_ai.operation.name','embeddings')] }),
    span({ spanId: 'c', start: 20, end: 30, attributes: [attr('gen_ai.operation.name','execute_tool')] })
  ]};
  const imported = importOtlpTrajectory(p, input);
  const report = p.getReport(imported.trajectory_id);
  assert.deepEqual(report.operations.map(op => op.kind), ['model','embedding','tool']);
  assert.equal(imported.cost_units_created, false);
  assert.equal(report.accounting.actual_cost_units, null);
  assert.equal(Object.hasOwn(report.accounting.actual_work, 'costUnits'), false);
  assert.equal(Object.hasOwn(report.accounting.actual_work, 'monetaryUsd'), false);
});

test('maps known MCP method classes but does not retain method names', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans: [
    span({ spanId:'a', attributes:[attr('mcp.method.name','tools/call')] }),
    span({ spanId:'b', start:10, end:20, attributes:[attr('mcp.method.name','resources/read')] }),
    span({ spanId:'c', start:20, end:30, attributes:[attr('mcp.method.name','custom/private')] })
  ]});
  const report = p.getReport(imported.trajectory_id);
  assert.deepEqual(report.operations.map(op => op.kind), ['tool','retrieval','network']);
  assert.equal(JSON.stringify(report).includes('custom/private'), false);
  assert.deepEqual(report.operations[0].work, {});
});

test('uses trajectory elapsed time and never sums nested span durations as work', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans: [
    span({ spanId:'parent', start:0, end:100, attributes:[attr('gen_ai.operation.name','chat')] }),
    span({ spanId:'child', parentSpanId:'parent', start:20, end:80, attributes:[attr('gen_ai.operation.name','execute_tool')] })
  ]});
  const report = p.getReport(imported.trajectory_id);
  assert.equal(imported.observed_start_ms, 0);
  assert.equal(imported.observed_end_ms, 100);
  assert.equal(report.operations[0].duration_ms, 100);
  assert.equal(report.operations[1].duration_ms, 60);
  assert.equal(Object.hasOwn(report.accounting.actual_work, 'wallMs'), false);
});

test('suppresses exact repeated usage on an ancestor when a descendant carries the identical vector', () => {
  const p = profiler();
  const usage = [attr('gen_ai.usage.input_tokens',100), attr('gen_ai.usage.output_tokens',20)];
  const imported = importOtlpTrajectory(p, { spans: [
    span({ spanId:'parent', start:0, end:100, attributes:[attr('gen_ai.operation.name','chat'), ...usage] }),
    span({ spanId:'child', parentSpanId:'parent', start:10, end:90, attributes:[attr('gen_ai.operation.name','chat'), ...usage] })
  ]});
  const report = p.getReport(imported.trajectory_id);
  assert.equal(imported.duplicate_usage_suppressed, 1);
  assert.equal(imported.exact_duplicate_usage_suppressed, 1);
  assert.equal(imported.aggregate_usage_is_lower_bound, false);
  assert.deepEqual(report.operations[0].work, {});
  assert.deepEqual(report.operations[1].work, { inputTokens:100, outputTokens:20 });
  assert.deepEqual(report.accounting.actual_work, { inputTokens:100, outputTokens:20 });
});

test('suppresses ambiguous ancestor usage and marks the aggregate as a lower bound', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans: [
    span({ spanId:'parent', attributes:[attr('gen_ai.operation.name','chat'), attr('gen_ai.usage.input_tokens',200)] }),
    span({ spanId:'child', parentSpanId:'parent', attributes:[attr('gen_ai.operation.name','chat'), attr('gen_ai.usage.input_tokens',100)] })
  ]});
  const report = p.getReport(imported.trajectory_id);
  assert.equal(imported.duplicate_usage_suppressed, 1);
  assert.equal(imported.ambiguous_ancestor_usage_suppressed, 1);
  assert.equal(imported.aggregate_usage_is_lower_bound, true);
  assert.equal(report.accounting.actual_work.inputTokens, 100);
});

test('cache and reasoning subtypes are not invented as extra totals', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans: [span({ spanId:'x', attributes:[
    attr('gen_ai.operation.name','chat'),
    attr('gen_ai.usage.input_tokens',100),
    attr('gen_ai.usage.cache_read.input_tokens',40),
    attr('gen_ai.usage.cache_creation.input_tokens',10),
    attr('gen_ai.usage.output_tokens',20),
    attr('gen_ai.usage.reasoning.output_tokens',5)
  ]})]});
  const work = p.getReport(imported.trajectory_id).operations[0].work;
  assert.deepEqual(work, { inputTokens:100, outputTokens:20, cacheReadTokens:40, cacheWriteTokens:10 });
  assert.equal(Object.keys(work).some(key => key.toLowerCase().includes('reason')), false);
});

test('invalid spans are skipped and an empty usable trace does not create a trajectory', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans: [{ traceId:'x', spanId:'y' }] });
  assert.equal(imported.imported, false);
  assert.equal(imported.invalid_spans, 1);
  assert.equal(imported.trajectory_id, null);
});

test('requires one trace per import call', () => {
  const p = profiler();
  assert.throws(() => importOtlpTrajectory(p, { spans: [
    span({traceId:'a',spanId:'1'}), span({traceId:'b',spanId:'2'})
  ]}), /exactly one trace/);
});

test('accepts standard OTLP resourceSpans/scopeSpans shape', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { resourceSpans:[{ scopeSpans:[{ spans:[span({spanId:'x'})] }] }] });
  assert.equal(imported.imported, true);
  assert.equal(imported.imported_spans, 1);
});

test('never finishes the trajectory or infers correctness, safety, or equivalence', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans:[span({spanId:'x'})] });
  const report = p.getReport(imported.trajectory_id);
  assert.equal(imported.trajectory_finished, false);
  assert.equal(report.trajectory.complete, false);
  assert.equal(imported.interpretation.correctness_inferred, false);
  assert.equal(imported.interpretation.safety_inferred, false);
  assert.equal(imported.interpretation.equivalence_inferred, false);
});


test('duplicate span IDs are rejected before trajectory creation', () => {
  const p = profiler();
  assert.throws(() => importOtlpTrajectory(p, { spans:[span({spanId:'same'}), span({spanId:'same',start:10,end:20})] }), /unique spanId/);
  assert.throws(() => p.getReport(`otel-trace-${'0'.repeat(64)}`), /unknown trajectoryId/);
});

test('cyclic parent references cannot hang usage deduplication', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { spans:[
    span({spanId:'a',parentSpanId:'b',attributes:[attr('gen_ai.usage.input_tokens',10)]}),
    span({spanId:'b',parentSpanId:'a',attributes:[attr('gen_ai.usage.input_tokens',10)]})
  ]});
  assert.equal(imported.imported, true);
  assert.ok(imported.duplicate_usage_suppressed >= 1);
});

test('resource, scope, event, and span-name content is ignored wholesale', () => {
  const p = profiler();
  const imported = importOtlpTrajectory(p, { resourceSpans:[{
    resource:{attributes:[attr('service.name','SECRET SERVICE'),attr('custom.secret','SECRET RESOURCE')]},
    scopeSpans:[{scope:{name:'SECRET SCOPE'},spans:[span({spanId:'x',name:'SECRET NAME',events:[{name:'SECRET EVENT',attributes:[attr('secret','SECRET EVENT BODY')]}]})]}]
  }]});
  const serialized = JSON.stringify({imported, report:p.getReport(imported.trajectory_id)});
  for (const secret of ['SECRET SERVICE','SECRET RESOURCE','SECRET SCOPE','SECRET NAME','SECRET EVENT','SECRET EVENT BODY']) assert.equal(serialized.includes(secret), false);
});

test('unsafe numeric nanosecond timestamps are rejected rather than rounded', () => {
  const p = profiler();
  const bad = { traceId:'t',spanId:'s',startTimeUnixNano:Number.MAX_SAFE_INTEGER+10,endTimeUnixNano:Number.MAX_SAFE_INTEGER+20,attributes:[] };
  const imported = importOtlpTrajectory(p,{spans:[bad]});
  assert.equal(imported.imported,false);
  assert.equal(imported.invalid_spans,1);
});
