import test from 'node:test';
import assert from 'node:assert/strict';
import readinessServiceApp from '../src/readiness-service.js';

const origin = 'https://readiness.seenrelay.test';

test('readiness-only router does not expose SeenRelay core operations', async () => {
  const cases: Array<[string, string]> = [
    ['POST', '/v1/check'],
    ['POST', '/v1/observe'],
    ['POST', '/v1/billing/test'],
    ['GET', '/mcp'],
    ['GET', '/admin'],
    ['GET', '/internal/maintenance']
  ];

  for (const [method, path] of cases) {
    const response = await readinessServiceApp.request(`${origin}${path}`, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
    const payload = await response.json() as any;
    assert.equal(payload.error?.code, 'NOT_FOUND', `${method} ${path}`);
  }
});

test('readiness-only root identifies a separate service and HTML enters the readiness flow', async () => {
  const machine = await readinessServiceApp.request(`${origin}/`, { headers: { accept: 'application/json' } });
  assert.equal(machine.status, 200);
  const descriptor = await machine.json() as any;
  assert.equal(descriptor.schema, 'seenrelay-readiness-service-v1');
  assert.equal(descriptor.core_operations_exposed, false);
  assert.equal(descriptor.human, `${origin}/readiness`);

  const human = await readinessServiceApp.request(`${origin}/`, { headers: { accept: 'text/html' }, redirect: 'manual' });
  assert.equal(human.status, 302);
  assert.equal(human.headers.get('location'), '/readiness');
});

test('readiness-only OpenAPI contains only readiness and health paths', async () => {
  const response = await readinessServiceApp.request(`${origin}/openapi.json`);
  assert.equal(response.status, 200);
  const spec = await response.json() as any;
  const paths = Object.keys(spec.paths || {});
  assert.deepEqual(paths.sort(), ['/healthz', '/readiness', '/readiness.json', '/readiness/audit', '/readiness/audit/v2'].sort());
  const serialized = JSON.stringify(spec);
  for (const forbidden of ['/v1/check', '/v1/observe', '/mcp', '/admin', '/internal/maintenance']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
