import test from 'node:test';
import assert from 'node:assert/strict';
import readinessDeploymentApp from '../deploy/readiness/src/index.js';
import { resolveReadinessDatabaseUrl, resolveReadinessPrivacySalt } from '../src/readiness-admission-db.js';

const origin = 'https://readiness.seenrelay.test';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { fn(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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

test('deployment-root entrypoint forces dedicated readiness credentials', () => {
  withEnv({
    SEENRELAY_DEPLOYMENT_ROLE: undefined,
    READINESS_DATABASE_URL: undefined,
    READINESS_PRIVACY_SALT: undefined,
    DATABASE_URL: 'postgresql://core.example/seenrelay',
    PRIVACY_SALT: 'core-privacy-salt-0123456789abcdef0123456789'
  }, () => {
    assert.throws(() => resolveReadinessDatabaseUrl(), /READINESS_DATABASE_URL/);
    assert.throws(() => resolveReadinessPrivacySalt(), /READINESS_PRIVACY_SALT/);
  });

  withEnv({
    READINESS_DATABASE_URL: 'postgresql://readiness.example/readiness',
    READINESS_PRIVACY_SALT: 'readiness-privacy-salt-0123456789abcdef0123456789',
    DATABASE_URL: 'postgresql://core.example/seenrelay',
    PRIVACY_SALT: 'core-privacy-salt-0123456789abcdef0123456789'
  }, () => {
    assert.equal(resolveReadinessDatabaseUrl(), 'postgresql://readiness.example/readiness');
    assert.equal(resolveReadinessPrivacySalt(), 'readiness-privacy-salt-0123456789abcdef0123456789');
  });
});

test('deployment-root entrypoint serves the readiness machine surface', async () => {
  const response = await readinessDeploymentApp.request(`${origin}/readiness`, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200);
  const payload = await response.json() as any;
  assert.equal(payload.schema, 'seenrelay-readiness-presentation-v1');
  assert.equal(payload.principles?.coreMcpOperations?.join(','), 'CHECK,OBSERVE');
});
