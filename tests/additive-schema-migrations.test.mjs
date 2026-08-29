import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = new URL('../migrations/', import.meta.url);
const destructiveSchemaPatterns = [
  { name: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { name: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
  { name: 'TRUNCATE TABLE', pattern: /\bTRUNCATE(?:\s+TABLE)?\b/i },
  { name: 'RENAME TABLE', pattern: /\bALTER\s+TABLE[\s\S]*?\bRENAME\s+TO\b/i },
  { name: 'RENAME COLUMN', pattern: /\bRENAME\s+COLUMN\b/i },
  { name: 'DROP CONSTRAINT', pattern: /\bDROP\s+CONSTRAINT\b/i },
  { name: 'ALTER COLUMN TYPE', pattern: /\bALTER\s+COLUMN[\s\S]*?\bTYPE\b/i }
];

test('database migrations remain additive and schema-compatible', () => {
  const files = fs.readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort();

  assert.ok(files.length > 0, 'expected committed database migrations');

  for (const file of files) {
    const sql = fs.readFileSync(new URL(file, migrationsDir), 'utf8');
    for (const { name, pattern } of destructiveSchemaPatterns) {
      assert.doesNotMatch(
        sql,
        pattern,
        `${file} contains ${name}; core schema migrations must be additive and backward-compatible`
      );
    }
  }
});

test('legacy payload columns remain present as compatibility placeholders', () => {
  const init = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  const purge = fs.readFileSync(new URL('../migrations/0007_purge_legacy_raw_values.sql', import.meta.url), 'utf8');

  for (const column of ['value_json', 'current_value_json', 'previous_value_json']) {
    assert.match(init, new RegExp(`\\b${column}\\b`), `${column} must remain represented in the compatibility schema`);
  }

  assert.match(purge, /observations_recent_value_json_redacted/);
  assert.match(purge, /facts_value_json_redacted/);
  assert.doesNotMatch(purge, /DROP\s+(TABLE|COLUMN)/i);
});
