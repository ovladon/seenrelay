import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Control Room adoption telemetry excludes the first-party Reference Observer', () => {
  const db = read('src', 'admin-db.ts');
  const ui = read('public', 'admin.js');
  const reference = read('scripts', 'reference-observer.mjs');

  assert.match(db, /REFERENCE_OBSERVER_ID\s*=\s*'seenrelay-reference-observer-v1'/);
  assert.match(db, /privacyScopedHash\('observer-self', REFERENCE_OBSERVER_ID\)/);
  assert.match(db, /observer_key <> \$1/);
  assert.match(db, /externalLeaseFilter/);
  assert.match(db, /e\.consumer_lease_id/);
  assert.match(db, /AS observes_month/);
  assert.doesNotMatch(db, /SUM\(observes\).*AS observes_month/);

  assert.match(reference, /\/v1\/observe/);
  assert.doesNotMatch(reference, /\/v1\/check/);

  assert.match(ui, /External bees · 60s/);
  assert.match(ui, /External CHECK · month/);
  assert.match(ui, /External OBSERVE · retained/);
  assert.match(ui, /External qualified reuse/);
  assert.match(ui, /External Hive Radar/);
  assert.match(ui, /Reference Observer excluded/);
  assert.match(ui, /Top external contributors/);
});
