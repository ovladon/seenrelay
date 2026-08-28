import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('human and machine-facing surfaces advertise public package installation from canonical facts', () => {
  const facts = JSON.parse(read('public', 'product-facts.json'));
  assert.equal(facts.install.npm_command, 'npm install seenrelay');
  assert.equal(facts.install.pypi_command, 'pip install seenrelay');

  for (const file of ['README.md', 'clients/README.md', 'docs/QUICKSTART.md']) {
    const text = read(...file.split('/'));
    assert.match(text, /npm install seenrelay/);
    assert.match(text, /pip install seenrelay/);
    assert.match(text, /BEGIN GENERATED:/);
  }

  const view = read('src', 'public-facts-view.ts');
  const adoption = read('src', 'adoption.ts');
  const quickstart = read('src', 'quickstart.ts');
  const publicSource = read('src', 'public.ts');
  assert.match(view, /f\.install\.npm_command/);
  assert.match(view, /f\.install\.pypi_command/);
  assert.match(adoption, /publicInstallHtml\(\)/);
  assert.match(adoption, /machinePublicFactsText\(origin\)/);
  assert.match(quickstart, /publicInstallHtml\(\)/);
  assert.match(publicSource, /publicInstallHtml\(\)/);

  const combined = [view, adoption, quickstart, publicSource].join('\n');
  assert.doesNotMatch(combined, /registry publication is a separate release step/i);
  assert.doesNotMatch(combined, /must not be inferred from repository metadata alone/i);
});

test('machine guidance preserves canonical install facts before integration guidance', () => {
  const adoption = read('src', 'adoption.ts');
  const view = read('src', 'public-facts-view.ts');
  const factsIndex = adoption.indexOf('${machinePublicFactsText(origin)}');
  const integrationIndex = adoption.indexOf('## Preferred JavaScript / TypeScript order');
  assert.ok(factsIndex >= 0 && integrationIndex > factsIndex, 'canonical install facts must precede integration guidance');
  assert.match(view, /## Public install/);
  assert.match(view, /Client version:/);
  assert.match(view, /Canonical machine-readable product facts/);
});
