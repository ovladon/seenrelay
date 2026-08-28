import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  SeenRelayZeroState,
  createAesGcmPrivateCodec,
  freshResult,
  notModifiedResult
} from '../clients/typescript/dist/zero-state.js';

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.get(key); },
    async set(key, value) { map.set(key, value); }
  };
}

const coordinate = { tool: 'catalog.read', arguments: { id: 7, locale: 'en' } };

function relayStub() {
  return {
    checks: 0,
    observes: 0,
    async check() { this.checks += 1; return { status: 'UNKNOWN' }; },
    async observe() { this.observes += 1; }
  };
}

test('private L1 requires encrypted codec and caller-owned store together', () => {
  const store = memoryStore();
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  assert.throws(() => new SeenRelayZeroState({ privateStore: store }), /configured together/);
  assert.throws(() => new SeenRelayZeroState({ privateCodec: codec }), /configured together/);
  assert.throws(() => createAesGcmPrivateCodec(randomBytes(16)), /exactly 32 bytes/);
});

test('two independent workers reuse an explicitly fresh encrypted private L1 result with zero L2 CHECKs', async () => {
  const store = memoryStore();
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  const relay = relayStub();
  let validations = 0;

  const first = new SeenRelayZeroState({
    privateStore: store,
    privateCodec: codec,
    privateMaxAgeMs: 60_000,
    relayClient: relay,
    relayMode: 'off'
  });
  const second = new SeenRelayZeroState({
    privateStore: store,
    privateCodec: codec,
    privateMaxAgeMs: 60_000,
    relayClient: relay,
    relayMode: 'off'
  });

  const firstOutcome = await first.guard({
    coordinate,
    validate: async () => { validations += 1; return { secret: 'private-value', n: 1 }; }
  });
  const secondOutcome = await second.guard({
    coordinate,
    validate: async () => { validations += 1; return { secret: 'should-not-run', n: 2 }; }
  });

  assert.equal(firstOutcome.path, 'validated');
  assert.equal(secondOutcome.path, 'private_reuse');
  assert.deepEqual(secondOutcome.value, { secret: 'private-value', n: 1 });
  assert.equal(validations, 1);
  assert.equal(relay.checks, 0);
  assert.equal(second.getTelemetry().privateFreshHits, 1);
  assert.equal(second.getTelemetry().relayCheckCalls, 0);

  assert.equal(store.map.size, 1);
  const [[storedKey, sealed]] = [...store.map.entries()];
  assert.match(storedKey, /^sha256:[0-9a-f]{64}$/);
  assert.match(sealed, /^aes256gcm-v1\./);
  assert.equal(storedKey.includes('catalog.read'), false);
  assert.equal(sealed.includes('private-value'), false);
});

test('private L1 can carry a source-native validator across workers without granting stale reuse', async () => {
  const store = memoryStore();
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  const relay = relayStub();
  let sourceCalls = 0;

  const first = new SeenRelayZeroState({
    privateStore: store,
    privateCodec: codec,
    privateMaxAgeMs: 0,
    privateValidatorRetentionMs: 60_000,
    relayClient: relay,
    relayMode: 'always'
  });
  await first.guard({
    coordinate,
    validate: async () => {
      sourceCalls += 1;
      return freshResult({ price: 9 }, { etag: '"v9"' });
    }
  });

  const second = new SeenRelayZeroState({
    privateStore: store,
    privateCodec: codec,
    privateMaxAgeMs: 0,
    privateValidatorRetentionMs: 60_000,
    relayClient: relay,
    relayMode: 'always'
  });
  const outcome = await second.guard({
    coordinate,
    validate: async ({ conditionalHeaders }) => {
      sourceCalls += 1;
      assert.equal(conditionalHeaders['If-None-Match'], '"v9"');
      return notModifiedResult({ etag: '"v9"' });
    }
  });

  assert.equal(outcome.path, 'source_not_modified');
  assert.deepEqual(outcome.value, { price: 9 });
  assert.equal(sourceCalls, 2);
  assert.equal(relay.checks, 1, 'first worker had no prior validator and relayMode=always; second must not add another CHECK');
  assert.equal(second.getTelemetry().relayCheckCalls, 0);
  assert.equal(second.getTelemetry().sourceNotModifiedHits, 1);
});

test('private store failures are fail-open and never suppress the original validator', async () => {
  let validations = 0;
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  const brokenStore = {
    async get() { throw new Error('storage offline'); },
    async set() { throw new Error('storage offline'); }
  };
  const edge = new SeenRelayZeroState({
    privateStore: brokenStore,
    privateCodec: codec,
    privateMaxAgeMs: 60_000,
    relayMode: 'off'
  });
  const outcome = await edge.guard({
    coordinate,
    validate: async () => { validations += 1; return 42; }
  });
  assert.equal(outcome.value, 42);
  assert.equal(validations, 1);
  assert.equal(edge.getTelemetry().privateReadFailures, 1);
  assert.equal(edge.getTelemetry().privateWriteFailures, 1);
});

test('AES-GCM private payload is bound to its coordinate key and cannot be swapped', async () => {
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  const sealed = await codec.seal({ value: 'x', confirmedAtMs: 1 }, 'sha256:aaa');
  const opened = await codec.open(sealed, 'sha256:aaa');
  assert.equal(opened.value, 'x');
  await assert.rejects(async () => codec.open(sealed, 'sha256:bbb'));
});

test('tampered private ciphertext fails open to validation', async () => {
  let validations = 0;
  const codec = createAesGcmPrivateCodec(randomBytes(32));
  const store = {
    async get() { return 'aes256gcm-v1.bad.bad.bad'; },
    async set() {}
  };
  const edge = new SeenRelayZeroState({
    privateStore: store,
    privateCodec: codec,
    privateMaxAgeMs: 60_000,
    relayMode: 'off'
  });
  const outcome = await edge.guard({
    coordinate,
    validate: async () => { validations += 1; return 'source'; }
  });
  assert.equal(outcome.value, 'source');
  assert.equal(validations, 1);
  assert.equal(edge.getTelemetry().privateReadFailures, 1);
});
