import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('public guidance distinguishes deterministic wrappers from MCP tool routing', () => {
  const publicSource = read('src', 'public.ts');
  const readme = read('README.md');
  const clients = read('src', 'adoption.ts');
  const quickstart = read('src', 'quickstart.ts');

  assert.match(publicSource, /Use a deterministic wrapper/);
  assert.match(publicSource, /Deterministic in application code\. MCP when tool routing is appropriate\./);
  assert.match(publicSource, /integration_paths/);
  assert.match(publicSource, /Relay-side failure fails open/);

  assert.match(readme, /recommended path when application code must guarantee that CHECK runs/i);
  assert.match(readme, /MCP remains fully supported/i);
  assert.match(clients, /Do not depend on a model remembering to call MCP/);
  assert.match(quickstart, /Use a wrapper when tool routing itself is the uncertainty/);

  for (const text of [publicSource, readme, clients, quickstart]) {
    assert.match(text, /CHECK/);
    assert.match(text, /OBSERVE/);
    assert.doesNotMatch(text, /wrapper[^\n]{0,80}(third operation|new operation)/i);
  }
});
