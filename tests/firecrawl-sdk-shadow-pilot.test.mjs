import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirecrawlSdkShadowPilot } from '../scripts/firecrawl-shadow-pilot.mjs';

class StatefulRelay {
  constructor() {
    this.values = new Set();
    this.checks = 0;
    this.observes = 0;
  }
  async check(_fact, knownValue) {
    this.checks += 1;
    return { status: this.values.has(knownValue) ? 'SAME_OBSERVED' : 'UNKNOWN' };
  }
  async observe(_fact, value) {
    this.observes += 1;
    this.values.add(value);
    return { accepted: true };
  }
}

function document(markdown, { cacheState = 'miss', creditsUsed = 1 } = {}) {
  return { markdown, metadata: { cacheState, creditsUsed, statusCode: 200 } };
}

test('direct SDK scrape returns the exact raw provider object and measures in shadow mode', async () => {
  const results = [document('# stable'), document('# stable', { cacheState: 'hit' })];
  const provider = {
    calls: 0,
    async scrape() { this.calls += 1; return results.shift(); }
  };
  const relay = new StatefulRelay();
  const measured = createFirecrawlSdkShadowPilot(provider, { maxAgeMs: 60_000, relayClient: relay });

  const firstExpected = results[0];
  const first = await measured.scrape('https://example.com/public-page', { formats: ['markdown'] });
  assert.equal(first, firstExpected);
  await measured.seenRelayFirecrawlSdkShadowPilot.flush();

  const secondExpected = results[0];
  const second = await measured.scrape('https://example.com/public-page', { formats: ['markdown'] });
  assert.equal(second, secondExpected);
  assert.equal(provider.calls, 2);
  await measured.seenRelayFirecrawlSdkShadowPilot.flush();

  const report = measured.seenRelayFirecrawlSdkShadowPilot.report();
  assert.equal(report.records, 2);
  assert.equal(report.metrics.check_calls, 1);
  assert.equal(report.metrics.same_observed, 1);
  assert.equal(relay.observes, 1, 'provider cache hit must not become an independent OBSERVE');
});

test('direct SDK wrapper preserves the original scrape argument list and never injects maxAgeMs', async () => {
  const calls = [];
  const provider = {
    async scrape(...args) { calls.push(args); return document('# one'); }
  };
  const relay = new StatefulRelay();
  const measured = createFirecrawlSdkShadowPilot(provider, { maxAgeMs: 45_000, relayClient: relay });
  const options = { formats: ['markdown'], onlyMainContent: true };

  await measured.scrape('https://example.com/page', options);
  await measured.seenRelayFirecrawlSdkShadowPilot.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.equal(calls[0][0], 'https://example.com/page');
  assert.equal(calls[0][1], options);
  assert.equal(Object.prototype.hasOwnProperty.call(options, 'maxAgeMs'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(options, 'maxAge'), false);
});

test('legacy scrapeUrl SDK method is supported without changing its result', async () => {
  const raw = { success: true, data: document('# legacy') };
  const provider = {
    async scrapeUrl(url, options) {
      assert.equal(url, 'https://example.com/legacy');
      assert.deepEqual(options, { formats: ['markdown'] });
      return raw;
    }
  };
  const measured = createFirecrawlSdkShadowPilot(provider, {
    maxAgeMs: 30_000,
    relayClient: new StatefulRelay()
  });

  const result = await measured.scrapeUrl('https://example.com/legacy', { formats: ['markdown'] });
  assert.equal(result, raw);
  await measured.seenRelayFirecrawlSdkShadowPilot.flush();
  assert.equal(measured.seenRelayFirecrawlSdkShadowPilot.report().records, 1);
});

test('measurement serialization failure after provider success fails open to the provider result', async () => {
  const circular = document('# circular');
  circular.circular = circular;
  const provider = { async scrape() { return circular; } };
  const measured = createFirecrawlSdkShadowPilot(provider, {
    maxAgeMs: 30_000,
    relayClient: new StatefulRelay()
  });

  const result = await measured.scrape('https://example.com/circular', { formats: ['markdown'] });
  assert.equal(result, circular);
  assert.equal(measured.seenRelayFirecrawlSdkShadowPilot.report().records, 0);
});

test('provider failures remain authoritative application failures', async () => {
  const failure = new Error('provider failed');
  const provider = { async scrape() { throw failure; } };
  const measured = createFirecrawlSdkShadowPilot(provider, {
    maxAgeMs: 30_000,
    relayClient: new StatefulRelay()
  });

  await assert.rejects(
    measured.scrape('https://example.com/failure', { formats: ['markdown'] }),
    (error) => error === failure
  );
});
