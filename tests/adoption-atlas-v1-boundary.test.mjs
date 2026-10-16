import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('Adoption Atlas distribution collection is cron-only and off the CHECK/OBSERVE hot path', () => {
  const index=read('src/index.ts');
  const collector=read('src/adoption-atlas-distribution.ts');
  const evaluator=read('src/adoption-atlas-v1.ts');
  const migration=read('migrations/0009_adoption_atlas_distribution.sql');
  const vercel=JSON.parse(read('vercel.json'));

  assert.match(index,/app\.get\('\/internal\/adoption-atlas-refresh'/);
  const hot=index.match(/app\.post\('\/v1\/check'[\s\S]*?app\.post\('\/v1\/observe'[\s\S]*?\n\}\);/)?.[0]||'';
  assert.doesNotMatch(hot,/collectAdoptionDistributionSnapshot|runAdoptionAtlasDistributionCycle|adoptionAtlasDistributionCron/);
  assert.deepEqual(vercel.crons,[
    {path:'/internal/maintenance',schedule:'23 3 * * *'},
    {path:'/internal/adoption-atlas-refresh',schedule:'53 5 * * *'}
  ]);
  assert.match(collector,/CRON_SECRET/);
  assert.match(collector,/public-distribution-context-not-adoption/);
  assert.match(evaluator,/distribution_metrics_are_adoption:false/);
  assert.match(evaluator,/unique_users:'UNKNOWN'/);
  assert.match(evaluator,/unique_companies:'UNKNOWN'/);
  assert.match(migration,/No actor, client, IP, request/);
  assert.doesNotMatch(migration,/actor_id|customer_id|client_key|ip_address|user_agent/);
});

test('Control Room exposes evidence classes instead of a unique-user estimate', () => {
  const admin=read('src/admin.ts');
  const ui=read('public/admin-v2.js');
  assert.match(admin,/adoption_atlas_v1:adoptionAtlasV1/);
  assert.match(admin,/adoption_distribution:adoptionDistribution/);
  assert.match(ui,/Adoption Atlas v1 · triangulated evidence/);
  assert.match(ui,/Direct hosted/);
  assert.match(ui,/Qualified external/);
  assert.match(ui,/Voluntary local/);
  assert.match(ui,/Public reach/);
  assert.match(ui,/Unique users \/ companies','UNKNOWN'/);
  assert.doesNotMatch(ui,/unique users:\s*\d+/i);
});
