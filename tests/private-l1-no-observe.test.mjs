import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SeenRelayZeroState, createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

function memoryStore() {
  const map = new Map();
  return {
    async get(key) { return map.get(key); },
    async set(key, value) { map.set(key, value); }
  };
}

test('private L1 reuse never re-labels cached evidence as a new independent OBSERVE', async () => {
  const store = memoryStore();
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  const relay = {
    checks: 0,
    observes: 0,
    async check() { this.checks += 1; return { status: 'UNKNOWN' }; },
    async observe() { this.observes += 1; }
  };
  const tasks = [];
  const options = {
    privateStore: store,
    privateCodec: codec,
    privateMaxAgeMs: 60_000,
    relayClient: relay,
    relayMode: 'off',
    scheduleObserve: (task) => tasks.push(task)
  };
  const coordinate = { tool: 'read', arguments: { id: 1 } };
  const relayOptions = {
    fact: { subject: 'x', predicate: 'x.value', source: 'https://example.test/x' },
    knownValue: 'old',
    contribute: true
  };

  const first = new SeenRelayZeroState(options);
  await first.guard({ coordinate, relay: relayOptions, validate: async () => 'fresh-source-value' });
  assert.equal(tasks.length, 1);
  await tasks.shift()();
  assert.equal(relay.observes, 1);

  const second = new SeenRelayZeroState(options);
  const outcome = await second.guard({
    coordinate,
    relay: relayOptions,
    validate: async () => { throw new Error('private hit should suppress validation'); }
  });
  assert.equal(outcome.path, 'private_reuse');
  assert.equal(tasks.length, 0);
  assert.equal(relay.observes, 1);
  assert.equal(relay.checks, 0);
});
