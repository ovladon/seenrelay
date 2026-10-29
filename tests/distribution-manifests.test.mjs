import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (...parts) => JSON.parse(read(...parts));
const endpoint = 'https://seenrelay.com/mcp';

test('portable agent, MCP Registry, and Gemini manifests stay aligned with the running service', () => {
  const versionSource = read('src', 'version.ts');
  const version = versionSource.match(/SERVICE_RELEASE\s*=\s*'([^']+)'/)?.[1];
  assert.ok(version, 'SERVICE_RELEASE constant missing');

  const plugin = json('plugin.json');
  assert.equal(plugin.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(plugin.name, 'seenrelay');
  assert.equal(plugin.version, version);
  assert.equal(plugin.homepage, 'https://seenrelay.com');
  assert.equal(plugin.repository, 'https://github.com/ovladon/seenrelay');
  assert.equal(new Set(plugin.keywords).size, plugin.keywords.length, 'plugin keywords must be unique');
  for (const keyword of ['mcp', 'agent-fleets', 'validation', 'revalidation', 'agent-skills']) {
    assert.ok(plugin.keywords.includes(keyword), `plugin keyword missing: ${keyword}`);
  }

  const portableMcp = json('mcp.json');
  assert.equal(portableMcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  assert.deepEqual(Object.keys(portableMcp.mcpServers), ['seenrelay']);
  assert.deepEqual(portableMcp.mcpServers.seenrelay, { type: 'streamable-http', url: endpoint });

  const registry = json('registry', 'server.json');
  assert.equal(registry.name, 'io.github.ovladon/seenrelay');
  assert.equal(registry.version, version);
  assert.equal(registry.remotes?.[0]?.url, endpoint);
  assert.ok(registry.description.length <= 100, 'MCP Registry description exceeds 100 characters');

  const gemini = json('gemini-extension.json');
  assert.equal(gemini.name, 'seenrelay');
  assert.equal(gemini.version, version);
  assert.equal(gemini.mcpServers?.seenrelay?.httpUrl, endpoint);
  assert.deepEqual(gemini.mcpServers?.seenrelay?.includeTools, ['check_fact', 'observe_fact']);

  assert.equal(gemini.description, plugin.description);
  assert.equal(gemini.mcpServers?.seenrelay?.description, plugin.description);
});

test('Codex repository marketplace is opt-in and indexes the existing native-first skill', () => {
  const portable = json('plugin.json');
  const codex = json('.codex-plugin', 'plugin.json');
  const marketplace = json('.agents', 'plugins', 'marketplace.json');

  assert.equal(codex.name, portable.name);
  assert.equal(codex.version, portable.version);
  assert.equal(codex.description, portable.description);
  assert.equal(codex.skills, './skills/');
  assert.ok(read('skills', 'seenrelay', 'SKILL.md').includes('Start with measurement'));
  assert.equal(Object.hasOwn(codex, 'mcpServers'), false, 'compatibility overlay must not attach a remote MCP server');
  assert.equal(Object.hasOwn(codex, 'hooks'), false, 'compatibility overlay must not install lifecycle hooks');

  assert.equal(marketplace.name, 'seenrelay');
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), ['seenrelay']);
  const entry = marketplace.plugins[0];
  assert.deepEqual(entry.source, { source: 'local', path: './' });
  assert.deepEqual(entry.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
  assert.equal(Object.hasOwn(entry, 'mcpServers'), false);
});
