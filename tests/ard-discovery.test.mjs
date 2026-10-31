import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('public/.well-known/ard.json'));
const aiCatalog = JSON.parse(read('public/.well-known/ai-catalog.json'));


test('ARD v0.91 catalog is discoverable through well-known path, HTML link and robots Agentmap', () => {
  assert.deepEqual(aiCatalog, catalog);
  assert.equal(catalog.specVersion, '1.0');
  assert.ok(read('src/landing.ts').includes('rel="ard" type="application/json" href="${origin}/.well-known/ard.json"'));
  assert.ok(read('src/adoption.ts').includes('Agentmap: ${origin}/.well-known/ard.json'));
});

test('ARD entries are truthful domain-owned references, not auto-execution or adoption claims', () => {
  assert.equal(catalog.entries.length, 2);
  const byId = new Map(catalog.entries.map(entry => [entry.identifier, entry]));
  assert.equal(byId.size, 2);
  for (const entry of catalog.entries) {
    assert.ok(entry.identifier.startsWith('urn:air:seenrelay.com:'));
    assert.equal(entry['@context'], 'https://agenticresourcediscovery.org/context/v1');
    assert.ok(entry.displayName && entry.description);
    assert.ok(entry.type.startsWith('application/'));
    assert.equal(typeof entry.url, 'string');
    assert.ok(entry.url.startsWith('https://seenrelay.com/'));
    assert.equal(Object.hasOwn(entry, 'data'), false);
    assert.ok(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5);
    assert.equal(Object.hasOwn(entry, 'trustManifest'), false, 'no unverified trust attestation');
    assert.equal(Object.hasOwn(entry, 'updatedAt'), false, 'no stale manual timestamp');
  }
  assert.equal(byId.get('urn:air:seenrelay.com:mcp:seenrelay').type, 'application/mcp-server-card+json');
  assert.equal(byId.get('urn:air:seenrelay.com:mcp:seenrelay').url, 'https://seenrelay.com/mcp/server-card');
  assert.deepEqual(byId.get('urn:air:seenrelay.com:mcp:seenrelay').capabilities, ['check_fact','observe_fact']);
  assert.equal(byId.get('urn:air:seenrelay.com:skill:shadow-audit').type, 'application/agent-skills+md');
  assert.equal(byId.get('urn:air:seenrelay.com:skill:shadow-audit').url, 'https://seenrelay.com/.well-known/agent-skills/seenrelay/SKILL.md');
  assert.ok(/native|authoritative|shadow/i.test(JSON.stringify(catalog)));
  assert.ok(!/guaranteed savings|verified customer|automatic reuse|A2A agent/i.test(JSON.stringify(catalog)));
});
