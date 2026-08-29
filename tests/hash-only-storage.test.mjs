import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('new observation persistence is fingerprint-only', () => {
  const db = read('../src/db.ts');
  const service = read('../src/service.ts');
  assert.doesNotMatch(db, /input\.valueJson/);
  assert.doesNotMatch(service, /valueJson\s*:\s*value\.valueJson/);
  assert.match(db, /'null'::jsonb/);
  assert.match(db, /current_value_json\s*=\s*NULL/);
  assert.match(db, /previous_value_json\s*=\s*NULL/);
});

test('CHECK grouping does not read raw observation values', () => {
  const evidence = read('../src/check-evidence.ts');
  assert.doesNotMatch(evidence, /o\.value_json/);
  assert.doesNotMatch(evidence, /GROUP BY[^`]*value_json/s);
  assert.match(evidence, /GROUP BY o\.fact_key, o\.value_hash/);
});

test('technical data practices disclose fingerprint persistence and legacy state', () => {
  const practices = read('../src/data-practices.ts');
  assert.match(practices, /application_persists/);
  assert.match(practices, /deterministic value fingerprint/);
  assert.match(practices, /legacy_storage/);
});
