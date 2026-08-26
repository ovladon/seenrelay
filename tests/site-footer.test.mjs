import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('human pages share one accurate legal footer', () => {
  const view = read('src', 'public-facts-view.ts');
  assert.match(view, /export function siteFooterHtml/);
  assert.match(view, /All rights reserved/);
  assert.match(view, /Client libraries: MIT License/);
  assert.match(view, /Recent observations, not universal truth/);
  assert.match(view, /currentYear > 2026/);
  assert.match(view, /2026–/);

  for (const file of ['public.ts', 'quickstart.ts', 'adoption.ts', 'economics.ts']) {
    const text = read('src', file);
    assert.match(text, /siteFooterHtml\(\)/);
    assert.doesNotMatch(text, /<footer>/);
  }
});
