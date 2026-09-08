import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReadinessDatabaseUrl, resolveReadinessPrivacySalt } from '../src/readiness-admission-db.js';

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

test('core deployment preserves the existing readiness admission fallback before cutover', () => {
  withEnv({
    SEENRELAY_DEPLOYMENT_ROLE: undefined,
    READINESS_DATABASE_URL: undefined,
    READINESS_PRIVACY_SALT: undefined,
    DATABASE_URL: 'postgresql://core.example/seenrelay',
    PRIVACY_SALT: 'core-privacy-salt-0123456789abcdef0123456789',
    VERCEL_ENV: undefined
  }, () => {
    assert.equal(resolveReadinessDatabaseUrl(), 'postgresql://core.example/seenrelay');
    assert.equal(resolveReadinessPrivacySalt(), 'core-privacy-salt-0123456789abcdef0123456789');
  });
});

test('partial readiness credential configuration fails closed instead of mixing trust domains', () => {
  withEnv({
    SEENRELAY_DEPLOYMENT_ROLE: undefined,
    READINESS_DATABASE_URL: 'postgresql://readiness.example/readiness',
    READINESS_PRIVACY_SALT: undefined,
    DATABASE_URL: 'postgresql://core.example/seenrelay',
    PRIVACY_SALT: 'core-privacy-salt-0123456789abcdef0123456789'
  }, () => {
    assert.equal(resolveReadinessDatabaseUrl(), 'postgresql://readiness.example/readiness');
    assert.throws(() => resolveReadinessPrivacySalt(), /READINESS_PRIVACY_SALT/);
  });

  withEnv({
    SEENRELAY_DEPLOYMENT_ROLE: undefined,
    READINESS_DATABASE_URL: undefined,
    READINESS_PRIVACY_SALT: 'readiness-privacy-salt-0123456789abcdef0123456789',
    DATABASE_URL: 'postgresql://core.example/seenrelay',
    PRIVACY_SALT: 'core-privacy-salt-0123456789abcdef0123456789'
  }, () => {
    assert.throws(() => resolveReadinessDatabaseUrl(), /READINESS_DATABASE_URL/);
    assert.equal(resolveReadinessPrivacySalt(), 'readiness-privacy-salt-0123456789abcdef0123456789');
  });
});
