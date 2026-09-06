import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blockedReport, validateAggregateReport } from '../scripts/private312-browserbase-provider-diagnostic.mjs';

function privacy() {
  return {
    browserbase_api_key_retained: false,
    project_ids_or_names_retained: false,
    session_ids_retained: false,
    connect_urls_retained: false,
    provider_response_body_retained: false,
    screenshots_retained: false,
    render_digests_retained: false,
    page_source_retained: false,
    request_headers_retained: false,
    aggregate_only: true
  };
}

function report(overrides = {}) {
  return {
    schema: 'seenrelay-private312-browserbase-provider-diagnostic-v1',
    experiment_id: 'PRIVATE312',
    status: 'SESSION_CREATE_REJECTED',
    diagnostic_performed: true,
    measurement_performed: false,
    highest_stage: 'SESSION_CREATE_RESPONSE',
    projects_http_status: 200,
    project_count: 1,
    session_create_http_status: 400,
    create_error_mentions_project_id: true,
    target_navigation_http_status: null,
    selector_count: null,
    screenshot_succeeded: false,
    session_release_attempted: false,
    privacy: privacy(),
    ...overrides
  };
}

test('blocked report carries no diagnostic or measurement result', () => {
  const r = blockedReport();
  assert.equal(validateAggregateReport(r), true);
  assert.equal(r.diagnostic_performed, false);
  assert.equal(r.measurement_performed, false);
  assert.equal(r.highest_stage, 'NONE');
});

test('project-id create rejection is representable without retaining secret values', () => {
  const r = report();
  assert.equal(validateAggregateReport(r), true);
  const syntheticApiKey = 'bb_test_private312_secret_sentinel';
  const syntheticProjectId = 'proj_private312_secret_sentinel';
  const syntheticSessionId = 'sess_private312_secret_sentinel';
  const syntheticConnectUrl = 'wss://private312-secret-sentinel.invalid';
  const encoded = JSON.stringify(r);
  for (const sentinel of [syntheticApiKey, syntheticProjectId, syntheticSessionId, syntheticConnectUrl]) {
    assert.equal(encoded.includes(sentinel), false);
  }
});

test('all-stages success remains diagnostic-only', () => {
  const r = report({
    status: 'DIAGNOSTIC_ALL_STAGES_SUCCEEDED',
    highest_stage: 'SCREENSHOT_SUCCEEDED',
    session_create_http_status: 201,
    create_error_mentions_project_id: null,
    target_navigation_http_status: 200,
    selector_count: 1,
    screenshot_succeeded: true,
    session_release_attempted: true
  });
  assert.equal(validateAggregateReport(r), true);
  assert.equal(r.measurement_performed, false);
});

test('diagnostic harness contains no SeenRelay operation and no render digest computation', () => {
  const source = fs.readFileSync(new URL('../scripts/private312-browserbase-provider-diagnostic.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/v1\/check|\/v1\/observe/i);
  assert.doesNotMatch(source, /createHash|sha256|digest\s*\(/i);
  assert.match(source, /do not|Cleanup is best-effort/i);
});
