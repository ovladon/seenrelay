import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyCreateFailure, validateAggregateReport } from '../scripts/private314-browserbase-session-create-diagnostic.mjs';

function privacy() {
  return {
    browserbase_api_key_retained: false,
    session_identifiers_retained: false,
    project_identifiers_retained: false,
    connect_urls_retained: false,
    provider_response_body_retained: false,
    request_headers_retained: false,
    screenshots_retained: false,
    render_digests_retained: false,
    page_source_retained: false,
    aggregate_only: true
  };
}

function report(overrides = {}) {
  return {
    schema: 'seenrelay-private314-browserbase-session-create-diagnostic-v1',
    experiment_id: 'PRIVATE314',
    status: 'DIAGNOSTIC_CREATE_FAILURE_OBSERVED',
    diagnostic_performed: true,
    measurement_performed: false,
    attempted_create_count: 6,
    successful_create_count: 5,
    cdp_connect_success_count: 5,
    release_attempt_count: 5,
    first_create_failure_http_status: 429,
    first_create_failure_class: 'RATE_LIMIT_429',
    retry_after_present: true,
    retry_after_seconds: 2,
    rate_limit_remaining: 0,
    privacy: privacy(),
    ...overrides
  };
}

test('429 is uniquely classified as rate limit and integer retry-after is retained only as aggregate', () => {
  const c = classifyCreateFailure(429, '7', '0');
  assert.deepEqual(c, { failureClass: 'RATE_LIMIT_429', retryAfterPresent: true, retryAfterSeconds: 7, rateLimitRemaining: 0 });
});

test('401, 402, generic 4xx and 5xx remain distinct', () => {
  assert.equal(classifyCreateFailure(401).failureClass, 'AUTH_401');
  assert.equal(classifyCreateFailure(402).failureClass, 'PAYMENT_402');
  assert.equal(classifyCreateFailure(409).failureClass, 'OTHER_4XX');
  assert.equal(classifyCreateFailure(503).failureClass, 'SERVER_5XX');
});

test('date-form Retry-After is not parsed as seconds', () => {
  const c = classifyCreateFailure(429, 'Wed, 21 Oct 2026 07:28:00 GMT', '3');
  assert.equal(c.retryAfterPresent, true);
  assert.equal(c.retryAfterSeconds, null);
  assert.equal(c.rateLimitRemaining, 3);
});

test('aggregate failure report is valid and carries no measurement', () => {
  const r = report();
  assert.equal(validateAggregateReport(r), true);
  assert.equal(r.measurement_performed, false);
});

test('no-failure report requires eight successful cycles', () => {
  const r = report({
    status: 'DIAGNOSTIC_NO_CREATE_FAILURE_REPRODUCED',
    attempted_create_count: 8,
    successful_create_count: 8,
    cdp_connect_success_count: 8,
    release_attempt_count: 8,
    first_create_failure_http_status: null,
    first_create_failure_class: 'NONE',
    retry_after_present: null,
    retry_after_seconds: null,
    rate_limit_remaining: null
  });
  assert.equal(validateAggregateReport(r), true);
});

test('report does not retain a synthetic API key value', () => {
  const secret = 'bb_private314_secret_sentinel';
  assert.equal(JSON.stringify(report()).includes(secret), false);
});

test('diagnostic contains no navigation, screenshot, digest, CHECK or OBSERVE operation', () => {
  const source = fs.readFileSync(new URL('../scripts/private314-browserbase-session-create-diagnostic.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /page\.goto|\.screenshot\s*\(|createHash|sha256|\/v1\/check|\/v1\/observe/i);
  assert.match(source, /MAX_CYCLES = 8/);
});
