import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('public and machine-facing guidance targets repeated expensive validation without universal savings claims', () => {
  const economics = read('src', 'economics.ts');
  const publicSource = read('src', 'public.ts');
  const publicView = read('src', 'public-facts-view.ts');
  const landing = read('src', 'landing.ts');
  const indexSource = read('src', 'index.ts');
  const quickstart = read('src', 'quickstart.ts');
  const adoption = read('src', 'adoption.ts');
  const integrations = read('src', 'integrations.ts');
  const mcp = read('src', 'mcp.ts');
  const facts = JSON.parse(read('public', 'product-facts.json'));

  assert.match(publicSource, /Avoid redundant expensive validation/);
  assert.match(publicSource, /javascript_typescript_zero_state/);
  assert.match(publicSource, /shared_check_default:\s*'off'/);
  assert.match(publicSource, /poor_fit/);
  assert.match(publicSource, /cheap_one_off_fetch/);
  assert.match(publicSource, /pricing_snapshots: publicProductFacts\.pricing_snapshots/);
  assert.match(indexSource, /app\.get\('\/economics'/);

  assert.equal(facts.pricing_snapshots.checked_at, '2026-08-26');
  assert.equal(facts.pricing_snapshots.firecrawl.basic_scrape_credits_per_page, 1);
  assert.equal(facts.pricing_snapshots.firecrawl.json_extraction_total_credits_per_page, 5);
  const jsonBenchmark = facts.verified_benchmarks.find((b) => b.id === 'firecrawl-json-extraction-2026-08-26');
  assert.ok(jsonBenchmark);
  assert.equal(jsonBenchmark.provider_credits_avoided, 15);
  assert.equal(jsonBenchmark.reuse_provider_calls, 0);
  assert.equal(jsonBenchmark.samples, 3);
  const browserBenchmark = facts.verified_benchmarks.find((b) => b.id === 'firecrawl-browser-interaction-2026-08-26');
  assert.ok(browserBenchmark);
  assert.equal(browserBenchmark.provider_calls_avoided, 3);
  assert.equal(browserBenchmark.provider_credits_avoided, 9);
  assert.equal(browserBenchmark.reuse_provider_calls, 0);
  assert.equal(browserBenchmark.samples, 3);
  assert.equal(browserBenchmark.matrix.series_key, 'firecrawl-browser-interaction-code-v1');
  assert.equal(jsonBenchmark.matrix.fit, 'poor');
  assert.equal(browserBenchmark.matrix.fit, 'poor');
  assert.equal(browserBenchmark.matrix.cost_outcome, 'better');
  assert.equal(browserBenchmark.matrix.latency_outcome, 'better');

  assert.match(economics, /publicProductFacts\.pricing_snapshots/);
  assert.match(economics, /verifiedBenchmarkHtml\(\)/);
  assert.match(publicView, /Provider-path smoke: SeenRelay skipped Firecrawl work/);
  assert.match(publicView, /Path ordering matters/);
  assert.match(publicView, /VERIFIED WORKLOAD MATRIX/);
  assert.match(publicView, /benchmark-table/);
  assert.match(publicView, /Shipped or independently release-gated facts\./);
  assert.match(publicView, /docs\/VERIFIED_RESULTS\.md#interpretation/);
  assert.match(publicView, /docs\/ECONOMICS_LAB\.md/);
  assert.doesNotMatch(publicView, /Only shipped or independently release-gated facts belong here; planned work is excluded\./);
  assert.doesNotMatch(publicView, /so new verified configurations can appear without hand-editing this page/);
  assert.doesNotMatch(publicView, /firecrawl-browser-interaction-2026-08-26/);
  assert.doesNotMatch(economics + publicSource + adoption + integrations, /Firecrawl Pay As You Go/);
  assert.match(economics, /Fixed-tier counterexample/);
  assert.match(economics, /Outside the target:/);
  assert.doesNotMatch(landing, /fit:\s*\$\{esc\(fit\)\}/);
  assert.doesNotMatch(publicView, /fit-badge|<th>Fit<\/th>|poor workload fit/);

  assert.match(quickstart, /seenrelay\/mcp-auto/);
  assert.match(quickstart, /local-first bind-once path/i);
  assert.match(quickstart, /original validation remains the fallback/i);
  assert.match(adoption, /## Preferred JavaScript \/ TypeScript order/);
  assert.match(adoption, /Shared CHECK is off by default/i);
  assert.match(integrations, /seenrelay\/mcp-auto/);
  assert.match(integrations, /Shared CHECK (?:is off|is not enabled) by default/i);
  assert.match(mcp, /paid web search, metered scraping, browser\/extraction/);

  for (const text of [economics, publicSource, publicView, quickstart, adoption, integrations, mcp]) {
    assert.doesNotMatch(text, /guaranteed savings|always cheaper/i);
  }
});
