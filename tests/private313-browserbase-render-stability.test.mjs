import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blockedReport, classifyMeasurement, retryDelayMs, validateAggregateReport } from '../scripts/private313-browserbase-render-stability.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function input(overrides = {}) {
  return {
    digests: Array(20).fill(A),
    browserVersions: Array(20).fill('Chrome/140.0.0.0'),
    completedCaptures: 20,
    sessionsCreated: 20,
    sessionReleaseAttempts: 20,
    deploymentBeforeMatchesRequired: true,
    deploymentAfterMatchesRequired: true,
    resourceHashesChanged: false,
    ...overrides
  };
}

test('blocked report carries no stability result', () => {
  const report = blockedReport();
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.measurement_performed, false);
  assert.equal(report.decision, 'NO_STABILITY_VERDICT');
  assert.equal(report.unique_exact_render_digests, null);
});

test('20 of 20 identical exact PNG digests is the only pass', () => {
  const report = classifyMeasurement(input());
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.status, 'MEASURED');
  assert.equal(report.decision, 'EXACT_RENDER_STABLE_CANDIDATE_V2');
  assert.equal(report.modal_digest_count, 20);
  assert.equal(report.unique_exact_render_digests, 1);
  assert.equal(report.exact_modal_recurrence_percent, 100);
});

test('one admissible exact mismatch kills v2', () => {
  const digests = Array(20).fill(A);
  digests[19] = B;
  const report = classifyMeasurement(input({ digests }));
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.status, 'MEASURED');
  assert.equal(report.decision, 'KILL_EXACT_VISUAL_DIGEST_V2');
  assert.equal(report.modal_digest_count, 19);
  assert.equal(report.unique_exact_render_digests, 2);
});

test('deployment mismatch invalidates run without digest aggregates', () => {
  const report = classifyMeasurement(input({ deploymentAfterMatchesRequired: false }));
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.status, 'INADMISSIBLE_DEPLOYMENT_CHANGED');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.unique_exact_render_digests, null);
  assert.equal(report.modal_digest_count, null);
});

test('resource byte change invalidates run without digest aggregates', () => {
  const report = classifyMeasurement(input({ resourceHashesChanged: true }));
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.status, 'INADMISSIBLE_SOURCE_CHANGED_DURING_RUN');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.unique_exact_render_digests, null);
});

test('provider browser version change invalidates run without digest aggregates', () => {
  const versions = Array(20).fill('Chrome/140.0.0.0');
  versions[19] = 'Chrome/141.0.0.0';
  const report = classifyMeasurement(input({ browserVersions: versions }));
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.status, 'INADMISSIBLE_PROVIDER_ENVIRONMENT_CHANGED');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.browser_version_count, 2);
  assert.equal(report.unique_exact_render_digests, null);
});

test('partial provider run exposes no partial stability result', () => {
  const report = classifyMeasurement(input({
    digests: Array(19).fill(A),
    browserVersions: Array(19).fill('Chrome/140.0.0.0'),
    completedCaptures: 19,
    sessionsCreated: 19,
    sessionReleaseAttempts: 19
  }));
  assert.equal(validateAggregateReport(report), true);
  assert.equal(report.status, 'INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE');
  assert.equal(report.measurement_performed, false);
  assert.equal(report.unique_exact_render_digests, null);
  assert.equal(report.exact_modal_recurrence_percent, null);
});

test('PRIVATE315 integer Retry-After uses frozen clamp', () => {
  assert.equal(retryDelayMs(0, '48'), 48_000);
  assert.equal(retryDelayMs(0, '0'), 1_000);
  assert.equal(retryDelayMs(0, '91'), 60_000);
});

test('PRIVATE315 unparseable Retry-After uses frozen exponential fallback', () => {
  assert.equal(retryDelayMs(0, 'not-a-number'), 2_000);
  assert.equal(retryDelayMs(1, null), 4_000);
  assert.equal(retryDelayMs(2, ''), 8_000);
  assert.equal(retryDelayMs(3, undefined), 16_000);
  assert.equal(retryDelayMs(4, 'Wed, 21 Oct 2026 07:28:00 GMT'), 32_000);
});

test('aggregate report does not retain synthetic secret values', () => {
  const syntheticSecret = 'bb_private313_synthetic_secret_value';
  const encoded = JSON.stringify(blockedReport());
  assert.equal(encoded.includes(syntheticSecret), false);
});

test('harness freezes render contract and PRIVATE315 retries only 429 at max five retries', () => {
  const source = fs.readFileSync(new URL('../scripts/private313-browserbase-render-stability.mjs', import.meta.url), 'utf8');
  assert.match(source, /TARGET_SELECTOR = '\.rv-mechanism'/);
  assert.match(source, /REQUIRED_CAPTURES = 20/);
  assert.match(source, /REQUIRED_DEPLOYMENT_SHA = '2cc216207044f55b27aced00aa0baa5af738ba62'/);
  assert.match(source, /createAttempt <= 5/);
  assert.match(source, /response\.status !== 429 \|\| createAttempt === 5/);
  assert.match(source, /response\.headers\.get\('retry-after'\)/);
  assert.doesNotMatch(source, /\/v1\/check|\/v1\/observe/i);
  assert.doesNotMatch(source, /pixelmatch|perceptual|pHash|embedding|cosine|levenshtein/i);
});
