import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const map = fs.readFileSync(new URL('../LICENSING.md', import.meta.url), 'utf8');
test('licensing map separates hosted service, clients and interoperability rights without changing licenses', () => {
  assert.match(map, /repository-root.*LICENSE/s); assert.match(map, /Client libraries/); assert.match(map, /MIT License/); assert.match(map, /Protocol documentation and interoperability/); assert.match(map, /does not replace them or grant additional rights/);
});
