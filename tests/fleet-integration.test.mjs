import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('fleet integration recipe stays cost-first, bind-once and shadow-safe', () => {
  const guide = read('docs', 'FLEET_INTEGRATION.md');
  assert.match(guide, /Pick one expensive repeated validation/);
  assert.match(guide, /Do not start with a cheap one-off GET/);
  assert.match(guide, /protectValidation/);
  assert.match(guide, /protect_validation/);
  assert.match(guide, /default shadow mode nothing is skipped/i);
  assert.match(guide, /SAME_OBSERVED/);
  assert.match(guide, /not a truth oracle/i);
});
