import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('static MCP server card stays synchronized with SeenRelay protocol identity', () => {
  const card = JSON.parse(read('public', '.well-known', 'mcp', 'server-card.json'));
  const versionSource = read('src', 'version.ts');
  const mcpSource = read('src', 'mcp.ts');
  const version = versionSource.match(/SERVICE_RELEASE\s*=\s*'([^']+)'/)?.[1];

  assert.ok(version, 'SERVICE_RELEASE constant missing');
  assert.equal(card.serverInfo?.name, 'seenrelay');
  assert.equal(card.serverInfo?.version, version);
  assert.deepEqual(card.tools.map((tool) => tool.name), ['check_fact', 'observe_fact']);
  assert.deepEqual(card.resources, []);
  assert.deepEqual(card.prompts, []);
  assert.equal(card.authentication, undefined, 'SeenRelay is public and must not advertise required auth');

  for (const tool of card.tools) {
    assert.ok(tool.description && typeof tool.description === 'string');
    assert.equal(tool.inputSchema?.type, 'object');
    assert.match(mcpSource, new RegExp(`registerTool\\('${tool.name}'`));
  }

  assert.deepEqual(card.tools[0].inputSchema.required, ['fact', 'known_value']);
  assert.deepEqual(card.tools[1].inputSchema.required, ['fact', 'value']);
});
