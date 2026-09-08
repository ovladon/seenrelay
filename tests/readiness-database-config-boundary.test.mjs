import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../deploy/readiness/vercel.json', import.meta.url), 'utf8'));
const admission = fs.readFileSync(new URL('../src/hive-admission-db.ts', import.meta.url), 'utf8');

test('readiness deployment pins its role without embedding database credentials', () => {
  assert.equal(config.env?.SEENRELAY_DEPLOYMENT_ROLE, 'readiness');
  assert.equal(Object.hasOwn(config.env || {}, 'DATABASE_URL'), false);
  assert.equal(Object.hasOwn(config.env || {}, 'READINESS_DATABASE_URL'), false);
  assert.equal(JSON.stringify(config).includes('postgresql://'), false);
});

test('admission database selector requires the readiness-specific variable for readiness role', () => {
  assert.match(admission, /SEENRELAY_DEPLOYMENT_ROLE === 'readiness'/);
  assert.match(admission, /READINESS_DATABASE_URL/);
  assert.match(admission, /DATABASE_URL/);
  assert.match(admission, /throw new Error\('READINESS_DATABASE_URL is not configured for the readiness deployment'\)/);
});
