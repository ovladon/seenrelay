import test from 'node:test';
import assert from 'node:assert/strict';
import { SeenRelayClient, reuseKnownOnSameObserved } from '../clients/typescript/dist/seenrelay.js';

const fact = { subject: 'Example status', predicate: 'status.current', source: 'https://example.com/status' };
const reply = (body, status = 200, lease = 'lease-1') => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'x-seenrelay-lease': lease }
});

test('default shadow mode validates then observes and preserves lease', async () => {
  const calls = [];
  const client = new SeenRelayClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return String(url).endsWith('/v1/check') ? reply({ status: 'UNKNOWN' }) : reply({ accepted: true });
    }
  });
  const result = await client.guardDetailed({ fact, knownValue: 'old', validate: async () => 'fresh' });
  assert.equal(result.value, 'fresh');
  assert.equal(result.path, 'validated');
  assert.equal(result.relay.checkOk, true);
  assert.equal(result.relay.observeOk, true);
  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[1].init.headers).get('x-seenrelay-lease'), 'lease-1');
});

test('explicit SAME_OBSERVED policy can reuse', async () => {
  let validations = 0;
  const client = new SeenRelayClient({ fetchImpl: async () => reply({ status: 'SAME_OBSERVED' }) });
  const result = await client.guardDetailed({
    fact,
    knownValue: 17,
    reuse: reuseKnownOnSameObserved,
    validate: async () => { validations += 1; return 18; }
  });
  assert.equal(result.value, 17);
  assert.equal(result.path, 'reused');
  assert.equal(validations, 0);
});

test('relay failure fails open while validation errors still propagate', async () => {
  const client = new SeenRelayClient({ fetchImpl: async () => { throw new Error('relay unavailable'); } });
  const result = await client.guardDetailed({ fact, knownValue: 1, validate: async () => 2 });
  assert.equal(result.value, 2);
  assert.equal(result.relay.checkOk, false);
  assert.equal(result.relay.observeOk, false);
  await assert.rejects(client.guard({ fact, knownValue: 1, validate: async () => { throw new Error('validation failed'); } }), /validation failed/);
});

test('conditional ETag hint is passed to validation but arbitrary header is ignored', async () => {
  let headers;
  const client = new SeenRelayClient({
    fetchImpl: async (url) => String(url).endsWith('/v1/check')
      ? reply({ status: 'SAME_OBSERVED', conditional_request_hint: { request_header: 'If-None-Match', header_value: 'etag-abc' } })
      : reply({ accepted: true })
  });
  await client.guard({ fact, knownValue: 1, validate: async (ctx) => { headers = ctx.conditionalHeaders; return 1; } });
  assert.deepEqual(headers, { 'If-None-Match': 'etag-abc' });

  let ignored;
  const other = new SeenRelayClient({
    fetchImpl: async (url) => String(url).endsWith('/v1/check')
      ? reply({ status: 'SAME_OBSERVED', conditional_request_hint: { request_header: 'X-Other', header_value: 'value' } })
      : reply({ accepted: true })
  });
  await other.guard({ fact, knownValue: 1, validate: async (ctx) => { ignored = ctx.conditionalHeaders; return 1; } });
  assert.deepEqual(ignored, {});
});

test('simultaneous equivalent checks coalesce but later checks are not cached', async () => {
  let checks = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const client = new SeenRelayClient({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/v1/check')) {
        checks += 1;
        if (checks === 1) await gate;
        return reply({ status: 'SAME_OBSERVED' });
      }
      return reply({ accepted: true });
    }
  });
  const a = client.guard({ fact, knownValue: 17, reuse: reuseKnownOnSameObserved, validate: async () => 999 });
  const b = client.guard({ fact, knownValue: 17, reuse: reuseKnownOnSameObserved, validate: async () => 999 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(checks, 1);
  release();
  assert.deepEqual(await Promise.all([a, b]), [17, 17]);
  assert.equal(await client.guard({ fact, knownValue: 17, reuse: reuseKnownOnSameObserved, validate: async () => 999 }), 17);
  assert.equal(checks, 2);
  assert.equal(client.getTelemetry().checkCoalesced, 1);
});

test('economics uses only caller-supplied costs', async () => {
  const client = new SeenRelayClient({ fetchImpl: async () => reply({ status: 'SAME_OBSERVED' }) });
  await client.guard({ fact, knownValue: 5, reuse: reuseKnownOnSameObserved, validate: async () => 6 });
  assert.deepEqual(client.estimateReuseEconomics({ avoidedValidationCost: 10, checkRequestCost: 1 }), {
    grossAvoidedValidationCost: 10,
    relayRequestCost: 1,
    netEstimatedSavings: 9,
    excludesConditionalRequestSavings: true
  });
});
