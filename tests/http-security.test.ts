import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../src/canonical.js';
import { limitRequestBody, readJsonBody } from '../src/http.js';

test('bounded JSON reader rejects declared oversized requests before parsing', async () => {
  const request = new Request('https://seenrelay.test/v1/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '9999' },
    body: '{}'
  });
  await assert.rejects(() => readJsonBody(request, 128), (error: unknown) => error instanceof ValidationError && /exceeds 128 bytes/.test(error.message));
});

test('bounded JSON reader rejects oversized streamed input even without Content-Length', async () => {
  const request = new Request('https://seenrelay.test/v1/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(512) })
  });
  request.headers.delete('content-length');
  await assert.rejects(() => readJsonBody(request, 64), (error: unknown) => error instanceof ValidationError && /exceeds 64 bytes/.test(error.message));
});

test('protocol body limiter preserves a bounded MCP POST body and request headers', async () => {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const request = new Request('https://seenrelay.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-test': 'preserve' },
    body: payload
  });
  const bounded = await limitRequestBody(request, 4096);
  assert.equal(bounded.method, 'POST');
  assert.equal(bounded.headers.get('x-test'), 'preserve');
  assert.equal(await bounded.text(), payload);
});
