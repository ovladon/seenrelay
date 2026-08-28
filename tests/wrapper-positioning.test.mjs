import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('public guidance distinguishes local-first application placement from remote MCP routing', () => {
  const publicSource = read('src', 'public.ts');
  const readme = read('README.md');
  const clients = read('src', 'adoption.ts');
  const quickstart = read('src', 'quickstart.ts');

  assert.match(publicSource, /javascript_typescript_zero_state/);
  assert.match(publicSource, /shared_check_default:\s*'off'/);
  assert.match(publicSource, /integration_paths/);
  assert.match(publicSource, /fails open into the application's existing validation path/i);

  assert.match(readme, /JavaScript \/ TypeScript Zero-State/i);
  assert.match(readme, /provider-independent/i);
  assert.match(readme, /Classic shadow-first path/i);
  assert.match(clients, /seenrelay\/mcp-auto/);
  assert.match(clients, /MCP remains the standard remote discovery and tool interface/);
  assert.match(quickstart, /MCP remains the standard discovery and model\/tool-routing interface/);
  assert.match(quickstart, /MCP BIND-ONCE/);
  assert.match(quickstart, /Shared SeenRelay CHECK is off by default/);

  for (const text of [publicSource, readme, clients, quickstart]) {
    assert.match(text, /CHECK/);
    assert.match(text, /OBSERVE/);
    assert.doesNotMatch(text, /wrapper[^\n]{0,80}(third operation|new operation)/i);
  }
});
