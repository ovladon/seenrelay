import test from 'node:test';
import assert from 'node:assert/strict';

import { SeenRelayClient } from '../clients/typescript/dist/seenrelay.js';
import { SeenRelayShadowProof } from '../clients/typescript/dist/shadow-proof.js';

const fact = { subject: 'Example status', predicate: 'status.current', source: 'https://example.com/status' };
const reply = (body, status = 200, lease = 'lease-1') => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'x-seenrelay-lease': lease }
});

test('caller-supplied scheduler defers OBSERVE without hidden execution', async () => {
  const scheduled = [];
  const calls = [];
  const client = new SeenRelayClient({
    scheduleObserve: (task) => scheduled.push(task),
    fetchImpl: async (url) => {
      calls.push(String(url));
      return String(url).endsWith('/v1/check') ? reply({ status: 'UNKNOWN' }) : reply({ accepted: true });
    }
  });

  const result = await client.guardDetailed({ fact, knownValue: 'old', validate: async () => 'fresh' });
  assert.equal(result.value, 'fresh');
  assert.equal(result.relay.observeDeferred, true);
  assert.equal(result.relay.observeOk, null);
  assert.equal(scheduled.length, 1);
  assert.equal(calls.filter((url) => url.endsWith('/v1/observe')).length, 0, 'wrapper must not create hidden background work');
  assert.equal(client.getTelemetry().observeScheduled, 1);

  await scheduled[0]();
  assert.equal(calls.filter((url) => url.endsWith('/v1/observe')).length, 1);
  assert.equal(client.getTelemetry().observeSuccesses, 1);
});

test('deferred OBSERVE failure is best-effort and caller-visible', async () => {
  let task;
  const deferredErrors = [];
  const client = new SeenRelayClient({
    scheduleObserve: (scheduled) => { task = scheduled; },
    onDeferredObserveError: (error) => deferredErrors.push(String(error?.message ?? error)),
    fetchImpl: async (url) => {
      if (String(url).endsWith('/v1/check')) return reply({ status: 'UNKNOWN' });
      throw new Error('observe unavailable');
    }
  });

  const result = await client.guardDetailed({ fact, knownValue: 1, validate: async () => 2 });
  assert.equal(result.value, 2);
  assert.equal(result.relay.observeDeferred, true);
  await task();
  assert.equal(client.getTelemetry().observeFailures, 1);
  assert.deepEqual(deferredErrors, ['observe unavailable']);
});

test('scheduler failure fails open without pretending OBSERVE ran', async () => {
  const client = new SeenRelayClient({
    scheduleObserve: () => { throw new Error('scheduler unavailable'); },
    fetchImpl: async (url) => String(url).endsWith('/v1/check') ? reply({ status: 'UNKNOWN' }) : reply({ accepted: true })
  });
  const result = await client.guardDetailed({ fact, knownValue: 1, validate: async () => 2 });
  assert.equal(result.value, 2);
  assert.equal(result.relay.observeDeferred, true);
  assert.equal(result.relay.observeOk, false);
  assert.match(result.relay.observeError, /scheduler unavailable/);
  const telemetry = client.getTelemetry();
  assert.equal(telemetry.observeScheduleFailures, 1);
  assert.equal(telemetry.observeNetworkRequests, 0);
});

class EconomicsFakeClient {
  constructor() {
    this.telemetry = {
      checkNetworkRequests: 0,
      checkNetworkLatencyMsTotal: 0,
      checkNetworkLatencyMsAverage: 0,
      observeNetworkRequests: 0,
      observeNetworkLatencyMsTotal: 0,
      observeNetworkLatencyMsAverage: 0
    };
  }
  async guardDetailed(options) {
    this.telemetry.checkNetworkRequests += 1;
    this.telemetry.checkNetworkLatencyMsTotal += 2;
    this.telemetry.checkNetworkLatencyMsAverage = 2;
    const check = { status: 'SAME_OBSERVED' };
    const value = await options.validate({ check, conditionalHeaders: {} });
    this.telemetry.observeNetworkRequests += 1;
    this.telemetry.observeNetworkLatencyMsTotal += 3;
    this.telemetry.observeNetworkLatencyMsAverage = 3;
    return { value, check, relay: { checkOk: true, observeOk: true } };
  }
  getTelemetry() { return { ...this.telemetry }; }
  resetTelemetry() {}
}

test('Shadow Proof models off-critical OBSERVE only when caller says it truly is off-path', async () => {
  const proof = new SeenRelayShadowProof(new EconomicsFakeClient());
  await proof.guard({
    fact: { source_url: 'https://example.invalid/status', predicate: 'status.value' },
    knownValue: 'ok',
    validate: async () => { await new Promise((resolve) => setTimeout(resolve, 4)); return 'ok'; }
  });
  const blocking = proof.report({ avoidedValidationCost: 1 });
  const deferred = proof.report({ avoidedValidationCost: 1, observeOffCriticalPath: true });
  assert.equal(deferred.assumptions.observeOffCriticalPath, true);
  assert.ok(deferred.prospectiveRelayLatencyMs <= blocking.prospectiveRelayLatencyMs);
  assert.ok(deferred.breakEvenReuseRateByTime <= blocking.breakEvenReuseRateByTime);
});
