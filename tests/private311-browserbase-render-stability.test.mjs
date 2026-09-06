import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blockedReport, classifyMeasurement, incompleteReport, validateAggregateReport } from '../scripts/private311-browserbase-render-stability.mjs';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const SOURCE = 'a'.repeat(64);
const SOURCE2 = 'b'.repeat(64);
const VERSION = 'Chrome/140.0.0.0';

function measuredInput({ digests = Array(20).fill(H1), versions = Array(20).fill(VERSION), htmlAfter = SOURCE, cssAfter = SOURCE } = {}) {
  return {
    digests,
    browserVersions: versions,
    completedCaptures: digests.length,
    sourceHtmlBefore: SOURCE,
    sourceHtmlAfter: htmlAfter,
    sourceCssBefore: SOURCE,
    sourceCssAfter: cssAfter
  };
}

test('blocked report is aggregate-only and carries no stability result', () => {
  const report = blockedReport();
  assert.equal(report.status, 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.decision, 'NO_STABILITY_VERDICT');
  assert.equal(report.unique_exact_render_digests, null);
  assert.equal(report.modal_digest_count, null);
  assert.equal(report.exact_modal_recurrence_percent, null);
  assert.equal(validateAggregateReport(report), true);
  const encoded = JSON.stringify(report);
  assert.doesNotMatch(encoded, /connectUrl|sessionId|x-bb-api-key/i);
});

test('20 of 20 identical exact render digests is the only pass', () => {
  const report = classifyMeasurement(measuredInput());
  assert.equal(report.status, 'MEASURED');
  assert.equal(report.measurement_performed, true);
  assert.equal(report.unique_exact_render_digests, 1);
  assert.equal(report.modal_digest_count, 20);
  assert.equal(report.exact_modal_recurrence_percent, 100);
  assert.equal(report.decision, 'EXACT_RENDER_STABLE_CANDIDATE');
  assert.equal(validateAggregateReport(report), true);
});

test('one exact render mismatch kills visual digest v1', () => {
  const digests = [...Array(19).fill(H1), H2];
  const report = classifyMeasurement(measuredInput({ digests }));
  assert.equal(report.status, 'MEASURED');
  assert.equal(report.unique_exact_render_digests, 2);
  assert.equal(report.modal_digest_count, 19);
  assert.equal(report.exact_modal_recurrence_percent, 95);
  assert.equal(report.decision, 'KILL_EXACT_VISUAL_DIGEST_V1');
  assert.equal(validateAggregateReport(report), true);
});

test('source change invalidates run without leaking render uniqueness', () => {
  const report = classifyMeasurement(measuredInput({ htmlAfter: SOURCE2 }));
  assert.equal(report.status, 'INADMISSIBLE_SOURCE_CHANGED_DURING_RUN');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.source_html_changed, true);
  assert.equal(report.unique_exact_render_digests, null);
  assert.equal(report.modal_digest_count, null);
  assert.equal(report.decision, 'NO_STABILITY_VERDICT');
  assert.equal(validateAggregateReport(report), true);
});

test('provider browser version change invalidates run without stability verdict', () => {
  const versions = [...Array(19).fill(VERSION), 'Chrome/141.0.0.0'];
  const report = classifyMeasurement(measuredInput({ versions }));
  assert.equal(report.status, 'INADMISSIBLE_PROVIDER_ENVIRONMENT_CHANGED');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.browser_version_count, 2);
  assert.equal(report.unique_exact_render_digests, null);
  assert.equal(report.decision, 'NO_STABILITY_VERDICT');
  assert.equal(validateAggregateReport(report), true);
});

test('partial provider run is incomplete and exposes no partial uniqueness result', () => {
  const report = incompleteReport(7);
  assert.equal(report.status, 'INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE');
  assert.equal(report.completed_captures, 7);
  assert.equal(report.unique_exact_render_digests, null);
  assert.equal(report.modal_digest_count, null);
  assert.equal(report.exact_modal_recurrence_percent, null);
  assert.equal(validateAggregateReport(report), true);
});

test('harness does not call SeenRelay CHECK or OBSERVE', () => {
  const script = fs.readFileSync(new URL('../scripts/private311-browserbase-render-stability.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /\/v1\/check/);
  assert.doesNotMatch(script, /\/v1\/observe/);
  assert.doesNotMatch(script, /SAME_OBSERVED|CHANGED_OBSERVED|CONTESTED/);
});
