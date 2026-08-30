import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('maintenance autopilot is scheduled off the CHECK/OBSERVE hot path and remains release-gated', () => {
  const index=read('src/index.ts');
  const maintenance=read('src/maintenance.ts');
  const evaluator=read('src/maintenance-autopilot.ts');
  const vercel=JSON.parse(read('vercel.json'));
  const docs=read('docs/MAINTENANCE_AUTOPILOT.md');
  const admin=read('src/admin.ts');

  assert.match(index,/app\.get\('\/internal\/maintenance'/);
  assert.doesNotMatch(index.match(/app\.post\('\/v1\/check'[\s\S]*?app\.post\('\/v1\/observe'/)?.[0]||'',/maintenanceCron|collectMaintenanceAutopilot|runMaintenanceAutopilotCycle/);
  assert.deepEqual(vercel.crons,[{path:'/internal/maintenance',schedule:'23 3 * * *'}]);
  assert.match(maintenance,/CRON_SECRET/);
  assert.match(maintenance,/MAINTENANCE_AUTOPILOT/);
  assert.match(maintenance,/runHiveHousekeeping/);
  assert.doesNotMatch(maintenance,/setRuntimeControls|merge_pull|paymentsEnabled\s*=|observeFact|checkFact/);
  assert.match(evaluator,/allowed:\['retention-housekeeping'\]/);
  assert.match(evaluator,/forbidden:\['merge-to-main','enable-billing','change-fact-identity','change-privacy-semantics','add-domain-operation','auto-enable-reuse','change-runtime-incident-mode'\]/);
  assert.match(admin,/maintenance_autopilot:maintenanceAutopilot/);
  assert.match(docs,/explicit release/);
  assert.match(docs,/does \*\*not\*\* automatically change runtime incident mode/);
});
