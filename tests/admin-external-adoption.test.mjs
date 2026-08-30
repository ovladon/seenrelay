import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Control Room distinguishes hosted protocol activity from discovery, first-party probes and unobservable client-only use', () => {
  const db = read('src', 'admin-db.ts');
  const admin = read('src', 'admin.ts');
  const ui = read('public', 'admin-v2.js');
  const identity = read('src', 'identity.ts');
  const classifier = read('src', 'traffic-classification.ts');
  const marker = read('scripts', 'internal-telemetry-marker.mjs');
  const reference = read('scripts', 'reference-observer.mjs');
  const env = read('.env.example');

  assert.match(db, /REFERENCE_OBSERVER_ID\s*=\s*'seenrelay-reference-observer-v1'/);
  assert.match(db, /privacyScopedHash\('observer-self', REFERENCE_OBSERVER_ID\)/);
  assert.match(db, /h\.client_key LIKE 'internal:%'/);
  assert.match(db, /observations_first_party/);
  assert.match(db, /observations_internal_benchmark/);
  assert.match(db, /observations_external/);
  assert.match(db, /leases_external_repeat/);
  assert.match(db, /leases_external_bidirectional/);
  assert.match(db, /leases_external_reuse_consumers/);
  assert.match(db, /checks_external_retained/);
  assert.match(db, /observe_attempts_external_retained/);
  assert.match(db, /reuse_external_total/);
  assert.doesNotMatch(db, /checks_external_month/);
  assert.doesNotMatch(db, /reuse_external_month/);
  assert.match(db, /unique_actor_claim:\s*false/);
  assert.match(db, /client_only_usage_visible:\s*false/);
  assert.match(db, /server-verified-first-party-reference-observer-and-controlled-benchmarks-excluded/);

  assert.match(classifier, /x-seenrelay-internal-telemetry/);
  assert.match(classifier, /HMAC/);
  assert.match(classifier, /MAX_SKEW_SECONDS = 300/);
  assert.match(classifier, /never authorize, reject or otherwise change a domain operation/);
  assert.match(identity, /isVerifiedInternalTelemetry/);
  assert.match(identity, /prefix = internal \? 'internal' : 'client'/);
  assert.match(marker, /seenrelay-internal-telemetry-v1/);
  assert.match(env, /INTERNAL_TELEMETRY_SECRET=/);

  assert.match(admin, /external_retained_qualified_reuse_rate/);
  assert.match(admin, /global_unknown_rate/);
  assert.doesNotMatch(admin, /\n\s+qualified_reuse_rate:checks\?reuse\/checks/);
  assert.doesNotMatch(admin, /\n\s+unknown_rate:checks\?unknown\/checks/);
  assert.match(admin, /client_only_local_first:'not observable by the hosted service/);
  assert.match(admin, /hidden_client_telemetry:false/);
  assert.match(admin, /external_actor_count:'pseudonymous lease\/activity classification only; not a unique human or agent count'/);

  assert.match(reference, /\/v1\/observe/);
  assert.doesNotMatch(reference, /\/v1\/check/);

  assert.match(ui, /External leases · 60s/);
  assert.match(ui, /External CHECK · retained/);
  assert.match(ui, /External OBSERVE · retained/);
  assert.match(ui, /External qualified reuse/);
  assert.match(ui, /Repeat external lease/);
  assert.match(ui, /Bidirectional CHECK \+ OBSERVE/);
  assert.match(ui, /Qualified reuse consumer/);
  assert.match(ui, /Client-only usage/);
  assert.match(ui, /not observable by hosted service/);
  assert.match(ui, /Unique actor count/);
  assert.match(ui, /Global UNKNOWN rate/);
  assert.match(ui, /First-party classifier/);
  assert.doesNotMatch(ui, /External Hive Radar/);
  assert.doesNotMatch(ui, /drawRadar/);
  assert.match(db, /top_external_leases/);
  assert.doesNotMatch(ui, /radar_id/);
  assert.doesNotMatch(db, /active_external_leases/);
  assert.doesNotMatch(ui, /External CHECK · month/);
  assert.doesNotMatch(ui, /No external agents active/);
  assert.doesNotMatch(ui, /s\.derived\?\.qualified_reuse_rate/);
  assert.doesNotMatch(ui, /derived\?\.unknown_rate/);
  assert.match(ui, /classification is temporarily unavailable/);
});

test('Preview gate resolves the exact PR preview from Vercel comments or check runs', () => {
  const workflow = read('.github', 'workflows', 'preview-release-gate.yml');
  const resolver = read('scripts', 'resolve-pr-preview-url.mjs');
  assert.match(workflow, /Resolve this PR's Vercel Preview URL/);
  assert.match(workflow, /steps\.preview\.outputs\.url/);
  assert.doesNotMatch(workflow, /seenrelay-git-review-v03-bootstrap/);

  // Keep the original Vercel bot comment path when it exists.
  assert.match(resolver, /vercel\[bot\]/);
  assert.match(resolver, /Preview/);
  assert.match(resolver, /process\.stdout\.write\(match\[1\]\)/);

  // Vercel can expose the Preview only through a check run. The fallback
  // stays pinned to the exact PR head and to the Vercel GitHub App.
  assert.match(resolver, /pulls\/\$\{pr\}/);
  assert.match(resolver, /commits\/\$\{headSha\}\/check-runs/);
  assert.match(resolver, /check\?\.app\?\.slug === 'vercel'/);
  assert.match(resolver, /previewHostname/);
  assert.match(resolver, /process\.stdout\.write\(candidate\)/);
});
