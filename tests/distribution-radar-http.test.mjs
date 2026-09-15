import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RegistryProbeError,
  lookupOfficialMcpRegistryVersion,
  requestWithRetry
} from '../scripts/distribution-radar-http.mjs';

const NAME = 'io.github.ovladon/seenrelay';
const VERSION = '0.3.10';

function response(body, { status = 200, statusText = 'OK' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body)
  };
}

test('requestWithRetry recovers from bounded transient failures', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) throw new Error('transient timeout');
    return response({ ok: true });
  };

  const body = await requestWithRetry('https://example.test/value', {
    json: true,
    fetchImpl,
    sleepImpl: async () => {},
    attempts: 3,
    timeoutMs: 50
  });

  assert.deepEqual(body, { ok: true });
  assert.equal(calls, 3);
});

test('requestWithRetry does not retry a non-retryable HTTP 4xx', async () => {
  let calls = 0;
  await assert.rejects(
    requestWithRetry('https://example.test/missing', {
      fetchImpl: async () => {
        calls += 1;
        return response('missing', { status: 404, statusText: 'Not Found' });
      },
      sleepImpl: async () => {},
      attempts: 3,
      timeoutMs: 50
    }),
    /404 Not Found/
  );
  assert.equal(calls, 1);
});

test('Official MCP Registry uses exact-version lookup first', async () => {
  const urls = [];
  const result = await lookupOfficialMcpRegistryVersion({
    name: NAME,
    version: VERSION,
    request: async (url) => {
      urls.push(url);
      return { server: { name: NAME, version: VERSION } };
    }
  });

  assert.equal(result.mode, 'exact-version');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/v0\.1\/servers\/io\.github\.ovladon%2Fseenrelay\/versions\/0\.3\.10$/);
});

test('Official MCP Registry search is a compatibility fallback after exact lookup transport failure', async () => {
  const urls = [];
  const result = await lookupOfficialMcpRegistryVersion({
    name: NAME,
    version: VERSION,
    request: async (url) => {
      urls.push(url);
      if (url.includes('/versions/')) throw new Error('exact endpoint timed out');
      return { servers: [{ server: { name: NAME, version: VERSION } }] };
    }
  });

  assert.equal(result.mode, 'search-fallback');
  assert.equal(urls.length, 2);
  assert.match(urls[1], /\/v0\.1\/servers\?search=io\.github\.ovladon%2Fseenrelay$/);
  assert.match(result.detail, /search fallback/);
});

test('valid registry responses without the expected version are semantic drift', async () => {
  await assert.rejects(
    lookupOfficialMcpRegistryVersion({
      name: NAME,
      version: VERSION,
      request: async () => ({ servers: [] })
    }),
    (error) => {
      assert.ok(error instanceof RegistryProbeError);
      assert.equal(error.kind, 'semantic_drift');
      return true;
    }
  );
});

test('dual transport failure is upstream unavailable, not SeenRelay semantic drift', async () => {
  await assert.rejects(
    lookupOfficialMcpRegistryVersion({
      name: NAME,
      version: VERSION,
      request: async () => { throw new Error('upstream timeout'); }
    }),
    (error) => {
      assert.ok(error instanceof RegistryProbeError);
      assert.equal(error.kind, 'upstream_unavailable');
      assert.match(error.message, /unreachable through both exact-version and search probes/);
      return true;
    }
  );
});
