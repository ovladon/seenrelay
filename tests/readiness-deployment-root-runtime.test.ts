import test from 'node:test';
import assert from 'node:assert/strict';
import readinessDeploymentApp from '../deploy/readiness/src/index.js';

const origin = 'https://readiness.seenrelay.test';

test('deployment-root entrypoint cannot expose SeenRelay core operations even without a deployment-role flag', async () => {
  const previous = process.env.SEENRELAY_DEPLOYMENT_ROLE;
  try {
    delete process.env.SEENRELAY_DEPLOYMENT_ROLE;
    for (const [method, path] of [
      ['POST', '/v1/check'],
      ['POST', '/v1/observe'],
      ['GET', '/mcp'],
      ['GET', '/admin'],
      ['GET', '/internal/maintenance']
    ] as const) {
      const response = await readinessDeploymentApp.request(`${origin}${path}`, { method });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  } finally {
    if (previous === undefined) delete process.env.SEENRELAY_DEPLOYMENT_ROLE;
    else process.env.SEENRELAY_DEPLOYMENT_ROLE = previous;
  }
});

test('deployment-root entrypoint serves the readiness machine surface', async () => {
  const response = await readinessDeploymentApp.request(`${origin}/readiness`, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200);
  const payload = await response.json() as any;
  assert.equal(payload.schema, 'seenrelay-readiness-presentation-v1');
  assert.equal(payload.principles?.coreMcpOperations?.join(','), 'CHECK,OBSERVE');
});
