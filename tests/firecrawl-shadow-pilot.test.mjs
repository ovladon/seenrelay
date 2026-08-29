import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirecrawlShadowPilot } from '../scripts/firecrawl-shadow-pilot.mjs';

function firecrawlResult(markdown, { cacheState = 'miss', creditsUsed = 1, cachedAt = '2026-08-30T00:00:00.000Z' } = {}) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        data: {
          markdown,
          metadata: { cacheState, creditsUsed, cachedAt, statusCode: 200 }
        }
      })
    }]
  };
}

function scrapeParams(overrides = {}) {
  return {
    name: 'firecrawl_scrape',
    arguments: {
      url: 'https://example.com/public-page',
      maxAge: 60_000,
      formats: ['markdown'],
      ...overrides
    }
  };
}

class FakeFirecrawlClient {
  constructor(results) {
    this.results = [...results];
    this.calls = 0;
  }

  async callTool() {
    this.calls += 1;
    if (!this.results.length) throw new Error('no provider result');
    return this.results.shift();
  }
}

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

const completeControls = {
  workload_id: 'firecrawl-natural-fixture',
  local_cache: { available: false, measured: false },
  source_native_conditional: { available: false, measured: false }
};

test('shadow pilot never suppresses Firecrawl and measures reusable provider-cache calls', async () => {
  const provider = new FakeFirecrawlClient([
    firecrawlResult('# stable', { cacheState: 'miss', creditsUsed: 1 }),
    firecrawlResult('# stable', { cacheState: 'hit', creditsUsed: 1 })
  ]);
  const relay = new StatefulRelay();
  const client = createFirecrawlShadowPilot(provider, { relayClient: relay });

  const first = await client.callTool(scrapeParams());
  assert.equal(first.content.length, 1);
  await client.seenRelayFirecrawlShadowPilot.flush();
  assert.equal(provider.calls, 1);
  assert.equal(relay.checks, 0);
  assert.equal(relay.observes, 1);

  const second = await client.callTool(scrapeParams());
  assert.equal(second.content.length, 1);
  // Provider result is returned before the background counterfactual measurement is required to finish.
  assert.equal(provider.calls, 2);
  await client.seenRelayFirecrawlShadowPilot.flush();

  const report = client.seenRelayFirecrawlShadowPilot.report();
  assert.equal(report.records, 2);
  assert.equal(report.metrics.provider_cache_misses, 1);
  assert.equal(report.metrics.provider_cache_hits, 1);
  assert.equal(report.metrics.check_calls, 1);
  assert.equal(report.metrics.same_observed, 1);
  assert.equal(report.metrics.hypothetical_matches, 1);
  assert.equal(report.metrics.hypothetical_mismatches, 0);
  assert.equal(relay.observes, 1, 'provider cache hit must not be relabeled as an independent OBSERVE');

  const evaluation = client.seenRelayFirecrawlShadowPilot.evaluate(completeControls);
  assert.equal(evaluation.calls, 2);
  assert.equal(evaluation.policy_accepted_reuses, 1);
  assert.equal(evaluation.safety.state, 'pass');
  assert.equal(evaluation.cost.baseline_total_units, 2);
  assert.equal(evaluation.cost.prospective_total_units, 1);
  assert.equal(evaluation.cost.outcome, 'better');
});

test('SAME_OBSERVED that disagrees with authoritative Firecrawl validation fails safety', async () => {
  const provider = new FakeFirecrawlClient([
    firecrawlResult('# revision 1', { cacheState: 'miss' }),
    firecrawlResult('# revision 2', { cacheState: 'miss' })
  ]);
  const relay = new StatefulRelay();
  const client = createFirecrawlShadowPilot(provider, { relayClient: relay });

  await client.callTool(scrapeParams());
  await client.seenRelayFirecrawlShadowPilot.flush();
  await client.callTool(scrapeParams());
  await client.seenRelayFirecrawlShadowPilot.flush();

  const report = client.seenRelayFirecrawlShadowPilot.report();
  assert.equal(report.metrics.same_observed, 1);
  assert.equal(report.metrics.hypothetical_mismatches, 1);

  const evaluation = client.seenRelayFirecrawlShadowPilot.evaluate(completeControls);
  assert.equal(evaluation.safety.state, 'fail');
  assert.equal(evaluation.decision.safety_pass, false);
  assert.equal(evaluation.decision.beats_baseline_on_both, false);
});

test('provider cache hits never create independent public observations', async () => {
  const provider = new FakeFirecrawlClient([
    firecrawlResult('# cached only', { cacheState: 'hit' })
  ]);
  const relay = new StatefulRelay();
  const client = createFirecrawlShadowPilot(provider, { relayClient: relay });

  await client.callTool(scrapeParams());
  await client.seenRelayFirecrawlShadowPilot.flush();

  assert.equal(relay.observes, 0);
  assert.equal(client.seenRelayFirecrawlShadowPilot.report().metrics.independent_observations, 0);
});

test('benchmark controls must be declared rather than assumed favorable', async () => {
  const provider = new FakeFirecrawlClient([firecrawlResult('# one', { cacheState: 'miss' })]);
  const relay = new StatefulRelay();
  const client = createFirecrawlShadowPilot(provider, { relayClient: relay });
  await client.callTool(scrapeParams());
  await client.seenRelayFirecrawlShadowPilot.flush();

  assert.throws(
    () => client.seenRelayFirecrawlShadowPilot.hostileBenchmarkInput({}),
    /local_cache must declare available and measured booleans/
  );
});

test('counterfactual CHECK is off the provider response path', async () => {
  let releaseCheck;
  const checkGate = new Promise((resolve) => { releaseCheck = resolve; });
  const relay = new StatefulRelay();
  const originalCheck = relay.check.bind(relay);
  relay.check = async (...args) => {
    await checkGate;
    return originalCheck(...args);
  };

  const provider = new FakeFirecrawlClient([
    firecrawlResult('# stable', { cacheState: 'miss' }),
    firecrawlResult('# stable', { cacheState: 'hit' })
  ]);
  const client = createFirecrawlShadowPilot(provider, { relayClient: relay });

  await client.callTool(scrapeParams());
  // First call has no prior value and therefore no CHECK; let its OBSERVE finish.
  releaseCheck();
  await client.seenRelayFirecrawlShadowPilot.flush();

  let releaseSecondCheck;
  const secondGate = new Promise((resolve) => { releaseSecondCheck = resolve; });
  relay.check = async (...args) => {
    await secondGate;
    return originalCheck(...args);
  };

  const returned = await client.callTool(scrapeParams());
  assert.equal(returned.content.length, 1);
  assert.equal(provider.calls, 2);
  assert.equal(client.seenRelayFirecrawlShadowPilot.report().records, 1, 'background CHECK should still be pending');

  releaseSecondCheck();
  await client.seenRelayFirecrawlShadowPilot.flush();
  assert.equal(client.seenRelayFirecrawlShadowPilot.report().records, 2);
});
