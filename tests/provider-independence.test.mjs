import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coreFiles = [
  'clients/typescript/dist/seenrelay.js',
  'clients/typescript/dist/zero-state.js',
  'clients/typescript/dist/auto.js',
  'clients/typescript/dist/mcp-auto.js'
];

test('zero-state core is provider-independent and does not import provider adapters', () => {
  for (const file of coreFiles) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /firecrawl/i, `${file} must remain provider-independent`);
  }
  const pkg = JSON.parse(readFileSync('clients/typescript/package.json', 'utf8'));
  assert.equal(pkg.dependencies, undefined, 'client package must not acquire provider runtime dependencies');
  assert.ok(pkg.exports['./zero-state']);
  assert.ok(pkg.exports['./auto']);
  assert.ok(pkg.exports['./mcp-auto']);
  assert.ok(pkg.exports['./firecrawl'], 'provider adapters may exist only as optional subpath exports');
});

test('generic automatic path exists without any provider-specific adapter', () => {
  const auto = readFileSync('clients/typescript/dist/auto.js', 'utf8');
  const mcp = readFileSync('clients/typescript/dist/mcp-auto.js', 'utf8');
  assert.match(auto, /exactToolAdapter/);
  assert.match(auto, /jsonHttpToolAdapter/);
  assert.match(mcp, /normalizeResult/);
  assert.match(mcp, /tools must be an object keyed by exact MCP tool name/);
});
