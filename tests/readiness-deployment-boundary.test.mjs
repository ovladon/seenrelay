import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/readiness-service.ts', import.meta.url), 'utf8');

test('deployment role selects a separate readiness app at the export boundary', () => {
  assert.match(index, /import readinessServiceApp from '\.\/readiness-service\.js';/);
  assert.match(index, /export default process\.env\.SEENRELAY_DEPLOYMENT_ROLE === 'readiness' \? readinessServiceApp : app;/);
});

test('readiness app has no imports from SeenRelay core runtime surfaces', () => {
  for (const forbiddenImport of ['./service.js', './hive.js', './mcp.js', './admin.js', './billing.js', './maintenance.js']) {
    assert.equal(service.includes(`from '${forbiddenImport}'`), false, forbiddenImport);
  }
});

test('readiness app registers no core routes', () => {
  for (const forbiddenRoute of ["app.post('/v1/check'", "app.post('/v1/observe'", "app.all('/mcp'", "app.get('/admin'", "app.get('/internal/maintenance'", "app.all('/v1/billing/"]) {
    assert.equal(service.includes(forbiddenRoute), false, forbiddenRoute);
  }
  for (const requiredRoute of ["app.get('/readiness'", "app.post('/readiness/audit'", "app.post('/readiness/audit/v2'", "app.get('/healthz'"]) {
    assert.equal(service.includes(requiredRoute), true, requiredRoute);
  }
});
