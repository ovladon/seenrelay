import test from 'node:test';
import assert from 'node:assert/strict';
import { SeenRelayZeroState, freshResult, notModifiedResult } from '../clients/typescript/dist/zero-state.js';
import { SeenRelayAuto, exactToolAdapter, jsonHttpToolAdapter, protectToolDispatcher } from '../clients/typescript/dist/auto.js';

test('one dispatcher binding protects allowlisted reads while mutations pass through untouched', async () => {
  let executions = 0;
  const calls = [];
  const dispatcher = async (call) => {
    executions += 1;
    calls.push(call);
    return { execution: executions, name: call.name };
  };
  const { execute, auto } = protectToolDispatcher(dispatcher, {
    edgeOptions: { relayMode: 'off', localMaxAgeMs: 60_000 },
    adapters: [exactToolAdapter({ toolNames: ['catalog.read'], maxAgeMs: 60_000 })]
  });

  const a = await execute({ name: 'catalog.read', arguments: { id: 7 } });
  const b = await execute({ name: 'catalog.read', arguments: { id: 7 } });
  const m1 = await execute({ name: 'catalog.update', arguments: { id: 7, value: 1 } });
  const m2 = await execute({ name: 'catalog.update', arguments: { id: 7, value: 1 } });

  assert.deepEqual(a, b);
  assert.notDeepEqual(m1, m2);
  assert.equal(executions, 3);
  assert.equal(auto.getTelemetry().protectedCalls, 2);
  assert.equal(auto.getTelemetry().passthroughCalls, 2);
  assert.equal(auto.getTelemetry().edge.relayCheckCalls, 0);
  assert.equal(calls.filter((call) => call.name === 'catalog.update').length, 2);
});

test('exact tool identity includes all arguments by default so differing calls never collapse', async () => {
  let executions = 0;
  const { execute } = protectToolDispatcher(async (call) => ({ n: ++executions, id: call.arguments.id }), {
    adapters: [exactToolAdapter({ toolNames: ['catalog.read'], maxAgeMs: 60_000 })]
  });
  const a = await execute({ name: 'catalog.read', arguments: { id: 1 } });
  const b = await execute({ name: 'catalog.read', arguments: { id: 2 } });
  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
  assert.equal(executions, 2);
});

test('ambiguous automatic adapters fail closed instead of guessing an optimization policy', async () => {
  const auto = new SeenRelayAuto({
    adapters: [
      exactToolAdapter({ name: 'one', toolNames: ['catalog.read'] }),
      exactToolAdapter({ name: 'two', toolNames: ['catalog.read'] })
    ]
  });
  const execute = auto.wrap(async () => 1);
  await assert.rejects(execute({ name: 'catalog.read', arguments: {} }), /adapter ambiguity/);
  assert.equal(auto.getTelemetry().ambiguousMatches, 1);
});

test('HTTP-style adapter reuses source-native validator after local freshness expires', async () => {
  let now = 1000;
  let executions = 0;
  const received = [];
  const edge = new SeenRelayZeroState({ relayMode: 'off', localMaxAgeMs: 10, validatorRetentionMs: 1000, now: () => now });
  const adapter = jsonHttpToolAdapter({
    toolNames: ['http.get'],
    maxAgeMs: 10,
    urlFromCall: (call) => call.arguments.url,
    identityFromCall: (call) => ({ url: call.arguments.url, accept: call.arguments.accept ?? 'application/json' }),
    normalizeResult: (result) => result.status === 304
      ? notModifiedResult({ etag: result.etag })
      : freshResult(result.body, { etag: result.etag })
  });
  const execute = new SeenRelayAuto({ edge, adapters: [adapter] }).wrap(async (call) => {
    executions += 1;
    received.push(call);
    if (executions === 1) return { status: 200, body: { value: 5 }, etag: '"v1"' };
    return { status: 304, etag: '"v1"' };
  });

  const first = await execute({ name: 'http.get', arguments: { url: 'https://example.test/x' } });
  now += 100;
  const second = await execute({ name: 'http.get', arguments: { url: 'https://example.test/x' } });

  assert.deepEqual(first, { value: 5 });
  assert.deepEqual(second, { value: 5 });
  assert.equal(received[1].arguments.headers['If-None-Match'], '"v1"');
  assert.equal(edge.getTelemetry().sourceNotModifiedHits, 1);
  assert.equal(edge.getTelemetry().relayCheckCalls, 0);
});
