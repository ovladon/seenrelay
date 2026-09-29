import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fleet = readFileSync('src/fleet.ts', 'utf8');

test('fleet page exposes bounded provider-unit and headroom evidence', () => {
  assert.match(fleet, /VERIFIED CONTROLLED EVIDENCE/);
  assert.match(fleet, /18 → 9 FIRECRAWL CREDITS/);
  assert.match(fleet, /6 Firecrawl browser jobs for 18 credits/);
  assert.match(fleet, /3 jobs for 9 credits/);
  assert.match(fleet, /5 CALLERS → 1 JOB \+ 4 REUSES/);
  assert.match(fleet, /concurrency ceiling of 2 jobs/);
  assert.match(fleet, /returned HTTP 429/);
  assert.match(fleet, /not an 80% savings claim/i);
  assert.match(fleet, /comparative credit delta and dollar savings stay unknown/i);
  assert.match(fleet, /not natural customer ROI/i);
  assert.match(fleet, /VERIFIED_FLEET_BROWSER_OVERLAP_2026-09-29\.md/);
  assert.match(fleet, /VERIFIED_FLEET_BROWSER_HEADROOM_2026-09-29\.md/);
});
