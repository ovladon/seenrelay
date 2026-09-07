import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STANDARDS_SHADOW_FACTS, standardsShadowFactKeys } from '../src/internal-benchmark-classification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const EXPECTED_PRODUCTION_FACT_KEYS = [
  '3aba781625694f2eeaa2b0282c67617419cbfceea42bac5e88f0991f81b5ff76',
  'b0d780a75348ed74fd6a262d31ba3f386cd9c013e8be5c6909b5b635b2eac94a',
  '21837e92174c8b2a81f9f581eb04ef300042a4688f3132a091a3203cf1fd24fa',
  'd9483310c06583c60f32aac3c0a2c2cfd270ea65d1d963366fe836e616735739'
];

test('Standards Shadow canonical fact keys stay pinned to the Production identities used by the controlled CHECK workload', async () => {
  const keys = await standardsShadowFactKeys();
  assert.deepEqual(keys, EXPECTED_PRODUCTION_FACT_KEYS);
  assert.equal(new Set(keys).size, 4);
});

test('adoption classifier identities stay aligned with the actual Standards Shadow fact definitions', () => {
  const benchmark = read('scripts', 'standards-shadow-benchmark.mjs');
  for (const fact of STANDARDS_SHADOW_FACTS) {
    assert.ok(benchmark.includes(fact.subject), `missing benchmark subject: ${fact.subject}`);
    assert.ok(benchmark.includes(fact.source), `missing benchmark source: ${fact.source}`);
    assert.ok(benchmark.includes(fact.locator!.scheme), `missing benchmark locator scheme: ${fact.locator!.scheme}`);
    assert.ok(benchmark.includes(fact.locator!.value), `missing benchmark locator value: ${fact.locator!.value}`);
  }
});

test('Control Room excludes CHECK-only Standards Shadow leases by canonical fact identity rather than client hints', () => {
  const db = read('src', 'admin-db.ts');
  assert.match(db, /standardsShadowFactKeys/);
  assert.match(db, /knownStandardsShadowLease\s*=\s*`h\.last_fact_key IN/);
  assert.match(db, /adoptionParams\s*=\s*\[firstPartyObserverKey, \.\.\.standardsShadowKeys\]/);
  assert.match(db, /seenrelay_internal_benchmark=/);
  assert.doesNotMatch(db, /seenrelay-first-party-standards-shadow-v1/);
});
