import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (...p) => fs.readFileSync(new URL(`../${p.join('/')}`, import.meta.url), 'utf8');

test('security analysis is pinned and least-privilege scoped', () => {
  const wf = read('.github','workflows','security-analysis.yml');
  assert.match(wf, /github\/codeql-action\/init@[0-9a-f]{40}/);
  assert.match(wf, /github\/codeql-action\/analyze@[0-9a-f]{40}/);
  assert.match(wf, /actions\/dependency-review-action@[0-9a-f]{40}/);
  assert.doesNotMatch(wf, /contents:\s*write|actions:\s*write|pull-requests:\s*write/);
});

test('required CI installs locked dependencies without lifecycle scripts', () => {
  assert.match(read('.github','workflows','ci.yml'), /npm ci --ignore-scripts/);
  assert.match(read('.github','workflows','ai-sdk-compatibility.yml'), /npm ci --ignore-scripts/);
});

test('future npm trusted publishes request provenance explicitly', () => {
  assert.match(read('.github','workflows','publish-clients.yml'), /npm publish "\$TARBALL" --access public --provenance/);
});

test('trust surface does not claim third-party certification or unenforced merge gates', () => {
  const trust = read('src','trust.ts');
  assert.match(trust, /third_party_security_audit:\s*false/);
  assert.match(trust, /external_security_certification:\s*false/);
  assert.match(trust, /Do not take SeenRelay on faith/);
  assert.match(trust, /shadow mode/i);
  assert.match(trust, /Fail open/i);
  assert.match(trust, /required_merge_gates:\s*\['pull_request', 'verify', 'preview-release-gate'\]/);
  assert.match(trust, /branch_ruleset:/);
  assert.doesNotMatch(trust, /Pull request -> CI\/security analysis/);
});

test('MCP gets an explicit bounded transport request before SDK handling', () => {
  const mcp = read('src','mcp.ts');
  assert.match(mcp, /boundedRequest\(request, config\(\)\.maxBodyBytes\)/);
  assert.match(mcp, /handler\.fetch\(safeRequest\)/);
});

test('all public fact-operation REST bodies are bounded before JSON parsing', () => {
  const index = read('src','index.ts');
  for (const route of ['/v1/check', '/v1/observe']) {
    const start = index.indexOf(`app.post('${route}'`);
    assert.notEqual(start, -1, `${route} route must exist`);
    const nextRoute = index.indexOf('\napp.', start + 1);
    const block = index.slice(start, nextRoute === -1 ? undefined : nextRoute);
    assert.match(block, /boundedRequest\(c\.req\.raw, config\(\)\.maxBodyBytes\)/);
    assert.match(block, /const request = bounded\.request/);
    assert.match(block, /readJsonBody<.*>\(request, config\(\)\.maxBodyBytes\)/);
  }
});

test('all admin POST routes are transport-bounded before handlers run', () => {
  const index = read('src','index.ts');
  for (const route of ['/admin/login', '/admin/logout', '/admin/api/control', '/admin/api/playbook', '/admin/api/housekeeping']) {
    const start = index.indexOf(`app.post('${route}'`);
    assert.notEqual(start, -1, `${route} route must exist`);
    const nextRoute = index.indexOf('\napp.', start + 1);
    const block = index.slice(start, nextRoute === -1 ? undefined : nextRoute);
    assert.match(block, /boundedRequest\(c\.req\.raw, Math\.min\(config\(\)\.maxBodyBytes, 4096\)\)/);
    assert.match(block, /if \('response' in bounded\) return bounded\.response/);
  }
});

test('trust surface is discoverable to humans and coding agents', () => {
  const adoption = read('src','adoption.ts');
  assert.match(adoption, /const urls = \[.*'\/trust'/);
  assert.match(adoption, /Trust \/ verification posture: \${origin}\/trust/);
});

test('aggregate network abuse ceiling is atomic, separate by operation, and precedes lease lookup', () => {
  const budget = read('src','hive-admission-db.ts');
  assert.match(budget, /export async function consumeHiveNetworkBudget/);
  assert.match(budget, /ON CONFLICT \(admission_key, window_start\) DO UPDATE SET/);
  assert.match(budget, /WHERE hive_admission_windows\.admissions < \$3::int/);

  const identity = read('src','identity.ts');
  assert.match(identity, /deriveOperationNetworkKey\(request: Request, operation: 'check' \| 'observe'\)/);
  assert.match(identity, /operation-network:\$\{operation\}/);

  const hive = read('src','hive.ts');
  const aggregateBudget = hive.indexOf('const operationAdmission = await consumeHiveNetworkBudget');
  const leaseLookup = hive.indexOf('const ensured = await ensureLease');
  assert.notEqual(aggregateBudget, -1, 'aggregate operation budget must be consumed');
  assert.notEqual(leaseLookup, -1, 'lease lookup must exist');
  assert.ok(aggregateBudget < leaseLookup, 'aggregate network ceiling must run before lease lookup/creation');
  assert.match(hive, /cfg\.hiveMaxChecksPerNetworkPerMinute/);
  assert.match(hive, /cfg\.hiveMaxObservesPerNetworkPerMinute/);
});

test('runtime database cutover keeps migration authority out of runtime and disables transitive/SET role escalation', () => {
  const migrationRunner = read('scripts','migrate.mjs');
  assert.match(migrationRunner, /process\.env\.DATABASE_ADMIN_URL/);
  assert.doesNotMatch(migrationRunner, /process\.env\.DATABASE_URL/);

  const migration = read('migrations','0006_runtime_db_and_admission.sql');
  assert.match(migration, /CREATE ROLE seenrelay_runtime\s+NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.match(migration, /ALTER ROLE seenrelay_runtime\s+NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);

  const guide = read('docs','RUNTIME_DATABASE_ROLE.md');
  assert.match(guide, /CREATE ROLE seenrelay_app[\s\S]*LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT/);
  assert.match(guide, /GRANT seenrelay_runtime TO seenrelay_app\s+WITH ADMIN FALSE, INHERIT TRUE, SET FALSE/);
  assert.match(guide, /must not own application tables, schemas, functions, or migrations/);
  assert.match(guide, /never deploy `DATABASE_ADMIN_URL`/);
});
