import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mcp = fs.readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');

test('MCP advertises explicit cross-tool instructions without changing the two-operation boundary', () => {
  assert.match(mcp, /instructions:\s*'Use check_fact only before repeating a paid or slow read-only source-backed validation/);
  assert.match(mcp, /Never turn hearsay or another SeenRelay result into an independent OBSERVE/);
  assert.equal((mcp.match(/server\.registerTool\(/g) ?? []).length, 2);
  assert.match(mcp, /server\.registerTool\('check_fact'/);
  assert.match(mcp, /server\.registerTool\('observe_fact'/);
});

test('CHECK publishes a machine-readable decision output schema', () => {
  assert.match(mcp, /const CheckOutput = z\.object/);
  for (const status of ['SAME_OBSERVED', 'CHANGED_OBSERVED', 'CONTESTED', 'STALE', 'UNKNOWN']) {
    assert.match(mcp, new RegExp(`'${status}'`));
  }
  assert.match(mcp, /next_step:\s*z\.literal\('VALIDATE_THEN_OBSERVE'\)/);
  assert.match(mcp, /outputSchema:\s*CheckOutput/);
  assert.match(mcp, /Only SAME_OBSERVED can be considered for caller-policy-gated reuse/);
});

test('OBSERVE publishes accepted and deduplicated result semantics', () => {
  assert.match(mcp, /const ObserveOutput = z\.object/);
  assert.match(mcp, /accepted:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(mcp, /deduplicated:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(mcp, /future_check_eligible:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(mcp, /outputSchema:\s*ObserveOutput/);
  assert.match(mcp, /Never OBSERVE hearsay/);
});
