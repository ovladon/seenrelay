import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import {
  configuredReadinessServiceOrigin,
  readinessAuditOrigin,
  readinessConnectSrc,
  readinessRemoteEndpoint,
  readinessUsesRemoteService,
  readinessV2EnabledForPresentation
} from '../src/readiness-routing.js';

const keys = [
  'READINESS_SERVICE_ORIGIN',
  'READINESS_REMOTE_V2_ENABLED',
  'VERCEL_ENV',
  'SEENRELAY_DEPLOYMENT_ROLE'
] as const;

async function withEnv(values: Partial<Record<(typeof keys)[number], string>>, fn: () => Promise<void> | void) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  try {
    await fn();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('readiness stays local outside core production when no remote origin is configured', async () => {
  await withEnv({}, () => {
    assert.equal(configuredReadinessServiceOrigin(), null);
    assert.equal(readinessAuditOrigin('https://seenrelay.test'), 'https://seenrelay.test');
    assert.equal(readinessUsesRemoteService('https://seenrelay.test'), false);
    assert.equal(readinessRemoteEndpoint('https://seenrelay.test', '/readiness/audit'), null);
    assert.equal(readinessV2EnabledForPresentation(true, 'https://seenrelay.test'), true);
    assert.equal(readinessConnectSrc('https://seenrelay.test'), "'self'");
  });
});

test('core production defaults to the isolated readiness service while readiness production stays local', async () => {
  await withEnv({ VERCEL_ENV: 'production' }, () => {
    assert.equal(configuredReadinessServiceOrigin(), 'https://readiness.seenrelay.com');
    assert.equal(readinessAuditOrigin('https://seenrelay.com'), 'https://readiness.seenrelay.com');
    assert.equal(readinessUsesRemoteService('https://seenrelay.com'), true);
    assert.equal(readinessRemoteEndpoint('https://seenrelay.com', '/readiness/audit'), 'https://readiness.seenrelay.com/readiness/audit');
    assert.equal(readinessV2EnabledForPresentation(true, 'https://seenrelay.com'), false);
    assert.equal(readinessConnectSrc('https://seenrelay.com'), "'self' https://readiness.seenrelay.com");
  });

  await withEnv({ VERCEL_ENV: 'production', SEENRELAY_DEPLOYMENT_ROLE: 'readiness' }, () => {
    assert.equal(configuredReadinessServiceOrigin(), null);
    assert.equal(readinessAuditOrigin('https://readiness.seenrelay.com'), 'https://readiness.seenrelay.com');
    assert.equal(readinessUsesRemoteService('https://readiness.seenrelay.com'), false);
    assert.equal(readinessRemoteEndpoint('https://readiness.seenrelay.com', '/readiness/audit'), null);
  });
});

test('explicit readiness origin overrides production default, is HTTPS-only, and preserves rollback', async () => {
  await withEnv({ READINESS_SERVICE_ORIGIN: 'https://readiness.seenrelay.com' }, () => {
    assert.equal(configuredReadinessServiceOrigin(), 'https://readiness.seenrelay.com');
    assert.equal(readinessAuditOrigin('https://seenrelay.com'), 'https://readiness.seenrelay.com');
  });

  await withEnv({ VERCEL_ENV: 'production', READINESS_SERVICE_ORIGIN: 'https://seenrelay.com' }, () => {
    assert.equal(configuredReadinessServiceOrigin(), 'https://seenrelay.com');
    assert.equal(readinessUsesRemoteService('https://seenrelay.com'), false);
    assert.equal(readinessRemoteEndpoint('https://seenrelay.com', '/readiness/audit'), null);
  });

  await withEnv({ READINESS_SERVICE_ORIGIN: 'https://readiness.seenrelay.com', READINESS_REMOTE_V2_ENABLED: 'true' }, () => {
    assert.equal(readinessV2EnabledForPresentation(false, 'https://seenrelay.com'), true);
  });

  await withEnv({ READINESS_SERVICE_ORIGIN: 'http://readiness.seenrelay.com' }, () => {
    assert.throws(() => configuredReadinessServiceOrigin(), /absolute HTTPS origin/);
  });
});

test('core production presentation points directly at remote readiness and old audit routes stop executing locally', async () => {
  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const machine = await app.request('https://seenrelay.com/readiness', { headers: { accept: 'application/json' } });
    assert.equal(machine.status, 200);
    const descriptor = await machine.json() as any;
    assert.equal(descriptor.audits.v1.endpoint, 'https://readiness.seenrelay.com/readiness/audit');
    assert.equal(descriptor.audits.v2.endpoint, 'https://readiness.seenrelay.com/readiness/audit/v2');
    assert.equal(descriptor.audits.v2.enabled, false);

    const human = await app.request('https://seenrelay.com/readiness', { headers: { accept: 'text/html' } });
    assert.equal(human.status, 200);
    const html = await human.text();
    assert.match(html, /data-quick-endpoint="https:\/\/readiness\.seenrelay\.com\/readiness\/audit"/);
    assert.match(human.headers.get('content-security-policy') || '', /connect-src 'self' https:\/\/readiness\.seenrelay\.com/);

    const quick = await app.request('https://seenrelay.com/readiness/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(quick.status, 307);
    assert.equal(quick.headers.get('location'), 'https://readiness.seenrelay.com/readiness/audit');

    const extended = await app.request('https://seenrelay.com/readiness/audit/v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(extended.status, 307);
    assert.equal(extended.headers.get('location'), 'https://readiness.seenrelay.com/readiness/audit/v2');
  });
});
