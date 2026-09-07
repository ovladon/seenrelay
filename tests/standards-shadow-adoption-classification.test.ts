import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_STANDARDS_SHADOW_FACTS,
  STANDARDS_SHADOW_FACTS,
  STANDARDS_SHADOW_INTERNAL_QUALIFIERS,
  STANDARDS_SHADOW_LEGACY_CUTOFF,
  legacyStandardsShadowFactKeys,
  standardsShadowFactKeys
} from '../src/internal-benchmark-classification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const EXPECTED_LEGACY_PRODUCTION_FACT_KEYS = [
  '3aba781625694f2eeaa2b0282c67617419cbfceea42bac5e88f0991f81b5ff76',
  'b0d780a75348ed74fd6a262d31ba3f386cd9c013e8be5c6909b5b635b2eac94a',
  '21837e92174c8b2a81f9f581eb04ef300042a4688f3132a091a3203cf1fd24fa',
  'd9483310c06583c60f32aac3c0a2c2cfd270ea65d1d963366fe836e616735739'
];

const EXPECTED_NAMESPACED_FACT_KEYS = [
  'edbbfa0d0ece0397f9fc8197b5e8feb7ff99eab2505e694aabfe52908ab8d59e',
  '782bdb6a4daf1159b8b577fc5c420e142042ccc345226ff37604e633165b674b',
  '3a95567b13892624bffa31ba45f03347ba9facb21a77debcfd7510ea77abdcc1',
  '882f2a91227c7e5879e06badca655cac6352c2f0ca4bb0b32a4ec9eeaa968cc0'
];

test('legacy Standards Shadow fact keys stay pinned to the 56-CHECK Production backfill identities', async () => {
  const keys = await legacyStandardsShadowFactKeys();
  assert.deepEqual(keys, EXPECTED_LEGACY_PRODUCTION_FACT_KEYS);
  assert.equal(new Set(keys).size, 4);
  assert.equal(STANDARDS_SHADOW_LEGACY_CUTOFF, '2026-09-07T04:52:00.000Z');
});

test('future Standards Shadow facts use a distinct internal workload namespace', async () => {
  assert.deepEqual(STANDARDS_SHADOW_INTERNAL_QUALIFIERS, {
    seenrelay_internal_workload: 'standards-shadow-v1'
  });
  const keys = await standardsShadowFactKeys();
  assert.deepEqual(keys, EXPECTED_NAMESPACED_FACT_KEYS);
  assert.equal(new Set(keys).size, 4);
  assert.ok(keys.every((key) => !EXPECTED_LEGACY_PRODUCTION_FACT_KEYS.includes(key)));
  assert.ok(STANDARDS_SHADOW_FACTS.every((fact) => fact.qualifiers?.seenrelay_internal_workload === 'standards-shadow-v1'));
});

test('classifier base identities stay aligned with the actual Standards Shadow definitions', () => {
  const benchmark = read('scripts', 'standards-shadow-benchmark.mjs');
  for (const fact of LEGACY_STANDARDS_SHADOW_FACTS) {
    assert.ok(benchmark.includes(fact.subject), `missing benchmark subject: ${fact.subject}`);
    assert.ok(benchmark.includes(fact.source), `missing benchmark source: ${fact.source}`);
    assert.ok(benchmark.includes(fact.locator!.scheme), `missing benchmark locator scheme: ${fact.locator!.scheme}`);
    assert.ok(benchmark.includes(fact.locator!.value), `missing benchmark locator value: ${fact.locator!.value}`);
  }
  const collector = read('scripts', 'standards-shadow-collector-v2.mjs');
  assert.match(collector, /seenrelay_internal_workload:\s*'standards-shadow-v1'/);
  assert.match(collector, /target\.pathname !== '\/v1\/check'/);
  assert.match(collector, /qualifiers:\s*\{[\s\S]*STANDARDS_SHADOW_INTERNAL_QUALIFIER/);
});

test('Control Room separates current namespaced benchmark traffic from finite legacy backfill', () => {
  const db = read('src', 'admin-db.ts');
  assert.match(db, /standardsShadowFactKeys/);
  assert.match(db, /legacyStandardsShadowFactKeys/);
  assert.match(db, /STANDARDS_SHADOW_LEGACY_CUTOFF/);
  assert.match(db, /currentStandardsShadowLease\s*=\s*`h\.last_fact_key IN/);
  assert.match(db, /historicalLegacyStandardsShadowLease/);
  assert.match(db, /h\.issued_at <= \$\$\{cutoffParam\}::timestamptz/);
  assert.match(db, /h\.observe_count = 0/);
  assert.match(db, /h\.check_count BETWEEN 1 AND 4/);
  assert.match(db, /h\.last_operation = 'CHECK'/);
  assert.match(db, /h\.last_outcome = 'UNKNOWN'/);
  assert.match(db, /seenrelay_internal_benchmark=/);
  assert.doesNotMatch(db, /seenrelay-first-party-standards-shadow-v1/);
});
