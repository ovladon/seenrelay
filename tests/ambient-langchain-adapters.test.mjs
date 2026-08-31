import assert from 'node:assert/strict';
import test from 'node:test';
import { ambientLangChainMcpHooks } from '../clients/typescript/dist/ambient.js';

test('LangChain JS hooks preserve existing hooks and measure effective exact repeats locally', async () => {
  let beforeCalls = 0;
  let afterCalls = 0;
  const ambient = ambientLangChainMcpHooks({
    hooks: {
      beforeToolCall(req) { beforeCalls += 1; return { args: { ...req.args, b: 2 } }; },
      afterToolCall(event) { afterCalls += 1; return { result: event.result }; }
    }
  });
  const modification = await ambient.hooks.beforeToolCall({ serverName: 'math', name: 'add', args: { a: 1 } }, {}, {});
  assert.deepEqual(modification, { args: { a: 1, b: 2 } });

  // LangChain afterToolCall exposes the effective args after beforeToolCall modifications.
  const first = { serverName: 'math', name: 'add', args: { a: 1, b: 2 }, result: ['3', []] };
  const second = { serverName: 'math', name: 'add', args: { a: 1, b: 2 }, result: ['3', []] };
  const third = { serverName: 'math', name: 'add', args: { a: 1, b: 2 }, result: ['4', []] };
  assert.deepEqual(await ambient.hooks.afterToolCall(first, {}, {}), { result: first.result });
  await ambient.hooks.afterToolCall(second, {}, {});
  await ambient.hooks.afterToolCall(third, {}, {});
  const report = ambient.seenRelayAmbient.getReport();
  assert.equal(beforeCalls, 1);
  assert.equal(afterCalls, 3);
  assert.equal(report.measured_calls, 3);
  assert.equal(report.exact_repeat_validations, 2);
  assert.equal(report.exact_unchanged_repeats, 1);
  assert.equal(report.exact_changed_repeats, 1);
  assert.equal(report.candidate_tools[0].server_name, 'math');
  assert.equal(ambient.seenRelayAmbient.network_calls_from_shadow, 0);
  assert.equal(ambient.seenRelayAmbient.shared_check_from_shadow, false);
  assert.equal(ambient.seenRelayAmbient.observe_from_shadow, false);
  assert.equal(ambient.seenRelayAmbient.active_reuse_enabled, false);
});

test('LangChain JS dynamic per-call headers fail closed while preserving user before hook', async () => {
  const ambient = ambientLangChainMcpHooks({
    hooks: {
      beforeToolCall() { return { headers: { authorization: 'Bearer opaque' } }; }
    }
  });
  const modification = await ambient.hooks.beforeToolCall({ serverName: 's', name: 'read', args: { id: 1 } }, {}, {});
  assert.deepEqual(modification, { headers: { authorization: 'Bearer opaque' } });
  await ambient.hooks.afterToolCall({ serverName: 's', name: 'read', args: { id: 1 }, result: ['x', []] }, {}, {});
  const report = ambient.seenRelayAmbient.getReport();
  assert.equal(report.measured_calls, 0);
  assert.equal(report.refused_measurements, 1);
  assert.equal(report.interpretation.dynamic_per_call_headers_seen, true);
  assert.equal(ambient.seenRelayAmbient.dynamic_per_call_headers_fail_closed, true);
});

test('LangChain JS absent or args-only before hook does not poison later measurement', async () => {
  const ambient = ambientLangChainMcpHooks({
    hooks: { beforeToolCall(req) { return { args: req.args }; } }
  });
  await ambient.hooks.beforeToolCall({ serverName: 'a', name: 'read', args: { id: 1 } }, {}, {});
  await ambient.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, result: ['x', []] }, {}, {});
  await ambient.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, result: ['x', []] }, {}, {});
  const report = ambient.seenRelayAmbient.getReport();
  assert.equal(report.measured_calls, 2);
  assert.equal(report.exact_unchanged_repeats, 1);
  assert.equal(report.interpretation.dynamic_per_call_headers_seen, false);
});

test('LangChain JS hooks partition same tool by server and args', async () => {
  const ambient = ambientLangChainMcpHooks({ maxCoordinates: 10 });
  await ambient.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, result: ['x', []] }, {}, {});
  await ambient.hooks.afterToolCall({ serverName: 'b', name: 'read', args: { id: 1 }, result: ['x', []] }, {}, {});
  await ambient.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 2 }, result: ['x', []] }, {}, {});
  const report = ambient.seenRelayAmbient.getReport();
  assert.equal(report.first_observations, 3);
  assert.equal(report.exact_repeat_validations, 0);
  assert.equal(report.tools.length, 2);
});

test('LangChain JS non-JSON result fails closed and user after hook still sees original event', async () => {
  let seen;
  const ambient = ambientLangChainMcpHooks({
    hooks: {
      afterToolCall(event) { seen = event.result; return { result: 'user-modified' }; }
    }
  });
  const unsafe = { bad: () => 1 };
  const out = await ambient.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, result: unsafe }, {}, {});
  assert.deepEqual(out, { result: 'user-modified' });
  assert.strictEqual(seen, unsafe);
  const report = ambient.seenRelayAmbient.getReport();
  assert.equal(report.refused_measurements, 1);
  assert.equal(report.measured_calls, 0);
});

test('LangChain JS measurement runs before user after hook mutation', async () => {
  const ambient = ambientLangChainMcpHooks({
    hooks: { afterToolCall() { return { result: ['mutated', []] }; } }
  });
  const event = { serverName: 'a', name: 'read', args: { id: 1 }, result: ['provider', []] };
  await ambient.hooks.afterToolCall(event, {}, {});
  await ambient.hooks.afterToolCall(event, {}, {});
  const report = ambient.seenRelayAmbient.getReport();
  assert.equal(report.exact_unchanged_repeats, 1);
  assert.equal(ambient.seenRelayAmbient.measures_pre_user_after_hook_result, true);
});



test('LangChain JS unknown future hook fields and undocumented JSON result shapes fail closed', async () => {
  const future = ambientLangChainMcpHooks();
  await future.hooks.beforeToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, futureSemanticField: true }, {}, {});
  await future.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, result: ['x', []] }, {}, {});
  let report = future.seenRelayAmbient.getReport();
  assert.equal(report.measured_calls, 0);
  assert.equal(report.refused_measurements, 1);
  assert.equal(report.interpretation.unknown_request_shape_seen, true);
  assert.equal(report.interpretation.unknown_fields_fail_closed, true);

  const unexpected = ambientLangChainMcpHooks();
  await unexpected.hooks.afterToolCall({ serverName: 'a', name: 'read', args: { id: 1 }, result: { content: 'json-but-not-documented-tuple' } }, {}, {});
  report = unexpected.seenRelayAmbient.getReport();
  assert.equal(report.measured_calls, 0);
  assert.equal(report.refused_measurements, 1);
  assert.equal(report.interpretation.documented_result_shape_required, true);
});

test('LangChain adapters contain no relay/network execution path', async () => {
  const { readFile } = await import('node:fs/promises');
  const js = await readFile(new URL('../clients/typescript/dist/ambient.js', import.meta.url), 'utf8');
  const jsSlice = js.slice(js.indexOf('function langChainMetricKey'));
  for (const forbidden of ['fetch(', 'protectMcpClient(', 'ambientMcpClient(', '.check(', '.observe(', 'https://', 'http://']) {
    assert.equal(jsSlice.includes(forbidden), false, `LangChain JS surface must not contain ${forbidden}`);
  }
  const py = await readFile(new URL('../clients/python/seenrelay_ambient.py', import.meta.url), 'utf8');
  const pySlice = py.slice(py.indexOf('def _ambient_json_projection'));
  for (const forbidden of ['requests.', 'httpx', 'urllib.', 'SeenRelayClient', '.check(', '.observe(', 'https://', 'http://']) {
    assert.equal(pySlice.includes(forbidden), false, `LangChain Python surface must not contain ${forbidden}`);
  }
});
