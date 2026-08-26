import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('public and machine-facing guidance targets repeated expensive fleet validation without universal savings claims', () => {
  const economics = read('src', 'economics.ts');
  const publicSource = read('src', 'public.ts');
  const quickstart = read('src', 'quickstart.ts');
  const adoption = read('src', 'adoption.ts');
  const mcp = read('src', 'mcp.ts');

  assert.match(publicSource, /Stop paying to revalidate the same fact/);
  assert.match(publicSource, /paid search, scraping, browser\/extraction/);
  assert.match(publicSource, /poor_fit/);
  assert.match(publicSource, /cheap_one_off_fetch/);
  assert.match(publicSource, /pricing_examples_checked_at: '2026-08-26'/);

  assert.match(economics, /OpenAI Web Search/);
  assert.match(economics, /\$1,000/);
  assert.match(economics, /\$700/);
  assert.match(economics, /Firecrawl Pay As You Go/);
  assert.match(economics, /\$500/);
  assert.match(economics, /\$350/);
  assert.match(economics, /Firecrawl Standard/);
  assert.match(economics, /\$83 → \$83/);
  assert.match(publicSource, /direct_plan_fee_avoided_usd: 0/);
  assert.match(economics, /Browserbase Extract/);
  assert.match(economics, /30% is an illustration, not a promised hit rate/);
  assert.match(economics, /Poor fit:/);

  assert.match(quickstart, /Bind once\. One protected call/);
  assert.match(adoption, /protectValidation/);
  assert.match(adoption, /protect_validation/);
  assert.match(mcp, /paid web search, metered scraping, browser\/extraction/);

  for (const text of [economics, publicSource, quickstart, adoption, mcp]) {
    assert.doesNotMatch(text, /guaranteed savings|always cheaper/i);
  }
});
