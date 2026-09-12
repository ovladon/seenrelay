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
});

test('second browser search wave stays falsification-first and bounded', () => {
  const browserRows = rowsFor('browser_extraction_reads');
  const jobseek = browserRows.find((line) => line.includes('jobseek'));
  const lightcrawl = browserRows.find((line) => line.includes('LightCrawl'));

  assert.ok(jobseek);
  assert.match(jobseek, /`INSUFFICIENT_EVIDENCE`/);
  assert.match(jobseek, /cookies/);
  assert.match(jobseek, /persistent context/);
  assert.match(jobseek, /independent callers/);
  assert.match(prescreen, /former exact Chromium transport-capture program \(#8402\) was closed `not planned`/);
  assert.match(prescreen, /URL equality alone is not fact-identity equality/);

  assert.ok(lightcrawl);
  assert.match(lightcrawl, /`INSUFFICIENT_EVIDENCE`/);
  assert.match(lightcrawl, /Redis/);
  assert.match(lightcrawl, /URL plus scrape parameters/);
  assert.match(prescreen, /redundant AI-agent rescraping of the same pages/);
  assert.match(prescreen, /second wave therefore also stops with \*\*no admitted browser collection candidate\*\*/i);
  assert.match(prescreen, /bounded search is now closed rather than expanded indefinitely/i);
  assert.match(prescreen, /Reopen it only when new external evidence identifies a deployed workload/);
});

test('fleet candidates fail closed when the workload is private or locally content-addressable', () => {
  const fleetRows = rowsFor('fleet_tool_validations');
  assert.ok(fleetRows.every((line) => !line.includes('`COLLECT`')));
  assert.ok(fleetRows.some((line) => line.includes('Klangschalen') && line.includes('`INSUFFICIENT_EVIDENCE`')));
  assert.ok(fleetRows.some((line) => line.includes('Velnor Actions') && line.includes('`REJECT_BEFORE_COLLECTION`')));
  assert.match(prescreen, /no autonomous public `fleet_tool_validations` collection candidate/i);
  assert.match(prescreen, /full 45-repository workload is not publicly replayable/i);
  assert.match(prescreen, /commit-addressed local audit caching is already the stronger design/i);
});

test('the only admitted public collection path is Agnix and native controls run first', () => {
  const collectRows = candidateRows.filter((line) => line.includes('`COLLECT`'));
  assert.ok(collectRows.length > 0);
  assert.ok(collectRows.every((line) => line.includes('Agnix')));

  assert.match(prescreen, /scripts\/agnix-native-control-census\.mjs/);
  assert.match(prescreen, /agnix-native-control-census\.yml/);
  assert.match(prescreen, /does not emit `USE` \/ `DO NOT USE`/);
  assert.match(prescreen, /zero SeenRelay `CHECK`\/`OBSERVE` calls/);
  assert.match(prescreen, /first complete persistent run is commissioning only/i);
  assert.match(prescreen, /Do not seed the public relay/i);
  assert.match(prescreen, /ETag/);
  assert.match(prescreen, /If-None-Match/);
  assert.match(prescreen, /Kill criterion:/);
  assert.match(prescreen, /classify the completed workload `DO NOT USE`/);
  assert.match(prescreen, /Do not count commissioning or collector-debug runs/i);
});