import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CHECK does not disclose observer-submitted raw values', () => {
  const service = fs.readFileSync(new URL('../src/service.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(service, /latest_observed_value\s*:/);
  assert.doesNotMatch(service, /last_observed_value\s*:/);
  assert.doesNotMatch(service, /\bvalue\s*:\s*g\.value_json/);
});
