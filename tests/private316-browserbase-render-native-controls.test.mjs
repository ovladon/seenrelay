import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyNativeControl, validateAggregateReport } from '../scripts/private316-browserbase-render-native-controls.mjs';

function privacy() {
  return {
    validator_values_retained: false,
    resource_hash_values_retained: false,
    resource_bodies_retained: false,
    headers_retained: false,
    cookies_retained: false,
    browserbase_identifiers_retained: false,
    seenrelay_identifiers_retained: false,
    aggregate_only: true
  };
}

function measured(overrides = {}) {
  return {
    schema: 'seenrelay-private316-browserbase-render-native-controls-v1',
    experiment_id: 'PRIVATE316',
    status: 'MEASURED',
    measurement_performed: true,
    resource_count: 4,
    round_count: 20,
    etag_resource_count: 4,
    last_modified_resource_count: 0,
    conditional_capable_resource_count: 4,
    conditional_request_count: 80,
    conditional_304_count: 80,
    fallback_full_get_count: 0,
    fallback_hash_match_count: 0,
    initial_total_resource_bytes: 12345,
    median_parallel_bundle_ms: 4.2,
    p95_parallel_bundle_ms: 8.9,
    deployment_before_matches_required: true,
    deployment_after_matches_required: true,
    resource_hashes_changed: false,
    decision: 'NATIVE_CONDITIONAL_SHORTCUT_STRONG',
    privacy: privacy(),
    ...overrides
  };
}

test('all 80 clean conditional validations classify strong', () => {
  assert.equal(classifyNativeControl({
    resourceCount: 4,
    rounds: 20,
    conditionalCapableResourceCount: 4,
    conditionalRequestCount: 80,
    conditional304Count: 80,
    fallbackFullGetCount: 0,
    fallbackHashMatchCount: 0,
    deploymentBeforeMatchesRequired: true,
    deploymentAfterMatchesRequired: true,
    resourceHashesChanged: false
  }), 'NATIVE_CONDITIONAL_SHORTCUT_STRONG');
});

test('clean fallback hash path is retained as a competing native shortcut', () => {
  assert.equal(classifyNativeControl({
    resourceCount: 4,
    rounds: 20,
    conditionalCapableResourceCount: 3,
    conditionalRequestCount: 60,
    conditional304Count: 60,
    fallbackFullGetCount: 20,
    fallbackHashMatchCount: 20,
    deploymentBeforeMatchesRequired: true,
    deploymentAfterMatchesRequired: true,
    resourceHashesChanged: false
  }), 'NATIVE_FULL_HASH_SHORTCUT_PRESENT');
});

test('one failed validation fails closed', () => {
  assert.equal(classifyNativeControl({
    resourceCount: 4,
    rounds: 20,
    conditionalCapableResourceCount: 4,
    conditionalRequestCount: 80,
    conditional304Count: 79,
    fallbackFullGetCount: 0,
    fallbackHashMatchCount: 0,
    deploymentBeforeMatchesRequired: true,
    deploymentAfterMatchesRequired: true,
    resourceHashesChanged: false
  }), 'NATIVE_CONTROL_NOT_CLEAN');
});

test('deployment or resource change fails closed', () => {
  for (const variant of [
    { deploymentBeforeMatchesRequired: false, deploymentAfterMatchesRequired: true, resourceHashesChanged: false },
    { deploymentBeforeMatchesRequired: true, deploymentAfterMatchesRequired: false, resourceHashesChanged: false },
    { deploymentBeforeMatchesRequired: true, deploymentAfterMatchesRequired: true, resourceHashesChanged: true }
  ]) {
    assert.equal(classifyNativeControl({
      resourceCount: 4,
      rounds: 20,
      conditionalCapableResourceCount: 4,
      conditionalRequestCount: 80,
      conditional304Count: 80,
      fallbackFullGetCount: 0,
      fallbackHashMatchCount: 0,
      ...variant
    }), 'NATIVE_CONTROL_NOT_CLEAN');
  }
});

test('aggregate schema accepts measured strong result and contains no retained values', () => {
  const report = measured();
  assert.equal(validateAggregateReport(report), true);
  const encoded = JSON.stringify(report);
  for (const sentinel of ['synthetic-etag-secret', 'synthetic-resource-hash', 'synthetic-cookie']) {
    assert.equal(encoded.includes(sentinel), false);
  }
});

test('incomplete report cannot carry a positive native shortcut decision', () => {
  assert.throws(() => validateAggregateReport(measured({
    status: 'INCOMPLETE',
    measurement_performed: false,
    round_count: 7,
    decision: 'NATIVE_CONDITIONAL_SHORTCUT_STRONG'
  })));
});

test('harness contains no Browserbase session and no SeenRelay CHECK or OBSERVE', () => {
  const source = fs.readFileSync(new URL('../scripts/private316-browserbase-render-native-controls.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.browserbase\.com|connectOverCDP|\/v1\/check|\/v1\/observe/i);
  assert.match(source, /If-None-Match|if-none-match/i);
  assert.match(source, /If-Modified-Since|if-modified-since/i);
});
