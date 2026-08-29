import test from 'node:test';
import assert from 'node:assert/strict';
import { SeenRelayClient, reuseKnownOnSameObserved } from '../clients/typescript/dist/seenrelay.js';

const fact = {
  subject: 'Paid fact',
  predicate: 'value.current',
  source: 'https://paid.example/fact',
  locator: { scheme: 'source_key', value: 'value' },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('accepted reuse prevents the paid validation from being invoked', async () => {
  let paymentAttempts = 0;
  let observes = 0;
  const client = new SeenRelayClient({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/v1/check')) {
        return jsonResponse({ status: 'SAME_OBSERVED' });
      }
      if (String(url).endsWith('/v1/observe')) {
        observes += 1;
        return jsonResponse({ accepted: true });
      }
      throw new Error('unexpected endpoint');
    },
  });

  const result = await client.guardDetailed({
    fact,
    knownValue: 17,
    maxAgeSeconds: 300,
    reuse: reuseKnownOnSameObserved,
    validate: async () => {
      paymentAttempts += 1;
      return 17;
    },
  });

  assert.equal(result.path, 'reused');
  assert.equal(result.value, 17);
  assert.equal(paymentAttempts, 0);
  assert.equal(observes, 0, 'reuse must not be laundered into a new independent OBSERVE');
});

test('UNKNOWN keeps the original paid validation path and observes only after success', async () => {
  let paymentAttempts = 0;
  let observes = 0;
  const client = new SeenRelayClient({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/v1/check')) {
        return jsonResponse({ status: 'UNKNOWN', next_step: 'VALIDATE_THEN_OBSERVE' });
      }
      if (String(url).endsWith('/v1/observe')) {
        observes += 1;
        return jsonResponse({ accepted: true });
      }
      throw new Error('unexpected endpoint');
    },
  });

  const result = await client.guardDetailed({
    fact,
    knownValue: 17,
    maxAgeSeconds: 300,
    reuse: reuseKnownOnSameObserved,
    validate: async () => {
      paymentAttempts += 1;
      return 18;
    },
  });

  assert.equal(result.path, 'validated');
  assert.equal(result.value, 18);
  assert.equal(paymentAttempts, 1);
  assert.equal(observes, 1);
});

test('relay failure fails open to paid validation', async () => {
  let paymentAttempts = 0;
  const client = new SeenRelayClient({
    checkTimeoutMs: 20,
    fetchImpl: async (url) => {
      if (String(url).endsWith('/v1/check')) throw new Error('relay unavailable');
      if (String(url).endsWith('/v1/observe')) return jsonResponse({ accepted: true });
      throw new Error('unexpected endpoint');
    },
  });

  const result = await client.guardDetailed({
    fact,
    knownValue: 17,
    reuse: reuseKnownOnSameObserved,
    validate: async () => {
      paymentAttempts += 1;
      return 18;
    },
  });

  assert.equal(result.path, 'validated');
  assert.equal(result.value, 18);
  assert.equal(paymentAttempts, 1);
  assert.equal(result.relay.checkOk, false);
});

test('paid validation errors propagate and do not produce OBSERVE', async () => {
  let observes = 0;
  const client = new SeenRelayClient({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/v1/check')) return jsonResponse({ status: 'UNKNOWN' });
      if (String(url).endsWith('/v1/observe')) {
        observes += 1;
        return jsonResponse({ accepted: true });
      }
      throw new Error('unexpected endpoint');
    },
  });

  await assert.rejects(
    client.guardDetailed({
      fact,
      knownValue: 17,
      reuse: reuseKnownOnSameObserved,
      validate: async () => {
        throw new Error('payment or provider refused');
      },
    }),
    /payment or provider refused/,
  );

  assert.equal(observes, 0);
});