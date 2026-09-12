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
  assert.ok(browserRows.every((line) => !line.includes('`COLLECT`')));
  assert.ok(browserRows.some((line) => line.includes('`REJECT_BEFORE_COLLECTION`')));
  assert.ok(browserRows.some((line) => line.includes('`INSUFFICIENT_EVIDENCE`')));
  assert.match(prescreen, /No `browser_extraction_reads` candidate in this pre-screen currently survives/);
  assert.match(prescreen, /no admitted browser collection candidate/i);
  assert.match(prescreen, /do not .*manufacture repeated URLs/i);
});

test('browser negative controls keep local and provider-native winners visible', () => {
  const browserRows = rowsFor('browser_extraction_reads');
  const groktocrawl = browserRows.find((line) => line.includes('groktocrawl'));
  assert.ok(groktocrawl);
  assert.match(groktocrawl, /`INSUFFICIENT_EVIDENCE`/);
  assert.match(groktocrawl, /Valkey/);
  assert.match(groktocrawl, /groktocrawl#100/);
  assert.match(groktocrawl, /force_browser=True/);
  assert.match(groktocrawl, /skips the cache/);
  assert.match(groktocrawl, /exact URLs across independent callers/);
  assert.match(prescreen, /simpler local fix/);

  assert.ok(browserRows.some((line) => line.includes('changedetection') && line.includes('`INSUFFICIENT_EVIDENCE`')));
  assert.ok(browserRows.some((line) => line.includes('Huginn') && line.includes('`INSUFFICIENT_EVIDENCE`')));
  assert.match(prescreen, /Firecrawl.*provider-native indexed-content reuse/s);
  assert.match(prescreen, /`maxAge: 0`/);
  assert.match(prescreen, /Reopen it only when new evidence identifies a deployed workload/);
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