import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  InMemoryFleetCoordinationStore,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function codec() {
  return fleetCodecFromPrivateCodec(createAesGcmPrivateCodec(randomBytes(32)));
}

const coordinate = {
  provider: 'openai',
  operation: 'responses',
  model: 'gpt-example',
  request: { prompt: 'same' }
};

const shareablePolicy = {
  sideEffectClass: 'read_only',
  exactSingleAnswerShareable: true,
  independentSamplesRequired: false
};

test('two fleet coordinator instances collapse one exact shareable execution', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    await sleep(30);
    return { answer: 42 };
  };

  const [ra, rb] = await Promise.all([
    a.run({ coordinate, policy: shareablePolicy, execute }),
    b.run({ coordinate, policy: shareablePolicy, execute })
  ]);

  assert.deepEqual(ra, { answer: 42 });
  assert.deepEqual(rb, { answer: 42 });
  assert.equal(executions, 1);
  assert.equal(a.getTelemetry().leaderExecutions + b.getTelemetry().leaderExecutions, 1);
  assert.equal(a.getTelemetry().followerReuses + b.getTelemetry().followerReuses, 1);
});

test('completed fleet result is not a sequential cache entry', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const c = new SeenRelayFleetCoordinator({ store, codec: codec(), scopeKey: 'tenant-fleet-a' });
  let executions = 0;
  const execute = async () => ++executions;

  assert.equal(await c.run({ coordinate, policy: shareablePolicy, execute }), 1);
  assert.equal(await c.run({ coordinate, policy: shareablePolicy, execute }), 2);
  assert.equal(executions, 2);
});

test('different fleet scopes never coordinate', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-b', pollMs: 2 });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    await sleep(20);
    return executions;
  };

  await Promise.all([
    a.run({ coordinate, policy: shareablePolicy, execute }),
    b.run({ coordinate, policy: shareablePolicy, execute })
  ]);

  assert.equal(executions, 2);
});

test('unsafe or underspecified policies pass through', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const c = new SeenRelayFleetCoordinator({ store, codec: codec(), scopeKey: 'tenant-fleet-a' });
  let executions = 0;
  const execute = async () => ++executions;

  await c.run({
    coordinate,
    policy: { sideEffectClass: 'mutation', exactSingleAnswerShareable: true },
    execute
  });
  await c.run({
    coordinate,
    policy: { sideEffectClass: 'read_only', independentSamplesRequired: true, exactSingleAnswerShareable: true },
    execute
  });
  await c.run({
    coordinate,
    policy: { sideEffectClass: 'read_only' },
    execute
  });

  assert.equal(executions, 3);
  assert.equal(c.getTelemetry().policyPassthrough, 3);
});

test('zero-cost provider-native exact response cache wins before fleet coordination', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const c = new SeenRelayFleetCoordinator({ store, codec: codec(), scopeKey: 'tenant-fleet-a' });
  let executions = 0;
  const result = await c.run({
    coordinate,
    policy: {
      ...shareablePolicy,
      nativeControl: { exactResponseCache: true, cacheHitMarginalCostZero: true }
    },
    execute: async () => ++executions
  });

  assert.equal(result, 1);
  assert.equal(executions, 1);
  assert.equal(c.getTelemetry().nativeControlPassthrough, 1);
  assert.equal(c.getTelemetry().leaderClaims, 0);
});

test('leader failure causes follower to fail open instead of inheriting a false success', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });

  let calls = 0;
  const leader = a.run({
    coordinate,
    policy: shareablePolicy,
    execute: async () => {
      calls += 1;
      await sleep(15);
      throw new Error('provider failed');
    }
  });
  await sleep(2);
  const follower = b.run({
    coordinate,
    policy: shareablePolicy,
    execute: async () => {
      calls += 1;
      return { fallback: true };
    }
  });

  await assert.rejects(leader, /provider failed/);
  assert.deepEqual(await follower, { fallback: true });
  assert.equal(calls, 2);
  assert.equal(b.getTelemetry().failOpenExecutions, 1);
});

test('oversize shared result remains leader-local and is never distributed', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const c = new SeenRelayFleetCoordinator({
    store,
    codec: codec(),
    scopeKey: 'tenant-fleet-a',
    maxSealedBytes: 64
  });
  const value = await c.run({
    coordinate,
    policy: shareablePolicy,
    execute: async () => ({ blob: 'x'.repeat(1000) })
  });
  assert.equal(value.blob.length, 1000);
  assert.equal(c.getTelemetry().oversizeResults, 1);
});

test('Redis REST fleet store sends atomic Lua claim/publish commands without exposing raw scope', async () => {
  const calls = [];
  const pending = 'P|generation-a|owner-a|9999999999999';
  const fakeFetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    calls.push(command);
    if (command[0] === 'EVAL' && String(command[1]).includes("return {1, ARGV[1]}")) {
      return new Response(JSON.stringify({ result: [1, pending] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (command[0] === 'EVAL' && String(command[1]).includes("redis.call('SET', KEYS[2]")) {
      return new Response(JSON.stringify({ result: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (command[0] === 'GET') {
      return new Response(JSON.stringify({ result: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ result: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const store = createRedisRestFleetStore({
    url: 'https://redis.example',
    token: 'secret-token',
    fetchImpl: fakeFetch,
    now: () => 1000
  });
  const claim = await store.tryClaim({
    scopeHash: 'scopehash',
    coordinateKey: 'coordinatehash',
    ownerId: 'owner-a',
    leaseMs: 1000
  });
  assert.equal(claim.role, 'leader');
  await store.publish({
    scopeHash: 'scopehash',
    coordinateKey: 'coordinatehash',
    generation: claim.generation,
    ownerId: 'owner-a',
    pendingToken: claim.pendingToken,
    sealedResult: 'ciphertext'
  });

  assert.equal(calls[0][0], 'EVAL');
  assert.equal(calls[0][3].includes('scopehash'), true);
  assert.equal(calls[0][3].includes('tenant-fleet-a'), false);
  assert.equal(calls[1][0], 'EVAL');
});
