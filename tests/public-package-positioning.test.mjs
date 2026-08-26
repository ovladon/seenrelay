import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('human and machine-facing surfaces advertise public package installation', () => {
  const surfaces = [
    read('README.md'),
    read('clients', 'README.md'),
    read('docs', 'QUICKSTART.md'),
    read('src', 'adoption.ts'),
    read('src', 'quickstart.ts'),
  ];

  for (const text of surfaces) {
    assert.match(text, /npm install seenrelay/);
    assert.match(text, /pip install seenrelay/);
  }

  const combined = surfaces.join('\n');
  assert.doesNotMatch(combined, /registry publication is a separate release step/i);
  assert.doesNotMatch(combined, /must not be inferred from repository metadata alone/i);
});

test('machine guidance says to install before binding the deterministic validator', () => {
  const adoption = read('src', 'adoption.ts');
  assert.match(adoption, /first install `seenrelay` from npm or PyPI/);
  assert.match(adoption, /Public JavaScript \/ TypeScript install: `npm install seenrelay`/);
  assert.match(adoption, /Public Python install: `pip install seenrelay`/);
});
