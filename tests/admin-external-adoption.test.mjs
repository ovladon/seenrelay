import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Control Room separates first-party bootstrap from external adoption and degrades safely', () => {
  const db = read('src', 'admin-db.ts');
  const admin = read('src', 'admin.ts');
  const ui = read('public', 'admin-v2.js');
  const reference = read('scripts', 'reference-observer.mjs');

  assert.match(db, /REFERENCE_OBSERVER_ID\s*=\s*'seenrelay-reference-observer-v1'/);
  assert.match(db, /privacyScopedHash\('observer-self', REFERENCE_OBSERVER_ID\)/);
  assert.match(db, /export async function getAdminSnapshotData/);
  assert.match(db, /export async function getAdminAdoptionData/);
  assert.match(db, /observations_first_party/);
  assert.match(db, /observations_external/);
  assert.match(db, /leases_first_party/);
  assert.match(db, /leases_external/);
  assert.match(db, /checks_external_month/);
  assert.match(db, /reuse_external_total/);
  assert.match(db, /e\.consumer_lease_id/);
  assert.match(db, /h\.check_count > 0/);
  assert.match(db, /ext\.observer_key <> \$1/);

  assert.match(admin, /try \{ adoption=await getAdminAdoptionData\(\); \} catch \(error\) \{ adoption=adoptionUnavailable\(error\); \}/);
  assert.match(admin, /admin_adoption_snapshot_error/);
  assert.match(admin, /admin-v2\.js/);

  assert.match(reference, /\/v1\/observe/);
  assert.doesNotMatch(reference, /\/v1\/check/);

  assert.match(ui, /External bees · 60s/);
  assert.match(ui, /External CHECK · month/);
  assert.match(ui, /External OBSERVE · retained/);
  assert.match(ui, /External qualified reuse/);
  assert.match(ui, /External Hive Radar/);
  assert.match(ui, /External \/ first-party \/ total/);
  assert.match(ui, /Reference Observer · bootstrap only/);
  assert.match(ui, /Adoption milestones/);
  assert.match(ui, /No external agents active in the last 5 minutes/);
  assert.match(ui, /classification is temporarily unavailable/);
});

test('Preview gate resolves the current PR preview instead of using a stale branch alias', () => {
  const workflow = read('.github', 'workflows', 'preview-release-gate.yml');
  const resolver = read('scripts', 'resolve-pr-preview-url.mjs');
  assert.match(workflow, /Resolve this PR's Vercel Preview URL/);
  assert.match(workflow, /steps\.preview\.outputs\.url/);
  assert.doesNotMatch(workflow, /seenrelay-git-review-v03-bootstrap/);
  assert.match(resolver, /vercel\[bot\]/);
  assert.match(resolver, /Preview/);
  assert.match(resolver, /vercel\.app/);
});
