import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRequest } from '../src/http.js';
import { handleMcp } from '../src/mcp.js';

test('boundedRequest rejects oversized declared bodies before downstream parsing', async () => {
  const req = new Request('https://seenrelay.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '99999' },
    body: '{}'
  });
  const result = await boundedRequest(req, 1024);
  assert.ok('response' in result);
  assert.equal(result.response.status, 413);
});

test('boundedRequest rejects oversized bodies without relying on Content-Length', async () => {
  const req = new Request('https://seenrelay.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'x'.repeat(2048)
  });
  const result = await boundedRequest(req, 1024);
  assert.ok('response' in result);
  assert.equal(result.response.status, 413);
});

test('MCP oversized body is rejected before MCP SDK or database work', async () => {
  const req = new Request('https://seenrelay.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '99999' },
    body: '{}'
  });
  const response = await handleMcp(req);
  assert.equal(response.status, 413);
});
