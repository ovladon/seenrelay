import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const prescreen = fs.readFileSync('docs/EXTERNAL_WORKLOAD_PRESCREEN.md', 'utf8');
const gate = fs.readFileSync('docs/NATURAL_WORKLOAD_GATE.md', 'utf8');

const candidateRows = prescreen
  .split('\n')
  .filter((line) => line.startsWith('| `') && !line.includes('Workload class'));

function rowsFor(workloadClass) {
  return candidateRows.filter((line) => line.startsWith(`| \`${workloadClass}\``));
}

test('external workload prescreen is explicitly non-evidence and linked from the gate', () => {
  assert.match(prescreen, /not benchmark evidence/i);
  assert.match(prescreen, /Static repository inspection never counts toward that floor/);
  assert.match(prescreen, /at least 100 protected calls/);
  assert.match(gate, /EXTERNAL_WORKLOAD_PRESCREEN\.md/);
  assert.match(gate, /pre-screen is not benchmark evidence/i);
});

test('prescreen retains every methodological class without manufacturing a complete gate', () => {
  assert.ok(rowsFor('structured_source_reads').length > 0);
  assert.ok(rowsFor('browser_extraction_reads').length > 0);
  assert.ok(rowsFor('fleet_tool_validations').length > 0);

  const browserRows = rowsFor('browser_extraction_reads');
  assert.ok(browserRows.every((line) => line.includes('`REJECT_BEFORE_COLLECTION`')));
  assert.match(prescreen, /No `browser_extraction_reads` candidate in this pre-screen currently survives/);
  assert.match(prescreen, /do not .*manufacture repeated URLs/i);
});

test('collect candidates freeze best-native controls and falsification criteria first', () => {
  const collectRows = candidateRows.filter((line) => line.includes('`COLLECT`'));
  assert.ok(collectRows.some((line) => line.includes('Agnix')));
  assert.ok(collectRows.some((line) => line.includes('Klangschalen')));

  assert.match(prescreen, /ETag/);
  assert.match(prescreen, /If-None-Match/);
  assert.match(prescreen, /Kill criterion:/);
  assert.match(prescreen, /classify the completed workload `DO NOT USE`/);
  assert.match(prescreen, /do not count commissioning or collector-debug runs/i);
});
