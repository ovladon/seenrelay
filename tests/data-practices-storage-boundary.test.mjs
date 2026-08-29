import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/data-practices.ts', import.meta.url), 'utf8');

test('data practices distinguish active hash-only storage from historical snapshots', () => {
  assert.match(source, /Active Production raw-value columns have been purged/);
  assert.match(source, /database constraints prevent raw submitted values from being persisted there/);
  assert.match(source, /Historical database branches or provider recovery snapshots may retain earlier state/);
  assert.doesNotMatch(source, /Rows written before hash-only persistence may retain previously submitted values/);
});
