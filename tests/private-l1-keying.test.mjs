import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SeenRelayZeroState, createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

test('private L1 backend receives only opaque coordinate key and sealed payload', async () => {
  let receivedKey;
  let receivedValue;
  const store = {
    async get() { return null; },
    async set(key, value) { receivedKey = key; receivedValue = value; }
  };
  const edge = new SeenRelayZeroState({
    privateStore: store,
    privateCodec: createAesGcmPrivateCodec(randomBytes(32)),
    privateMaxAgeMs: 1000
  });
  await edge.guard({
    coordinate: { tool: 'private.read', arguments: { authorization: 'Bearer do-not-store-raw' } },
    validate: async () => ({ payload: 'sensitive-result' })
  });
  assert.match(receivedKey, /^sha256:[0-9a-f]{64}$/);
  assert.equal(receivedKey.includes('do-not-store-raw'), false);
  assert.match(receivedValue, /^aes256gcm-v1\./);
  assert.equal(receivedValue.includes('sensitive-result'), false);
});
