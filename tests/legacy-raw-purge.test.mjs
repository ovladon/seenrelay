import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../migrations/0007_purge_legacy_raw_values.sql', import.meta.url), 'utf8');

test('legacy raw-value purge is narrow and idempotent', () => {
  assert.match(migration, /UPDATE observations_recent/);
  assert.match(migration, /SET value_json = 'null'::jsonb/);
  assert.match(migration, /UPDATE facts/);
  assert.match(migration, /current_value_json = NULL/);
  assert.match(migration, /previous_value_json = NULL/);

  assert.doesNotMatch(migration, /DELETE\s+FROM/i);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /SET\s+value_hash\s*=/i);
  assert.doesNotMatch(migration, /SET\s+(current_value_hash|previous_value_hash)\s*=/i);
  assert.doesNotMatch(migration, /observer_key\s*=/i);
});
