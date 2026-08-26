import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSource, ValidationError } from '../src/canonical';
import { deriveClientKey, deriveReuseIndependenceKey } from '../src/identity';
import { adminLogin } from '../src/admin';
import { boundedRequest, PayloadTooLargeError, readJsonBody } from '../src/http';
import { handleMcp } from '../src/mcp';

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

test('different Preview network buckets are independently testable without weakening Production', withEnv(
  { PRIVACY_SALT: SALT, VERCEL_ENV: 'preview' },
  async () => {
    const a = new Request('https://seenrelay.test', { headers: { 'x-seenrelay-test-network': 'egress-a' }});
    const b = new Request('https://seenrelay.test', { headers: { 'x-seenrelay-test-network': 'egress-b' }});
    assert.notEqual(await deriveReuseIndependenceKey(a), await deriveReuseIndependenceKey(b));
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

test('bounded request rejects unknown-length/chunked bodies before downstream parsing', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('12345678'));
      controller.enqueue(encoder.encode('90abcdef'));
      controller.close();
    }
  });
  const request = new Request('https://seenrelay.test/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half'
  } as RequestInit & { duplex: 'half' });
  await assert.rejects(() => boundedRequest(request, 8), PayloadTooLargeError);
});

test('readJsonBody enforces the byte limit even when Content-Length is unavailable', async () => {
  const request = new Request('https://seenrelay.test/v1/check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: '0123456789' })
  });
  await assert.rejects(() => readJsonBody(request, 8), PayloadTooLargeError);
});

test('MCP rejects oversized transport bodies before SDK parsing', withEnv(
  { MAX_BODY_BYTES: '64' },
  async () => {
    const request = new Request('https://seenrelay.test/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { filler: 'x'.repeat(256) } })
    });
    const response = await handleMcp(request);
    assert.equal(response.status, 413);
    const body = await response.json() as { error?: { code?: number } };
    assert.equal(body.error?.code, -32001);
  }
));

test('admin login rejects oversized bodies before credential comparison', withEnv(
  { ADMIN_SECRET: 'admin-secret-'.padEnd(64, 's'), MAX_BODY_BYTES: '64' },
  async () => {
    const request = new Request('https://seenrelay.test/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'x'.repeat(256) })
    });
    const response = await adminLogin(request);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: { code: 'PAYLOAD_TOO_LARGE' } });
  }
));
