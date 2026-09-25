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
  const benchmarkClassifier = read('src', 'internal-benchmark-classification.ts');
  const marker = read('scripts', 'internal-telemetry-marker.mjs');
  const reference = read('scripts', 'reference-observer.mjs');
  const practices = read('src', 'data-practices.ts');
  const env = read('.env.example');

  assert.match(db, /REFERENCE_OBSERVER_ID\s*=\s*'seenrelay-reference-observer-v1'/);
  assert.match(db, /DELTA_OBSERVER_ID\s*=\s*'seenrelay-private-delta-observer-v1'/);
  assert.match(db, /FIRST_PARTY_OBSERVER_IDS/);
  assert.match(db, /deriveFirstPartyObserverKeys/);
  assert.match(db, /privacyScopedHash\('observer-self', id\)/);
  assert.match(db, /h\.client_key LIKE 'internal:%'/);
  assert.match(db, /h\.client_key LIKE 'demo:%'/);
  assert.match(db, /leases_public_demo/);
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
  assert.match(db, /server-verified-first-party-controlled-benchmarks-and-public-demo-excluded/);

  // Scheduled Standards Shadow CHECKs must be excluded by their canonical fact key even after
  // retention removes the corresponding facts row. Do not regress to a facts-table join only.
  assert.match(db, /const currentStandardsShadowLease = `h\.last_fact_key IN/);
  assert.match(db, /const internalBenchmarkLease = `\(\s*\$\{currentStandardsShadowLease\}/);
  assert.match(db, /currentStandardsShadowFact/);
  assert.match(benchmarkClassifier, /seenrelay_internal_workload:\s*'standards-shadow-v1'/);
  assert.match(benchmarkClassifier, /Historical controlled CHECK identities/);

  assert.match(classifier, /x-seenrelay-internal-telemetry/);
  assert.match(classifier, /HMAC/);
  assert.match(classifier, /MAX_SKEW_SECONDS = 300/);
  assert.match(classifier, /never authorize, reject or otherwise change a domain operation/);
  assert.match(identity, /isVerifiedInternalTelemetry/);
  assert.match(identity, /clientHint === 'web-starter-check' \? 'demo' : 'client'/);
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
  assert.match(db, /observer_key IN \(\$\{firstPartyKeyPlaceholders\}\)/);
  assert.match(db, /String\.fromCharCode\(36\)/);
  assert.match(db, /observer_key NOT IN \(\$\{firstPartyKeyPlaceholders\}\)/);
  assert.match(practices, /contract_revision:\s*'delta-first-party-gate-v1'/);
  assert.match(practices, /delta_seed_observer/);
  assert.match(practices, /seenrelay-private-delta-observer-v1/);
  assert.match(practices, /classified_as_external_adoption:\s*false/);
  assert.match(practices, /prediction_used_to_create_observation:\s*false/);

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
  const discoveryUi = read('public', 'admin-discovery.js');
  assert.match(discoveryUi, /\/admin\/api\/snapshot/);
  assert.doesNotMatch(discoveryUi, /window\.fetch\s*=/);
  assert.match(discoveryUi, /checks_external_retained/);
  assert.match(discoveryUi, /reuse_external_total/);
  assert.doesNotMatch(discoveryUi, /checks_external_month/);
  assert.doesNotMatch(discoveryUi, /reuse_external_month/);
  assert.match(discoveryUi, /Maintenance autopilot/);
  assert.match(discoveryUi, /maintenance_autopilot/);
  assert.match(discoveryUi, /retention housekeeping only/);
  assert.match(discoveryUi, /inactive until CRON_SECRET is configured/);
  assert.doesNotMatch(ui, /External CHECK · month/);
  assert.doesNotMatch(ui, /No external agents active/);
  assert.doesNotMatch(ui, /s\.derived\?\.qualified_reuse_rate/);
  assert.doesNotMatch(ui, /derived\?\.unknown_rate/);
  assert.match(ui, /classification is temporarily unavailable/);
});

test('Preview gate resolves the core deployment and tolerates a non-deploying PR tail', () => {
  const workflow = read('.github', 'workflows', 'preview-release-gate.yml');
  const resolver = read('scripts', 'resolve-pr-preview-url.mjs');
  assert.match(workflow, /Resolve this PR's Vercel Preview URL/);
  assert.match(workflow, /steps\.preview\.outputs\.url/);
  assert.doesNotMatch(workflow, /seenrelay-git-review-v03-bootstrap/);

  // The gate walks the PR first-parent chain and remembers the latest commit
  // that actually changed the main deployment boundary. A test/docs-only tail
  // therefore validates the runtime-equivalent deployed ancestor instead of
  // waiting for a deployment Vercel intentionally skipped.
  assert.match(workflow, /git rev-list --reverse --first-parent/);
  assert.match(workflow, /release_sha=\$release_sha/);
  assert.match(workflow, /DEPLOYMENT_SHA/);
  assert.match(workflow, /steps\.applicability\.outputs\.release_sha/);

  const releaseGate = read('scripts', 'preview-release-gate.sh');
  assert.match(releaseGate, /deployment_covers_release/);
  assert.match(releaseGate, /git merge-base --is-ancestor "\$RELEASE_SHA" "\$actual"/);
  assert.match(releaseGate, /git rev-list --reverse --first-parent "\$\{RELEASE_SHA\}\.\.\$\{actual\}"/);
  assert.match(releaseGate, /VERCEL_GIT_PREVIOUS_SHA="\$parent" VERCEL_GIT_COMMIT_SHA="\$commit" bash scripts\/vercel-ignore-main\.sh/);
  assert.match(releaseGate, /runtime-equivalent descendant/);

  // In this monorepo the Vercel bot comment contains both core and readiness.
  // The core release gate must select only the seenrelay row.
  assert.match(resolver, /corePreviewFromComment/);
  assert.match(resolver, /\[seenrelay\\\]/);
  assert.match(resolver, /seenrelay-readiness/);
  assert.match(resolver, /DEPLOYMENT_SHA/);
  assert.match(resolver, /commits\/\$\{targetSha\}\/check-runs/);
  assert.doesNotMatch(resolver, /process\.stdout\.write\(match\[1\]\)/);
  assert.match(resolver, /process\.stdout\.write\(candidate\)/);
});
