import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SeenRelayZeroState,
  freshResult,
  notModifiedResult,
  createConditionalFetchValidator
} from '../clients/typescript/dist/zero-state.js';

const coordinate = { tool: 'example.read', args: { id: 42, locale: 'en' } };
const fact = { subject: 'Example', predicate: 'example.value', source: 'https://example.test/42' };

function relayStub() {
  return {
    checks: 0,
    observes: 0,
    async check() { this.checks += 1; return { status: 'SAME_OBSERVED' }; },
    async observe() { this.observes += 1; return { ok: true }; }
  };
}

test('global-zero mode creates local value with zero L2 CHECKs on the hot path', async () => {
  const relay = relayStub();
  let validations = 0;
  const edge = new SeenRelayZeroState({ relayClient: relay, relayMode: 'off', localMaxAgeMs: 60_000 });
  const options = {
    coordinate,
    relay: { fact, knownValue: 7, contribute: false },
    validate: async () => { validations += 1; return 7; }
  };

  const first = await edge.guard(options);
  const second = await edge.guard(options);

  assert.equal(first.path, 'validated');
  assert.equal(second.path, 'local_reuse');
  assert.equal(first.value, 7);
  assert.equal(second.value, 7);
  assert.equal(validations, 1);
  assert.equal(relay.checks, 0);
  assert.equal(edge.getTelemetry().relayCheckCalls, 0);
  assert.equal(edge.getTelemetry().localFreshHits, 1);
});

test('simultaneous exact coordinates are coalesced without any relay dependency', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let validations = 0;
  const edge = new SeenRelayZeroState({ relayMode: 'off' });
  const options = {
    coordinate,
    validate: async () => { validations += 1; await gate; return { answer: 42 }; }
  };

  const a = edge.guard(options);
  const b = edge.guard(options);
  release();
  const [ra, rb] = await Promise.all([a, b]);

  assert.deepEqual(ra.value, { answer: 42 });
  assert.deepEqual(rb.value, { answer: 42 });
  assert.equal(validations, 1);
  assert.equal(edge.getTelemetry().inflightCoalesced, 1);
});

test('expired local result uses a retained source validator and 304 refreshes locally', async () => {
  let now = 1_000;
  let calls = 0;
  const seenHeaders = [];
  const edge = new SeenRelayZeroState({
    relayMode: 'off',
    localMaxAgeMs: 100,
    validatorRetentionMs: 10_000,
    now: () => now
  });

  const options = {
    coordinate,
    validate: async ({ conditionalHeaders }) => {
      calls += 1;
      seenHeaders.push({ ...conditionalHeaders });
      if (calls === 1) return freshResult({ price: 9 }, { etag: '"v1"' });
      return notModifiedResult({ etag: '"v1"' });
    }
  };

  const first = await edge.guard(options);
  now += 500;
  const second = await edge.guard(options);

  assert.equal(first.path, 'validated');
  assert.equal(second.path, 'source_not_modified');
  assert.deepEqual(second.value, { price: 9 });
  assert.deepEqual(seenHeaders[0], {});
  assert.deepEqual(seenHeaders[1], { 'If-None-Match': '"v1"' });
  assert.equal(edge.getTelemetry().sourceConditionalAttempts, 1);
  assert.equal(edge.getTelemetry().sourceNotModifiedHits, 1);
});

test('sample mode with probability zero makes exactly zero relay CHECKs', async () => {
  const relay = relayStub();
  const edge = new SeenRelayZeroState({ relayClient: relay, relayMode: 'sample', relaySampleRate: 0, localMaxAgeMs: 0 });
  for (let i = 0; i < 20; i += 1) {
    await edge.guard({
      coordinate: { ...coordinate, nonce: i },
      relay: { fact, knownValue: i },
      validate: async () => i
    });
  }
  assert.equal(relay.checks, 0);
  assert.equal(edge.getTelemetry().relayCheckCalls, 0);
});

test('relay CHECK is an explicit accelerator and can reuse only through caller policy', async () => {
  const relay = relayStub();
  let validations = 0;
  const edge = new SeenRelayZeroState({ relayClient: relay, relayMode: 'always', localMaxAgeMs: 0 });
  const outcome = await edge.guard({
    coordinate,
    relay: {
      fact,
      knownValue: 11,
      reuse: (check, known) => check.status === 'SAME_OBSERVED' ? { reuse: true, value: known } : { reuse: false }
    },
    validate: async () => { validations += 1; return 11; }
  });

  assert.equal(outcome.path, 'relay_reuse');
  assert.equal(outcome.value, 11);
  assert.equal(validations, 0);
  assert.equal(relay.checks, 1);
  assert.equal(edge.getTelemetry().relayCheckReuseHits, 1);
});

test('OBSERVE contribution is scheduled after independent validation and never required for local value', async () => {
  const relay = relayStub();
  const tasks = [];
  const edge = new SeenRelayZeroState({
    relayClient: relay,
    relayMode: 'off',
    scheduleObserve: (task) => tasks.push(task)
  });

  const outcome = await edge.guard({
    coordinate,
    relay: { fact, knownValue: 'old', contribute: true },
    validate: async () => freshResult('new', { lastModified: 'Fri, 28 Aug 2026 12:00:00 GMT' })
  });

  assert.equal(outcome.path, 'validated');
  assert.equal(relay.checks, 0);
  assert.equal(relay.observes, 0);
  assert.equal(tasks.length, 1);
  assert.equal(edge.getTelemetry().relayObserveScheduled, 1);
  await tasks[0]();
  assert.equal(relay.observes, 1);
});

test('scheduled-only contribution without a platform scheduler adds no blocking network call', async () => {
  const relay = relayStub();
  const edge = new SeenRelayZeroState({ relayClient: relay, relayMode: 'off' });
  const outcome = await edge.guard({
    coordinate,
    relay: { fact, knownValue: 1, contribute: true },
    validate: async () => 2
  });
  assert.equal(outcome.value, 2);
  assert.equal(relay.observes, 0);
  assert.equal(edge.getTelemetry().relayObserveSkippedNoScheduler, 1);
});

test('conditional fetch helper permits read-only GET and turns source 304 into not-modified', async () => {
  let captured;
  const validator = createConditionalFetchValidator({
    url: 'https://example.test/item',
    fetchImpl: async (_url, init) => {
      captured = init;
      return new Response(null, { status: 304, headers: { etag: '"abc"' } });
    }
  });
  const result = await validator({ conditionalHeaders: { 'If-None-Match': '"abc"' } });
  assert.equal(result.__seenrelay_zero_state_result_v1, 'not-modified');
  assert.equal(result.sourceValidator.etag, '"abc"');
  assert.equal(captured.method, 'GET');
  assert.equal(captured.headers.get('If-None-Match'), '"abc"');

  assert.throws(() => createConditionalFetchValidator({ url: 'https://example.test', init: { method: 'POST' } }), /only supports GET or HEAD/);
});
