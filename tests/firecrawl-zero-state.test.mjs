import test from 'node:test';
import assert from 'node:assert/strict';
import { SeenRelayZeroState } from '../clients/typescript/dist/zero-state.js';
import { protectMcpClient } from '../clients/typescript/dist/mcp-auto.js';
import {
  firecrawlResultFingerprint,
  firecrawlScrapePolicy,
  publicFirecrawlSource
} from '../clients/typescript/dist/firecrawl.js';

function relayStub() {
  return {
    checks: [],
    observes: [],
    async check(fact, knownValue, maxAgeSeconds) {
      this.checks.push({ fact, knownValue, maxAgeSeconds });
      return { status: 'SAME_OBSERVED' };
    },
    async observe(fact, value, metadata) {
      this.observes.push({ fact, value, metadata });
      return { accepted: true };
    }
  };
}

function scrapeResult(markdown = 'alpha', metadata = {}) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        markdown,
        metadata: { sourceURL: 'https://example.com/page', ...metadata }
      })
    }]
  };
}

test('live first scrape OBSERVEs only a stable fingerprint; local hit stays local; expired candidate CHECKs before upstream', async () => {
  let now = 1_000;
  let upstreamCalls = 0;
  const relay = relayStub();
  const tasks = [];
  const edge = new SeenRelayZeroState({
    relayClient: relay,
    relayMode: 'off',
    validatorRetentionMs: 60_000,
    now: () => now,
    scheduleObserve: (task) => tasks.push(task)
  });
  const firstResult = scrapeResult('alpha', { cacheState: 'miss', scrapeId: 'run-1', creditsUsed: 1 });
  const upstream = {
    async callTool() {
      upstreamCalls += 1;
      return firstResult;
    }
  };
  const client = protectMcpClient(upstream, {
    serverKey: 'firecrawl-test',
    edge,
    tools: { firecrawl_scrape: firecrawlScrapePolicy({ maxAgeMs: 1000, publicEvidence: true }) }
  });
  const call = { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/page', formats: ['markdown'] } };

  const first = await client.callTool(call);
  assert.deepEqual(first, firstResult);
  assert.equal(upstreamCalls, 1);
  assert.equal(relay.checks.length, 0, 'no retained candidate means no L2 CHECK on first use');
  assert.equal(tasks.length, 1);
  await tasks.shift()();
  assert.equal(relay.observes.length, 1);
  assert.equal(relay.observes[0].value, firecrawlResultFingerprint(firstResult));
  assert.match(relay.observes[0].value, /^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(relay.observes[0]).includes('alpha'), false, 'raw scrape content must not be shared');
  assert.equal(relay.observes[0].fact.source, 'https://example.com/page');
  assert.equal(relay.observes[0].fact.predicate, 'document.scrape.result.sha256');
  assert.equal(relay.observes[0].fact.qualifiers.representation_contract, 'firecrawl-scrape-v2');
  assert.match(relay.observes[0].fact.qualifiers.options_sha256, /^sha256:[0-9a-f]{64}$/);

  now += 500;
  const local = await client.callTool(call);
  assert.deepEqual(local, first);
  assert.equal(upstreamCalls, 1);
  assert.equal(relay.checks.length, 0);
  assert.equal(tasks.length, 0, 'local reuse must not be re-labeled as a new observation');

  now += 600;
  const shared = await client.callTool(call);
  assert.deepEqual(shared, first);
  assert.equal(upstreamCalls, 1, 'SAME_OBSERVED fingerprint should reuse the retained local result');
  assert.equal(relay.checks.length, 1);
  assert.equal(relay.checks[0].knownValue, firecrawlResultFingerprint(first));
  assert.equal(relay.checks[0].maxAgeSeconds, 1);
  assert.equal(tasks.length, 0, 'relay reuse is not a new independent observation');
  assert.equal(client.seenRelayZeroState.getTelemetry().edge.relayCheckReuseHits, 1);
});

test('sub-second caller freshness never widens into a one-second L2 window', () => {
  const policy = firecrawlScrapePolicy({ maxAgeMs: 999, publicEvidence: true });
  const relay = policy.relay({ name: 'firecrawl_scrape', arguments: { url: 'https://example.com/a' } }, []);
  assert.equal(relay.mode, 'off');
  assert.equal(relay.maxAgeSeconds, undefined);
});

test('Firecrawl maxAge declared in the call becomes the local window only for a defensibly timestamped result', async () => {
  let upstreamCalls = 0;
  const edge = new SeenRelayZeroState({ relayMode: 'off' });
  const client = protectMcpClient({
    async callTool() { upstreamCalls += 1; return scrapeResult('declared', { cacheState: 'miss' }); }
  }, {
    edge,
    tools: { firecrawl_scrape: firecrawlScrapePolicy() }
  });
  const call = {
    name: 'firecrawl_scrape',
    arguments: { url: 'https://example.com/a', maxAge: 60_000, formats: ['markdown'] }
  };
  await client.callTool(call);
  await client.callTool(call);
  assert.equal(upstreamCalls, 1);
  assert.equal(edge.getTelemetry().relayCheckCalls, 0);
});

test('provider cache hit is aged from cachedAt and never re-labeled as an independent OBSERVE', async () => {
  let now = 10_000;
  let upstreamCalls = 0;
  const relay = relayStub();
  relay.check = async function (fact, knownValue, maxAgeSeconds) {
    this.checks.push({ fact, knownValue, maxAgeSeconds });
    return { status: 'UNKNOWN' };
  };
  const tasks = [];
  const edge = new SeenRelayZeroState({
    relayClient: relay,
    now: () => now,
    scheduleObserve: (task) => tasks.push(task)
  });
  const cachedAt = new Date(9_300).toISOString();
  const client = protectMcpClient({
    async callTool() {
      upstreamCalls += 1;
      return scrapeResult('cached', { cacheState: 'hit', cachedAt, scrapeId: `run-${upstreamCalls}` });
    }
  }, {
    edge,
    tools: { firecrawl_scrape: firecrawlScrapePolicy({ publicEvidence: true }) }
  });
  const call = { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/a', maxAge: 1_000 } };

  await client.callTool(call);
  assert.equal(tasks.length, 0);
  assert.equal(relay.observes.length, 0);
  assert.equal(edge.getTelemetry().relayObserveSkippedNotIndependent, 1);

  now = 10_500;
  await client.callTool(call);
  assert.equal(upstreamCalls, 2, 'cachedAt left only 300ms of the caller window; receipt time must not restart it');
});

test('operational Firecrawl metadata cannot fragment the shared result fingerprint', () => {
  const a = scrapeResult('alpha', {
    title: 'Example',
    statusCode: 200,
    cacheState: 'miss',
    scrapeId: 'a',
    creditsUsed: 1,
    concurrencyLimited: false,
    concurrencyQueueDurationMs: 0,
    proxyUsed: 'basic'
  });
  const b = scrapeResult('alpha', {
    title: 'Example',
    statusCode: 200,
    cacheState: 'hit',
    cachedAt: '2026-08-28T12:00:00.000Z',
    scrapeId: 'b',
    creditsUsed: 9,
    concurrencyLimited: true,
    concurrencyQueueDurationMs: 987,
    proxyUsed: 'stealth'
  });
  const changed = scrapeResult('beta', { title: 'Example', statusCode: 200, cacheState: 'miss' });
  assert.equal(firecrawlResultFingerprint(a), firecrawlResultFingerprint(b));
  assert.notEqual(firecrawlResultFingerprint(a), firecrawlResultFingerprint(changed));
});

test('successful result without a defensible freshness anchor is returned but never cached or OBSERVEd', async () => {
  let upstreamCalls = 0;
  const relay = relayStub();
  const tasks = [];
  const edge = new SeenRelayZeroState({ relayClient: relay, scheduleObserve: (task) => tasks.push(task) });
  const client = protectMcpClient({
    async callTool() { upstreamCalls += 1; return scrapeResult('unknown-age'); }
  }, {
    edge,
    tools: { firecrawl_scrape: firecrawlScrapePolicy({ maxAgeMs: 60_000, publicEvidence: true }) }
  });
  const call = { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/a' } };
  await client.callTool(call);
  await client.callTool(call);
  assert.equal(upstreamCalls, 2);
  assert.equal(edge.getTelemetry().validatedUncacheable, 2);
  assert.equal(tasks.length, 0);
  assert.equal(relay.observes.length, 0);
});

test('explicit maxAge=0 establishes a live validation even when Firecrawl omits cacheState', async () => {
  let upstreamCalls = 0;
  const relay = relayStub();
  const tasks = [];
  const edge = new SeenRelayZeroState({ relayClient: relay, scheduleObserve: (task) => tasks.push(task) });
  const client = protectMcpClient({
    async callTool() { upstreamCalls += 1; return scrapeResult('live-no-cache-state'); }
  }, {
    edge,
    tools: { firecrawl_scrape: firecrawlScrapePolicy({ publicEvidence: true }) }
  });
  const call = { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/a', maxAge: 0 } };
  await client.callTool(call);
  assert.equal(upstreamCalls, 1);
  assert.equal(tasks.length, 1, 'a demonstrated live validation may contribute even though completed-result TTL is zero');
  await tasks[0]();
  assert.equal(relay.observes.length, 1);
  assert.equal(relay.checks.length, 0);
  assert.equal(edge.getTelemetry().cacheEntries, 0);
});

test('MCP in-band errors are never cached or OBSERVEd', async () => {
  let upstreamCalls = 0;
  const relay = relayStub();
  const tasks = [];
  const edge = new SeenRelayZeroState({ relayClient: relay, scheduleObserve: (task) => tasks.push(task) });
  const errorResult = { isError: true, content: [{ type: 'text', text: 'quota exceeded' }] };
  const client = protectMcpClient({
    async callTool() { upstreamCalls += 1; return errorResult; }
  }, {
    edge,
    tools: { firecrawl_scrape: firecrawlScrapePolicy({ maxAgeMs: 60_000, publicEvidence: true }) }
  });
  const call = { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/a' } };
  assert.deepEqual(await client.callTool(call), errorResult);
  assert.deepEqual(await client.callTool(call), errorResult);
  assert.equal(upstreamCalls, 2);
  assert.equal(tasks.length, 0);
  assert.equal(relay.observes.length, 0);
});

test('unsafe or credential-bearing source URLs never create public relay evidence', async () => {
  assert.equal(publicFirecrawlSource('http://127.0.0.1/a'), null);
  assert.equal(publicFirecrawlSource('http://localhost/a'), null);
  assert.equal(publicFirecrawlSource('https://user:pass@example.com/a'), null);
  assert.equal(publicFirecrawlSource('https://example.com/a?X-Amz-Signature=secret'), null);
  assert.equal(publicFirecrawlSource('https://example.com/a#fragment'), 'https://example.com/a');

  let upstreamCalls = 0;
  const relay = relayStub();
  const tasks = [];
  const edge = new SeenRelayZeroState({ relayClient: relay, scheduleObserve: (task) => tasks.push(task) });
  const client = protectMcpClient({
    async callTool() { upstreamCalls += 1; return scrapeResult('private', { cacheState: 'miss' }); }
  }, { edge, tools: { firecrawl_scrape: firecrawlScrapePolicy({ maxAgeMs: 1000, publicEvidence: true }) } });
  const call = { name: 'firecrawl_scrape', arguments: { url: 'http://127.0.0.1/a' } };
  await client.callTool(call);
  await client.callTool(call);
  assert.equal(upstreamCalls, 1, 'local optimization may still help private sources');
  assert.equal(relay.checks.length, 0);
  assert.equal(relay.observes.length, 0);
  assert.equal(tasks.length, 0);
});

test('side-effect or zero-retention scrape configurations bypass optimization completely', async () => {
  const cases = [
    { url: 'https://example.com', maxAge: 60_000, actions: [{ type: 'click', selector: '#x' }] },
    { url: 'https://example.com', maxAge: 60_000, storeInCache: true },
    { url: 'https://example.com', maxAge: 60_000, zeroDataRetention: true },
    { url: 'https://example.com', maxAge: 60_000, profile: { name: 'p' } }
  ];
  for (const args of cases) {
    let upstreamCalls = 0;
    const relay = relayStub();
    const edge = new SeenRelayZeroState({ relayClient: relay });
    const client = protectMcpClient({
      async callTool() { upstreamCalls += 1; return { n: upstreamCalls }; }
    }, { edge, tools: { firecrawl_scrape: firecrawlScrapePolicy({ publicEvidence: true }) } });
    await client.callTool({ name: 'firecrawl_scrape', arguments: args });
    await client.callTool({ name: 'firecrawl_scrape', arguments: args });
    assert.equal(upstreamCalls, 2);
    assert.equal(relay.checks.length, 0);
    assert.equal(relay.observes.length, 0);
    assert.equal(client.seenRelayZeroState.getTelemetry().ineligiblePassthroughCalls, 2);
  }
});

test('representation-affecting options change the public fact coordinate while maxAge does not', () => {
  const policy = firecrawlScrapePolicy({ maxAgeMs: 1000, publicEvidence: true });
  const a = policy.relay({ name: 'firecrawl_scrape', arguments: { url: 'https://example.com', maxAge: 1000, formats: ['markdown'] } }, []);
  const b = policy.relay({ name: 'firecrawl_scrape', arguments: { url: 'https://example.com', maxAge: 5000, formats: ['markdown'] } }, []);
  const c = policy.relay({ name: 'firecrawl_scrape', arguments: { url: 'https://example.com', maxAge: 1000, formats: ['html'] } }, []);
  assert.equal(a.fact.qualifiers.options_sha256, b.fact.qualifiers.options_sha256);
  assert.notEqual(a.fact.qualifiers.options_sha256, c.fact.qualifiers.options_sha256);
});

test('public relay evidence is opt-in at adapter configuration, not a hidden default', () => {
  const params = { name: 'firecrawl_scrape', arguments: { url: 'https://example.com', maxAge: 1000 } };
  assert.equal(firecrawlScrapePolicy().relay(params, []), undefined);
  assert.ok(firecrawlScrapePolicy({ publicEvidence: true }).relay(params, []));
});
