import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/external-static-prescreen.yml', 'utf8');
const gate = fs.readFileSync('docs/FLEET_OVERLAP_GATE.md', 'utf8');
const prescreen = fs.readFileSync('docs/EXTERNAL_WORKLOAD_PRESCREEN.md', 'utf8');

test('external static prescreen is manual, read-only and does not execute target code', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/g);
  assert.match(workflow, /seenrelay-cli\.mjs scan target --json/);
  assert.doesNotMatch(workflow, /npm install|pip install|pytest|target\/.*(?:\.sh|\.py|\.js)/);
});

test('fleet overlap evidence remains separate from temporal shared CHECK evidence', () => {
  assert.match(gate, /exact eligible in-flight duplication/i);
  assert.match(gate, /Shadow overlap is \*\*observed waste opportunity\*\*, not savings/i);
  assert.match(gate, /only actual follower reuse counts as an avoided execution/i);
  assert.match(gate, /LangGraph Cloud #7417/);
  assert.match(prescreen, /FLEET_OVERLAP_GATE\.md/);
  assert.match(prescreen, /Exact in-flight fleet-overlap leads/);
});
