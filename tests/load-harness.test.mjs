import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../scripts/load-seenrelay.mjs', import.meta.url), 'utf8');

test('controlled load harness cannot silently target Production', () => {
  assert.match(source, /SEENRELAY_LOAD_BASE_URL is required/);
  assert.match(source, /SEENRELAY_LOAD_ALLOW_PRODUCTION/);
  assert.match(source, /Refusing to load-test Production/);
});

test('controlled load traffic is excluded from external adoption classification', () => {
  assert.match(source, /seenrelay_internal_benchmark=load-/);
  assert.match(source, /adoption_marker: 'seenrelay_internal_benchmark'/);
});

test('controlled load harness keeps shared and distributed Preview topologies explicit', () => {
  assert.match(source, /SEENRELAY_LOAD_NETWORK_MODE/);
  assert.match(source, /shared/);
  assert.match(source, /distributed/);
  assert.match(source, /Distributed network simulation is Preview-only/);
});

test('controlled load harness has bounded stages and kill criteria', () => {
  assert.match(source, /SEENRELAY_LOAD_STAGES/);
  assert.match(source, /stages\.length > 12/);
  assert.match(source, /no_semantic_mismatches/);
  assert.match(source, /five_xx_within_limit/);
  assert.match(source, /success_p95_within_limit/);
  assert.match(source, /process\.exitCode = 1/);
});
