import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('public/.well-known/ard.json'));

test('ARD v0.91 catalog is discoverable through well-known path, HTML link and robots Agentmap', () => {
  assert.equal(read('public/.well-known/ai-catalog.json'), read('public/.well-known/ard.json'));
  assert.match(read('src/landing.ts'), /<link rel="ard" type="application\\/json" href="\\$\\{origin\\}\\/\\.well-known\\/ard\\.json"/);
  assert.match(read('src/adoption.ts'), /Agentmap: \\$\\{origin\\}\\/\\.well-known\\/ard\\.json/);
});

test('ARD entries are truthful domain-owned references, not auto-execution or adoption claims', () => {
  assert.equal(catalog.entries.length, 2);
  const byId = new Map(catalog.entries.map(entry => [entry.identifier, entry]));
  assert.equal(byId.size, 2);
  for (const entry of catalog.entries) {
    assert.match(entry.identifier, /^urn:air:seenrelay\\.com:/);
    assert.equal(entry['@context'], 'https://agenticresourcediscovery.org/context/v1');
    assert.ok(entry.displayName && entry.description);
    assert.ok(entry.type && /^application\\//.test(entry.type));
    assert.equal(typeof entry.url, 'string');
    assert.ok(entry.url.startsWith('https://seenrelay.com/'));
    assert.equal(Object.hasOwn(entry, 'data'), false);
    assert.ok(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5);
    assert.equal(Object.hasOwn(entry, 'trustManifest'), false, 'no unverified trust attestation');
    assert.equal(Object.hasOwn(entry, 'updatedAt'), false, 'no stale manual timestamp');
  }
  assert.equal(byId.get('urn:air:seenrelay.com:mcp:seenrelay').type, 'application/mcp-server-card+json');
  assert.equal(byId.get('urn:air:seenrelay.com:mcp:seenrelay').url, 'https://seenrelay.com/.well-known/mcp/server-card.json');
  assert.deepEqual(byId.get('urn:air:seenrelay.com:mcp:seenrelay').capabilities, ['check_fact','observe_fact']);
  assert.equal(byId.get('urn:air:seenrelay.com:skill:shadow-audit').type, 'application/agent-skills+md');
  assert.equal(byId.get('urn:air:seenrelay.com:skill:shadow-audit').url, 'https://seenrelay.com/.well-known/agent-skills/seenrelay/SKILL.md');
  assert.match(JSON.stringify(catalog), /native|authoritative|shadow/i);
  assert.doesNotMatch(JSON.stringify(catalog), /guaranteed savings|verified customer|automatic reuse|A2A agent/i);
});
