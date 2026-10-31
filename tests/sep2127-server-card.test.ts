import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import app from '../src/index.js';
import { mcpServerCard } from '../src/mcp-server-card.js';
import { SERVICE_RELEASE } from '../src/version.js';

const read = (path: string) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('SEP-2127 card describes only the actual public remote MCP transport', () => {
  const card = mcpServerCard();
  const registry = JSON.parse(read('registry/server.json'));
  const catalog = JSON.parse(read('public/.well-known/ai-catalog.json'));
  assert.equal(card.$schema, 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json');
  assert.equal(card.name, registry.name, 'reverse-DNS identity stays aligned with official registry');
  assert.equal(card.version, SERVICE_RELEASE);
  assert.equal(card.version, registry.version);
  assert.ok(card.description.length > 0 && card.description.length <= 100);
  assert.deepEqual(card.remotes, registry.remotes);
  assert.equal(card.remotes[0].url, 'https://seenrelay.com/mcp');
  assert.equal(card.repository.url, 'https://github.com/ovladon/seenrelay');
  assert.equal(catalog.specVersion, '1.0');
  assert.equal(catalog.entries.find((entry: { type: string }) => entry.type === 'application/mcp-server-card+json')?.url, 'https://seenrelay.com/mcp/server-card');
  for (const forbidden of ['tools', 'prompts', 'resources', 'authentication', 'headers', 'reuseAuthorized', 'trustManifest']) {
    assert.equal(Object.hasOwn(card, forbidden), false, forbidden);
  }
});

test('SEP-2127 endpoint is a cacheable, CORS-readable, read-only card, not an MCP operation', async () => {
  const response = await app.request('https://seenrelay.com/mcp/server-card', {
    method: 'GET',
    headers: { accept: 'application/mcp-server-card+json' }
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/mcp-server-card\+json/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('cache-control') || '', /max-age=3600/);
  assert.deepEqual(await response.json(), mcpServerCard());
});
