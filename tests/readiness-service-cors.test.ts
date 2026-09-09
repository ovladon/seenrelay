import test from 'node:test';
import assert from 'node:assert/strict';
import readinessServiceApp from '../src/readiness-service.js';

const serviceOrigin = 'https://readiness.seenrelay.test';

async function withAllowedOrigin(value: string | undefined, fn: () => Promise<void>) {
  const previous = process.env.READINESS_ALLOWED_ORIGIN;
  if (value === undefined) delete process.env.READINESS_ALLOWED_ORIGIN;
  else process.env.READINESS_ALLOWED_ORIGIN = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.READINESS_ALLOWED_ORIGIN;
    else process.env.READINESS_ALLOWED_ORIGIN = previous;
  }
}

test('readiness service accepts browser preflight only from the configured site or itself', async () => {
  await withAllowedOrigin('https://seenrelay.com', async () => {
    const allowed = await readinessServiceApp.request(`${serviceOrigin}/readiness/audit`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://seenrelay.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,accept'
      }
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://seenrelay.com');
    assert.match(allowed.headers.get('access-control-allow-methods') || '', /POST/);
    assert.match(allowed.headers.get('access-control-allow-headers') || '', /content-type/);

    const self = await readinessServiceApp.request(`${serviceOrigin}/readiness/audit`, {
      method: 'OPTIONS',
      headers: { origin: serviceOrigin, 'access-control-request-method': 'POST' }
    });
    assert.equal(self.status, 204);
    assert.equal(self.headers.get('access-control-allow-origin'), serviceOrigin);

    const denied = await readinessServiceApp.request(`${serviceOrigin}/readiness/audit`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });
});

test('foreign browser origins are rejected before an audit can execute', async () => {
  await withAllowedOrigin('https://seenrelay.com', async () => {
    const denied = await readinessServiceApp.request(`${serviceOrigin}/readiness/audit`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ site: 42 })
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json() as any).error?.code, 'ORIGIN_NOT_ALLOWED');

    const allowed = await readinessServiceApp.request(`${serviceOrigin}/readiness/audit`, {
      method: 'POST',
      headers: { origin: 'https://seenrelay.com', 'content-type': 'application/json' },
      body: JSON.stringify({ site: 42 })
    });
    assert.equal(allowed.status, 400);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://seenrelay.com');
    assert.equal((await allowed.json() as any).error?.code, 'INVALID_SITE');
  });
});

test('non-browser API clients remain usable without an Origin header', async () => {
  await withAllowedOrigin(undefined, async () => {
    const response = await readinessServiceApp.request(`${serviceOrigin}/readiness/audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ site: 42 })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as any).error?.code, 'INVALID_SITE');
  });
});
