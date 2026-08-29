import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../src/service.ts', import.meta.url), 'utf8');
const evidence = fs.readFileSync(new URL('../src/check-evidence.ts', import.meta.url), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

test('CHECK service uses one semantic snapshot reader for fact plus evidence', () => {
  const block = between(service, 'export async function checkFact', 'export async function observeFact');
  assert.match(block, /getCheckSnapshotWithValidators\(fact\.factKey, cutoffIso\)/);
  assert.equal(block.includes('getFact('), false);
  assert.equal(block.includes('getRecentValueGroupsWithValidators('), false);
  assert.match(block, /const stored = snapshot\.fact;/);
  assert.match(block, /const groups = snapshot\.groups;/);
});

test('combined snapshot reads facts and recent evidence in one SQL statement', () => {
  const block = between(
    evidence,
    'export async function getCheckSnapshotWithValidators',
    '\n}'
  );
  assert.equal((block.match(/sql\(\)\.query\(/g) || []).length, 1);
  assert.match(block, /FROM facts f/);
  assert.match(block, /FROM observations_recent o/);
  assert.match(block, /o\.fact_key = \$1 AND o\.observed_at >= \$2::timestamptz/);
  assert.match(block, /LIMIT 8/);
  assert.equal(block.includes('value_json'), false);
});

test('legacy fingerprint aliases still use the existing conservative merge path', () => {
  assert.match(evidence, /return mergeEvidenceRows\(factKey, rows\);/);
  assert.match(evidence, /groups: await mergeEvidenceRows\(factKey,/);
  assert.match(evidence, /observers: Math\.max\(existing\.observers, row\.observers\)/);
  assert.match(evidence, /cryptographic_observers: Math\.max\(existing\.cryptographic_observers, row\.cryptographic_observers\)/);
  assert.match(evidence, /unverified_observers: Math\.max\(existing\.unverified_observers, row\.unverified_observers\)/);
});
