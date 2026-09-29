import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  InMemoryFleetCoordinationStore,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec,
  createFleetSavingsLedger,
  SeenRelayFleetShadowMeter,
  wrapFleetShadowCall
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


test('Redis REST read closes the publish race between result GET and completed lock GET', async () => {
  let resultReads = 0;
  const generation = 'generation-race';
  const ownerId = 'owner-race';
  const completedToken = `C|${generation}|${ownerId}|9999999999999`;
  const fakeFetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    if (command[0] === 'GET' && String(command[1]).includes(':result:')) {
      resultReads += 1;
      return new Response(
        JSON.stringify({ result: resultReads === 1 ? null : 'ciphertext-after-publish' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (command[0] === 'GET' && String(command[1]).endsWith(':lock')) {
      return new Response(
        JSON.stringify({ result: completedToken }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    throw new Error('unexpected command '+JSON.stringify(command));
  };

  const store = createRedisRestFleetStore({
    url: 'https://redis.example',
    token: 'secret-token',
    fetchImpl: fakeFetch,
    now: () => 1000
  });

  const state = await store.read({
    scopeHash: 'scopehash',
    coordinateKey: 'coordinatehash',
    generation,
    pendingToken: `P|${generation}|${ownerId}|9999999999999`
  });

  assert.deepEqual(state, { status: 'completed', sealedResult: 'ciphertext-after-publish' });
  assert.equal(resultReads, 2);
});


test('Redis REST URL normalization handles long trailing-slash input without regex backtracking', async () => {
  const longUrl = 'https://redis.example' + '/'.repeat(100_000);
  const seen = [];
  const store = createRedisRestFleetStore({
    url: longUrl,
    token: 'secret-token',
    fetchImpl: async (url, init) => {
      seen.push(url);
      const command = JSON.parse(init.body);
      if (command[0] === 'EVAL') {
        return new Response(JSON.stringify({ result: [1, command[4]] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ result: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    now: () => 1000
  });
  const claim = await store.tryClaim({
    scopeHash: 'scopehash',
    coordinateKey: 'coordinatehash',
    ownerId: 'owner-a',
    leaseMs: 1000
  });
  assert.equal(claim.role, 'leader');
  assert.equal(seen[0], 'https://redis.example');
});


test('follower reuse emits one conservative avoided-execution receipt and ledger value', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const ledger = createFleetSavingsLedger();
  const receipts = [];
  const onReceipt = (receipt) => {
    receipts.push(receipt);
    ledger.record(receipt);
  };
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    await sleep(30);
    return { answer: 42 };
  };

  await Promise.all([
    a.run({
      coordinate,
      policy: shareablePolicy,
      execute,
      cost: { marginalCostUsd: 1.44, provenance: 'provider_list_price' },
      onReceipt
    }),
    b.run({
      coordinate,
      policy: shareablePolicy,
      execute,
      cost: { marginalCostUsd: 1.44, provenance: 'provider_list_price' },
      onReceipt
    })
  ]);

  assert.equal(executions, 1);
  assert.equal(receipts.length, 2);
  const follower = receipts.find((r) => r.path === 'follower_reuse');
  const leader = receipts.find((r) => r.path === 'leader_execution');
  assert.ok(follower);
  assert.ok(leader);
  assert.equal(follower.avoidedExecutions, 1);
  assert.equal(follower.grossAvoidedCostUsd, 1.44);
  assert.equal(follower.costProvenance, 'provider_list_price');
  assert.equal(leader.avoidedExecutions, 0);
  assert.equal(leader.grossAvoidedCostUsd, null);

  const snapshot = ledger.snapshot();
  assert.equal(snapshot.receipts, 2);
  assert.equal(snapshot.authoritativeExecutions, 1);
  assert.equal(snapshot.followerReuses, 1);
  assert.equal(snapshot.avoidedExecutions, 1);
  assert.equal(snapshot.costedAvoidedExecutions, 1);
  assert.equal(snapshot.uncostedAvoidedExecutions, 0);
  assert.ok(Math.abs(snapshot.grossAvoidedCostUsd - 1.44) < 1e-12);

  assert.equal(a.getTelemetry().avoidedExecutions + b.getTelemetry().avoidedExecutions, 1);
  assert.ok(Math.abs(a.getTelemetry().grossAvoidedCostUsd + b.getTelemetry().grossAvoidedCostUsd - 1.44) < 1e-12);
});

test('follower reuse remains measurable when dollar cost is unknown', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const ledger = createFleetSavingsLedger();
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    await sleep(25);
    return { answer: 7 };
  };

  await Promise.all([
    a.run({ coordinate, policy: shareablePolicy, execute, onReceipt: ledger.record }),
    b.run({ coordinate, policy: shareablePolicy, execute, onReceipt: ledger.record })
  ]);

  const snapshot = ledger.snapshot();
  assert.equal(executions, 1);
  assert.equal(snapshot.avoidedExecutions, 1);
  assert.equal(snapshot.uncostedAvoidedExecutions, 1);
  assert.equal(snapshot.costedAvoidedExecutions, 0);
  assert.equal(snapshot.grossAvoidedCostUsd, 0);
});

test('result-derived cost resolver can cost a follower reuse without affecting coordination', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const receipts = [];
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    await sleep(25);
    return { usage: { billedUsd: 0.75 }, answer: 9 };
  };
  const cost = {
    provenance: 'provider_reported',
    resolveMarginalCostUsd: (value) => value.usage.billedUsd
  };

  await Promise.all([
    a.run({ coordinate, policy: shareablePolicy, execute, cost, onReceipt: (r) => receipts.push(r) }),
    b.run({ coordinate, policy: shareablePolicy, execute, cost, onReceipt: (r) => receipts.push(r) })
  ]);

  assert.equal(executions, 1);
  const follower = receipts.find((r) => r.path === 'follower_reuse');
  assert.equal(follower.costResolution, 'resolved');
  assert.equal(follower.costProvenance, 'provider_reported');
  assert.equal(follower.grossAvoidedCostUsd, 0.75);
});

test('receipt callback failure never changes the authoritative or reused result', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const sharedCodec = codec();
  const a = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  const b = new SeenRelayFleetCoordinator({ store, codec: sharedCodec, scopeKey: 'tenant-fleet-a', pollMs: 2 });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    await sleep(25);
    return { answer: 42 };
  };
  const badReceipt = () => { throw new Error('analytics down'); };

  const [ra, rb] = await Promise.all([
    a.run({ coordinate, policy: shareablePolicy, execute, cost: 0.1, onReceipt: badReceipt }),
    b.run({ coordinate, policy: shareablePolicy, execute, cost: 0.1, onReceipt: badReceipt })
  ]);

  assert.deepEqual(ra, { answer: 42 });
  assert.deepEqual(rb, { answer: 42 });
  assert.equal(executions, 1);
  assert.equal(a.getTelemetry().receiptFailures + b.getTelemetry().receiptFailures, 2);
});

test('malformed cost metadata never converts a successful operation into an error', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const c = new SeenRelayFleetCoordinator({ store, codec: codec(), scopeKey: 'tenant-fleet-a' });
  const receipts = [];
  const value = await c.run({
    coordinate,
    policy: shareablePolicy,
    execute: async () => ({ answer: 1 }),
    cost: { marginalCostUsd: -5, provenance: 'bad' },
    onReceipt: (r) => receipts.push(r)
  });
  assert.deepEqual(value, { answer: 1 });
  assert.equal(c.getTelemetry().receiptFailures, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].grossAvoidedCostUsd, null);
});

test('native and policy passthrough receipts never claim avoided executions', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const c = new SeenRelayFleetCoordinator({ store, codec: codec(), scopeKey: 'tenant-fleet-a' });
  const receipts = [];

  await c.run({
    coordinate,
    policy: { sideEffectClass: 'mutation', exactSingleAnswerShareable: true },
    execute: async () => 1,
    cost: 1,
    onReceipt: (r) => receipts.push(r)
  });
  await c.run({
    coordinate,
    policy: {
      ...shareablePolicy,
      nativeControl: { exactResponseCache: true, cacheHitMarginalCostZero: true }
    },
    execute: async () => 2,
    cost: 1,
    onReceipt: (r) => receipts.push(r)
  });

  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].avoidedExecutions, 0);
  assert.equal(receipts[1].avoidedExecutions, 0);
  assert.equal(receipts[0].grossAvoidedCostUsd, null);
  assert.equal(receipts[1].grossAvoidedCostUsd, null);
});


test('distributed shadow meter observes overlap without suppressing either authoritative call', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const a = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  const b = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  let executions = 0;

  const execute = async () => {
    executions += 1;
    const own = executions;
    await sleep(30);
    return { own };
  };

  const [ra, rb] = await Promise.all([
    a.measure({
      coordinate,
      policy: shareablePolicy,
      execute,
      cost: { marginalCostUsd: 0.6, provenance: 'provider_list_price' }
    }),
    b.measure({
      coordinate,
      policy: shareablePolicy,
      execute,
      cost: { marginalCostUsd: 0.6, provenance: 'provider_list_price' }
    })
  ]);

  assert.equal(executions, 2);
  assert.notDeepEqual(ra, rb);

  const reports = [a.getReport(), b.getReport()];
  assert.equal(reports.reduce((n, r) => n + r.authoritativeExecutions, 0), 2);
  assert.equal(reports.reduce((n, r) => n + r.shadowLeaderStarts, 0), 1);
  assert.equal(reports.reduce((n, r) => n + r.callsWithIdenticalInflightPredecessor, 0), 1);
  assert.equal(reports.reduce((n, r) => n + r.overlappedFollowerCostedExecutions, 0), 1);
  assert.ok(Math.abs(reports.reduce((n, r) => n + r.overlappedFollowerObservedCostUsd, 0) - 0.6) < 1e-12);
  assert.equal(reports.every((r) => r.authoritativeSuppressionEnabled === false), true);
});

test('distributed shadow meter reports zero overlap for sequential exact calls', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const meter = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  let executions = 0;

  await meter.measure({
    coordinate,
    policy: shareablePolicy,
    execute: async () => ++executions
  });
  await meter.measure({
    coordinate,
    policy: shareablePolicy,
    execute: async () => ++executions
  });

  const report = meter.getReport();
  assert.equal(executions, 2);
  assert.equal(report.shadowLeaderStarts, 2);
  assert.equal(report.callsWithIdenticalInflightPredecessor, 0);
  assert.equal(report.classifiedOverlapStartFraction, 0);
});

test('shadow meter excludes mutation, independent sampling, and dominating native exact cache from overlap candidacy', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const meter = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  let executions = 0;

  await Promise.all([
    meter.measure({
      coordinate,
      policy: { sideEffectClass: 'mutation', exactSingleAnswerShareable: true },
      execute: async () => { executions += 1; await sleep(10); return 1; }
    }),
    meter.measure({
      coordinate,
      policy: { sideEffectClass: 'read_only', exactSingleAnswerShareable: true, independentSamplesRequired: true },
      execute: async () => { executions += 1; await sleep(10); return 2; }
    }),
    meter.measure({
      coordinate,
      policy: {
        ...shareablePolicy,
        nativeControl: { exactResponseCache: true, cacheHitMarginalCostZero: true }
      },
      execute: async () => { executions += 1; await sleep(10); return 3; }
    })
  ]);

  const report = meter.getReport();
  assert.equal(executions, 3);
  assert.equal(report.policyIneligibleCalls, 2);
  assert.equal(report.nativeControlDominatedCalls, 1);
  assert.equal(report.eligibleCalls, 0);
  assert.equal(report.callsWithIdenticalInflightPredecessor, 0);
});

test('shadow store failure cannot suppress or replace the authoritative call', async () => {
  const store = {
    async tryClaim() { throw new Error('store unavailable'); },
    async fail() { throw new Error('not reached'); }
  };
  const meter = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  const result = await meter.measure({
    coordinate,
    policy: shareablePolicy,
    execute: async () => ({ authoritative: true }),
    cost: { marginalCostUsd: 1, provenance: 'caller_measured' }
  });

  assert.deepEqual(result, { authoritative: true });
  const report = meter.getReport();
  assert.equal(report.authoritativeExecutions, 1);
  assert.equal(report.successfulExecutions, 1);
  assert.equal(report.storeFailures, 1);
  assert.equal(report.unclassifiedEligibleCalls, 1);
  assert.equal(report.callsWithIdenticalInflightPredecessor, 0);
  assert.equal(report.observedCostUsd, 1);
});

test('shadow cost resolver failure remains measurement-only', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const meter = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  const result = await meter.measure({
    coordinate,
    policy: shareablePolicy,
    execute: async () => ({ answer: 42 }),
    cost: {
      provenance: 'provider_reported',
      resolveMarginalCostUsd() { throw new Error('usage unavailable'); }
    }
  });

  assert.deepEqual(result, { answer: 42 });
  const report = meter.getReport();
  assert.equal(report.costResolutionFailures, 1);
  assert.equal(report.uncostedExecutions, 1);
  assert.equal(report.observedCostUsd, 0);
});


test('shadow meter coordinate canonicalization failure never suppresses the authoritative call', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const meter = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  let executions = 0;
  const cyclic = {};
  cyclic.self = cyclic;

  const value = await meter.measure({
    coordinate: cyclic,
    policy: shareablePolicy,
    execute: async () => {
      executions += 1;
      return { authoritative: true };
    }
  });

  assert.deepEqual(value, { authoritative: true });
  assert.equal(executions, 1);
  const report = meter.getReport();
  assert.equal(report.coordinateFailures, 1);
  assert.equal(report.unclassifiedEligibleCalls, 1);
  assert.equal(report.authoritativeExecutions, 1);
  assert.equal(report.callsWithIdenticalInflightPredecessor, 0);
});

test('active coordinator coordinate canonicalization failure fails open to the original call', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const coordinator = new SeenRelayFleetCoordinator({
    store,
    codec: codec(),
    scopeKey: 'tenant-fleet-a'
  });
  const cyclic = {};
  cyclic.self = cyclic;
  const receipts = [];
  let executions = 0;

  const value = await coordinator.run({
    coordinate: cyclic,
    policy: shareablePolicy,
    execute: async () => {
      executions += 1;
      return { authoritative: true };
    },
    onReceipt: (receipt) => receipts.push(receipt)
  });

  assert.deepEqual(value, { authoritative: true });
  assert.equal(executions, 1);
  assert.equal(coordinator.getTelemetry().coordinateFailures, 1);
  assert.equal(coordinator.getTelemetry().failOpenExecutions, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].path, 'fail_open_coordinate');
  assert.equal(receipts[0].avoidedExecutions, 0);
});

test('generic shadow wrapper measures identical concurrent arguments while preserving both executions', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const a = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  const b = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  let executions = 0;

  const original = async (id, payload) => {
    executions += 1;
    const own = executions;
    await sleep(30);
    return { own, id, payload };
  };

  const wrappedA = wrapFleetShadowCall(a, original, {
    policy: shareablePolicy,
    cost: { marginalCostUsd: 0.25, provenance: 'caller_measured' }
  });
  const wrappedB = wrapFleetShadowCall(b, original, {
    policy: shareablePolicy,
    cost: { marginalCostUsd: 0.25, provenance: 'caller_measured' }
  });

  const [ra, rb] = await Promise.all([
    wrappedA('same-id', { x: 1 }),
    wrappedB('same-id', { x: 1 })
  ]);

  assert.equal(executions, 2);
  assert.notEqual(ra.own, rb.own);
  const reports = [a.getReport(), b.getReport()];
  assert.equal(reports.reduce((n, r) => n + r.callsWithIdenticalInflightPredecessor, 0), 1);
  assert.ok(Math.abs(reports.reduce((n, r) => n + r.overlappedFollowerObservedCostUsd, 0) - 0.25) < 1e-12);
});

test('generic shadow wrapper does not classify different arguments as exact overlap', async () => {
  const store = new InMemoryFleetCoordinationStore();
  const a = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  const b = new SeenRelayFleetShadowMeter({ store, scopeKey: 'tenant-shadow-a' });
  let executions = 0;

  const original = async (value) => {
    executions += 1;
    await sleep(20);
    return value;
  };
  const wrappedA = wrapFleetShadowCall(a, original, { policy: shareablePolicy });
  const wrappedB = wrapFleetShadowCall(b, original, { policy: shareablePolicy });

  const values = await Promise.all([wrappedA('a'), wrappedB('b')]);
  assert.deepEqual(values.sort(), ['a', 'b']);
  assert.equal(executions, 2);
  assert.equal(a.getReport().callsWithIdenticalInflightPredecessor + b.getReport().callsWithIdenticalInflightPredecessor, 0);
});

test('generic shadow wrapper preserves receiver context', async () => {
  const meter = new SeenRelayFleetShadowMeter({
    store: new InMemoryFleetCoordinationStore(),
    scopeKey: 'tenant-shadow-a'
  });
  const wrapped = wrapFleetShadowCall(
    meter,
    function add(value) { return this.base + value; },
    { policy: shareablePolicy }
  );

  const result = await wrapped.call({ base: 7 }, 5);
  assert.equal(result, 12);
  assert.equal(meter.getReport().authoritativeExecutions, 1);
});

test('generic shadow wrapper leaves non-JSON arguments unclassified but still executes', async () => {
  const meter = new SeenRelayFleetShadowMeter({
    store: new InMemoryFleetCoordinationStore(),
    scopeKey: 'tenant-shadow-a'
  });
  let executions = 0;
  const wrapped = wrapFleetShadowCall(
    meter,
    async (fn) => {
      executions += 1;
      return fn();
    },
    { policy: shareablePolicy }
  );

  const result = await wrapped(() => 42);
  assert.equal(result, 42);
  assert.equal(executions, 1);
  const report = meter.getReport();
  assert.equal(report.coordinateFailures, 1);
  assert.equal(report.unclassifiedEligibleCalls, 1);
  assert.equal(report.authoritativeExecutions, 1);
});

test('coordinate builder failure in generic shadow wrapper is fail-open and unclassified', async () => {
  const meter = new SeenRelayFleetShadowMeter({
    store: new InMemoryFleetCoordinationStore(),
    scopeKey: 'tenant-shadow-a'
  });
  let executions = 0;
  const wrapped = wrapFleetShadowCall(
    meter,
    async (value) => {
      executions += 1;
      return value;
    },
    {
      policy: shareablePolicy,
      coordinateFromArgs() { throw new Error('cannot normalize'); }
    }
  );

  assert.equal(await wrapped('ok'), 'ok');
  assert.equal(executions, 1);
  const report = meter.getReport();
  assert.equal(report.coordinateFailures, 1);
  assert.equal(report.unclassifiedEligibleCalls, 1);
});
