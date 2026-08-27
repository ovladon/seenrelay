import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSource, ValidationError } from '../src/canonical';
import { deriveAdmissionNetworkKey, deriveClientKey, deriveOperationNetworkKey, deriveReuseIndependenceKey } from '../src/identity';

const SALT = 'seenrelay-hardening-test-privacy-salt-0123456789abcdef';

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  return async () => {
    const before = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(env)) {
      before.set(key, process.env[key]);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    try { await fn(); }
    finally {
      for (const [key, value] of before) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  };
}

test('self-declared client hints separate lease continuity but not reward independence', withEnv(
  { PRIVACY_SALT: SALT, VERCEL_ENV: 'preview' },
  async () => {
    const a = new Request('https://seenrelay.test', { headers: {
      'x-seenrelay-test-network': 'same-egress', 'x-seenrelay-client': 'agent-a', 'user-agent': 'agent-runtime'
    }});
    const b = new Request('https://seenrelay.test', { headers: {
      'x-seenrelay-test-network': 'same-egress', 'x-seenrelay-client': 'agent-b', 'user-agent': 'agent-runtime'
    }});
    assert.notEqual(await deriveClientKey(a), await deriveClientKey(b));
    assert.equal(await deriveReuseIndependenceKey(a), await deriveReuseIndependenceKey(b));
  }
));

test('self-declared client and User-Agent hints cannot multiply aggregate network admission budgets', withEnv(
  { PRIVACY_SALT: SALT, VERCEL_ENV: 'preview' },
  async () => {
    const a = new Request('https://seenrelay.test', { headers: {
      'x-seenrelay-test-network': 'shared-egress', 'x-seenrelay-client': 'agent-a', 'user-agent': 'runtime-a'
    }});
    const b = new Request('https://seenrelay.test', { headers: {
      'x-seenrelay-test-network': 'shared-egress', 'x-seenrelay-client': 'agent-b', 'user-agent': 'runtime-b'
    }});
    assert.equal(await deriveAdmissionNetworkKey(a), await deriveAdmissionNetworkKey(b));
    assert.equal(await deriveOperationNetworkKey(a, 'check'), await deriveOperationNetworkKey(b, 'check'));
    assert.equal(await deriveOperationNetworkKey(a, 'observe'), await deriveOperationNetworkKey(b, 'observe'));
    assert.notEqual(await deriveOperationNetworkKey(a, 'check'), await deriveOperationNetworkKey(a, 'observe'));
  }
));

test('different Preview network buckets are independently testable without weakening Production', withEnv(
  { PRIVACY_SALT: SALT, VERCEL_ENV: 'preview' },
  async () => {
    const a = new Request('https://seenrelay.test', { headers: { 'x-seenrelay-test-network': 'egress-a' }});
    const b = new Request('https://seenrelay.test', { headers: { 'x-seenrelay-test-network': 'egress-b' }});
    assert.notEqual(await deriveReuseIndependenceKey(a), await deriveReuseIndependenceKey(b));
    assert.notEqual(await deriveOperationNetworkKey(a, 'check'), await deriveOperationNetworkKey(b, 'check'));
  }
));

test('Preview-only network override is ignored in Production', withEnv(
  { PRIVACY_SALT: SALT, VERCEL_ENV: 'production' },
  async () => {
    const a = new Request('https://seenrelay.test', { headers: {
      'x-forwarded-for': '203.0.113.10', 'x-seenrelay-test-network': 'fake-a'
    }});
    const b = new Request('https://seenrelay.test', { headers: {
      'x-forwarded-for': '203.0.113.10', 'x-seenrelay-test-network': 'fake-b'
    }});
    assert.equal(await deriveReuseIndependenceKey(a), await deriveReuseIndependenceKey(b));
    assert.equal(await deriveOperationNetworkKey(a, 'check'), await deriveOperationNetworkKey(b, 'check'));
  }
));

test('credential-bearing or signed source URLs are rejected rather than collapsed', () => {
  assert.throws(
    () => normalizeSource('https://example.com/private?id=1&access_token=secret'),
    ValidationError
  );
  assert.throws(
    () => normalizeSource('https://example.com/object?X-Amz-Signature=abc&X-Amz-Credential=def'),
    ValidationError
  );
  assert.equal(
    normalizeSource('https://EXAMPLE.com/item?utm_source=agent&b=2&a=1#fragment'),
    'https://example.com/item?a=1&b=2'
  );
});
