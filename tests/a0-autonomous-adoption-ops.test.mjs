import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('Adoption Atlas distribution snapshot is published autonomously without touching main',()=>{
  const wf=read('.github/workflows/distribution-radar.yml');
  const publisher=read('scripts/publish-adoption-distribution-snapshot.mjs');
  const db=read('src/adoption-atlas-distribution-db.ts');
  assert.match(wf,/contents: write/);
  assert.match(wf,/automation\/adoption-atlas-distribution/);
  assert.match(wf,/git push --force origin HEAD:refs\/heads\/automation\/adoption-atlas-distribution/);
  assert.doesNotMatch(wf,/git push[^\n]*HEAD:main/);
  assert.match(publisher,/unique_users:'UNKNOWN'/);
  assert.match(publisher,/paying_customers:'UNKNOWN'/);
  assert.doesNotMatch(publisher,/client_key|observer_key|ip_address|user_agent/);
  assert.match(db,/github-automation-snapshot/);
  assert.match(db,/raw\.githubusercontent\.com\/ovladon\/seenrelay\/automation\/adoption-atlas-distribution/);
});

test('Production SLO Watch measures internal synthetic CHECK and auto-manages alerts',()=>{
  const wf=read('.github/workflows/production-slo-watch.yml');
  const probe=read('scripts/production-sli-probe.mjs');
  assert.match(wf,/schedule:/);
  assert.match(wf,/issues: write/);
  assert.match(wf,/\[slo\] SeenRelay production SLI breach/);
  assert.match(wf,/gh issue close/);
  assert.match(probe,/seenrelay_internal_benchmark=production-sli-/);
  assert.match(probe,/p99_ms/);
  assert.match(probe,/external_adoption_evidence:false/);
  assert.doesNotMatch(probe,/\/v1\/observe/);
});

test('DR drill is isolated and restores from dump into a fresh database',()=>{
  const wf=read('.github/workflows/dr-restore-drill.yml');
  assert.match(wf,/postgres:18/);
  assert.match(wf,/pg_dump --format=custom/);
  assert.match(wf,/pg_restore --no-owner --no-privileges/);
  assert.match(wf,/seenrelay_drill/);
  assert.match(wf,/seenrelay_restore/);
  assert.doesNotMatch(wf,/DATABASE_URL|DATABASE_ADMIN_URL|neon\.tech|seenrelay\.com/);
  assert.match(wf,/\[dr\] SeenRelay restore drill failure/);
});

test('Machine-first bootstrap is publicly discoverable but does not grant mutation authority',()=>{
  const index=read('src/index.ts');
  const bootstrap=read('src/agent-bootstrap.ts');
  const service=read('src/public.ts');
  assert.match(index,/\/agent-bootstrap\.json/);
  assert.match(index,/\/\.well-known\/seenrelay\.json/);
  assert.match(bootstrap,/evaluation_requires_human_contact:false/);
  assert.match(bootstrap,/may_auto_enable_reuse:false/);
  assert.match(bootstrap,/may_modify_project_without_project_authority:false/);
  assert.match(bootstrap,/duplicate tool calls/);
  assert.match(service,/agent_bootstrap/);
});

test('Infrastructure freeze requires evidence before adding new infrastructure classes',()=>{
  const policy=read('docs/INFRASTRUCTURE_FREEZE.md');
  assert.match(policy,/measured production constraint/);
  assert.match(policy,/verified external user\/customer requirement/);
  assert.match(policy,/security or compliance obligation/);
  assert.match(policy,/default decision is \*\*do not build it\*\*/);
});
