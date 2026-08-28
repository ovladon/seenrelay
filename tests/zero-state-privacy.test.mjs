import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../clients/typescript/dist/zero-state.js', import.meta.url), 'utf8');

test('zero-state cache and in-flight maps use SHA-256 coordinate keys instead of raw coordinate JSON', () => {
  assert.match(source, /subtle\.digest\(['"]SHA-256['"]/);
  assert.match(source, /const key = await opaqueCoordinateKey\(options\.coordinate\)/);
  assert.doesNotMatch(source, /const key = stableJson\(options\.coordinate\)/);
});
