import test from 'node:test';
import assert from 'node:assert/strict';
import { SeenRelayZeroState, freshResult, notModifiedResult } from '../clients/typescript/dist/zero-state.js';

const coordinate = { tool: 'read', arguments: { id: 1 } };
const fact = { subject: 'Example', predicate: 'example.value', source: 'https://example.test/1' };

test('default TTL zero neither reuses nor retains a raw result without a source validator', async () => {
  let validations = 0;
  const edge = new SeenRelayZeroState();
  const options = {
    coordinate,
    validate: async () => { validations += 1; return validations; }
  };
  const first = await edge.guard(options);
  const second = await edge.guard(options);
  assert.equal(first.value, 1);
  assert.equal(second.value, 2);
  assert.equal(validations, 2);
  assert.equal(edge.getTelemetry().localFreshHits, 0);
  assert.equal(edge.getTelemetry().relayCheckCalls, 0);
  assert.equal(edge.getTelemetry().cacheEntries, 0);
});

test('OBSERVE scheduler failure is fail-open after successful independent validation', async () => {
  const relay = {
    async check() { throw new Error('CHECK should not run'); },
    async observe() { throw new Error('OBSERVE should not be reached'); }
  };
  const edge = new SeenRelayZeroState({
    relayClient: relay,
    scheduleObserve: () => { throw new Error('scheduler unavailable'); }
  });
  const outcome = await edge.guard({
    coordinate,
    relay: { fact, knownValue: 'old', contribute: true },
    validate: async () => 'new'
  });
  assert.equal(outcome.value, 'new');
  assert.equal(outcome.path, 'validated');
  assert.equal(edge.getTelemetry().relayObserveScheduleFailures, 1);
  assert.equal(edge.getTelemetry().relayCheckCalls, 0);
});

test('retained source-native validator is attempted before an enabled relay CHECK', async () => {
  let now = 1000;
  let validations = 0;
  const relay = {
    checks: 0,
    async check() { this.checks += 1; return { status: 'SAME_OBSERVED' }; },
    async observe() {}
  };
  const edge = new SeenRelayZeroState({
    relayClient: relay,
    relayMode: 'off',
    localMaxAgeMs: 0,
    validatorRetentionMs: 10_000,
    now: () => now
  });

  await edge.guard({
    coordinate,
    validate: async () => {
      validations += 1;
      return freshResult(5, { etag: '"v5"' });
    }
  });
  assert.equal(validations, 1);
  assert.equal(edge.getTelemetry().cacheEntries, 1);

  edge.relayMode = 'always';
  now += 100;
  const confirmed = await edge.guard({
    coordinate,
    relay: { fact, knownValue: 5, reuse: () => ({ reuse: true, value: 5 }) },
    validate: async ({ conditionalHeaders }) => {
      validations += 1;
      assert.equal(conditionalHeaders['If-None-Match'], '"v5"');
      return notModifiedResult({ etag: '"v5"' });
    }
  });

  assert.equal(confirmed.path, 'source_not_modified');
  assert.equal(relay.checks, 0);
  assert.equal(validations, 2);
});
