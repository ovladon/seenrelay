import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readinessVercel = JSON.parse(fs.readFileSync(new URL('../deploy/readiness/vercel.json', import.meta.url), 'utf8'));
const coreVercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const readinessPackage = JSON.parse(fs.readFileSync(new URL('../deploy/readiness/package.json', import.meta.url), 'utf8'));
const readinessEntry = fs.readFileSync(new URL('../deploy/readiness/src/index.ts', import.meta.url), 'utf8');

test('readiness deployment root is cron-free while core maintenance schedule stays unchanged', () => {
  assert.equal(Object.hasOwn(readinessVercel, 'crons'), false);
  assert.deepEqual(coreVercel.crons, [{ path: '/internal/maintenance', schedule: '23 3 * * *' }]);
});

test('readiness deployment root exports the dedicated service directly', () => {
  assert.match(readinessEntry, /^export \{ default \} from '\.\.\/\.\.\/\.\.\/src\/readiness-service\.js';\s*$/);
  assert.doesNotMatch(readinessEntry, /src\/index|SEENRELAY_DEPLOYMENT_ROLE/);
});

test('readiness deployment build uses the canonical root lockfile and copies only required public assets', () => {
  assert.equal(readinessVercel.framework, 'hono');
  assert.deepEqual(readinessVercel.regions, ['pdx1']);
  assert.match(readinessVercel.installCommand, /cd \.\.\/\.\. && npm ci/);
  for (const asset of ['public/revamp.css', 'public/readiness.css', 'public/readiness.js']) {
    assert.match(readinessVercel.installCommand, new RegExp(asset.replaceAll('.', '\\.')));
  }
  assert.equal(readinessPackage.private, true);
  assert.equal(readinessPackage.type, 'module');
});
