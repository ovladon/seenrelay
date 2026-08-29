import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirecrawlShadowPilot } from '../scripts/firecrawl-shadow-pilot.mjs';

function resultWithoutCredits(markdown) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        data: {
          markdown,
          metadata: { cacheState: 'miss', statusCode: 200 }
        }
      })
    }]
  };
}

const params = {
  name: 'firecrawl_scrape',
  arguments: {
    url: 'https://example.com/public-page',
    maxAge: 60_000,
    formats: ['markdown']
  }
};

const controls = {
  workload_id: 'unknown-credit-fixture',
  local_cache: { available: false, measured: false },
  source_native_conditional: { available: false, measured: false }
};

test('missing Firecrawl credit metadata is incomplete until caller supplies a justified fallback', async () => {
  const provider = { callTool: async () => resultWithoutCredits('# stable') };
  const relay = {
    check: async () => ({ status: 'UNKNOWN' }),
    observe: async () => ({ accepted: true })
  };
  const client = createFirecrawlShadowPilot(provider, { relayClient: relay });

  await client.callTool(params);
  await client.seenRelayFirecrawlShadowPilot.flush();

  const report = client.seenRelayFirecrawlShadowPilot.report();
  assert.equal(report.provider_credit_evidence_complete, false);
  assert.equal(report.provider_credit_unknown_records, 1);

  assert.throws(
    () => client.seenRelayFirecrawlShadowPilot.evaluate(controls),
    /provider credits missing/
  );

  const evaluation = client.seenRelayFirecrawlShadowPilot.evaluate({
    ...controls,
    provider_credit_fallback_units: 1
  });
  assert.equal(evaluation.cost.baseline_total_units, 1);
});
