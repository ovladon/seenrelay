import test from 'node:test';
import assert from 'node:assert/strict';
import { runStarterCheck, renderStarterCheck, renderStarterCatalog } from '../clients/typescript/scripts/starter-check-lib.mjs';

const catalog = {
  schema: 'seenrelay-starter-facts-v1',
  facts: [{
    id: 'node-latest-version',
    category: 'runtime_version',
    fact: {
      subject: 'Latest Node.js release version',
      predicate: 'version.latest',
      source: 'https://nodejs.org/dist/index.json',
      locator: { scheme: 'json_pointer', value: '/0/version' }
    }
  }]
};

test('starter CHECK uses canonical identity and caller freshness without echoing the known value', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/starter-facts.json')) {
      return new Response(JSON.stringify(catalog), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).endsWith('/v1/check')) {
      return new Response(JSON.stringify({ status: 'SAME_OBSERVED', age_seconds: 12, max_age_seconds: 60 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error('unexpected URL');
  };

  const result = await runStarterCheck({
    factId: 'node-latest-version',
    knownValue: 'v24.0.0',
    maxAgeSeconds: 60,
    fetchImpl
  });

  assert.equal(result.check.status, 'SAME_OBSERVED');
  assert.equal(result.known_value_echoed, false);
  assert.equal(result.boundary.automatic_reuse_authorized, false);
  assert.equal(calls.length, 2);

  const payload = JSON.parse(calls[1].init.body);
  assert.deepEqual(payload.fact, catalog.facts[0].fact);
  assert.equal(payload.known_value, 'v24.0.0');
  assert.equal(payload.max_age_seconds, 60);

  const human = renderStarterCheck(result);
  assert.match(human, /evidence, not truth/i);
  assert.match(human, /Active suppression requires separate workload proof/i);
});

test('starter CHECK refuses an implicit freshness window', async () => {
  await assert.rejects(
    () => runStarterCheck({
      factId: 'node-latest-version',
      knownValue: 'v24.0.0',
      maxAgeSeconds: undefined,
      fetchImpl: async () => new Response(JSON.stringify(catalog), { status: 200 })
    }),
    /--max-age must be an integer/
  );
});

test('starter CHECK rejects unknown canonical ids before calling CHECK', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify(catalog), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(
    () => runStarterCheck({
      factId: 'not-a-fact',
      knownValue: 'x',
      maxAgeSeconds: 60,
      fetchImpl
    }),
    /Unknown starter fact/
  );
  assert.equal(calls, 1);
});


test('starter catalog rendering exposes ids but no values or TTL policy', () => {
  const human = renderStarterCatalog(catalog);
  assert.match(human, /node-latest-version/);
  assert.match(human, /identity only/i);
  assert.match(human, /no current values/i);
  assert.match(human, /recommended TTL/i);
});
