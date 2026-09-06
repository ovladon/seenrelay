import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPERIMENT_ID = 'PRIVATE314';
const MAX_CYCLES = 8;
const REGION = 'eu-central-1';
const SESSIONS_URL = 'https://api.browserbase.com/v1/sessions';
const OUTPUT_PATH = process.env.PRIVATE314_OUTPUT || 'private314-browserbase-session-create-diagnostic.json';

const ALLOWED_STATUSES = new Set([
  'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY',
  'DIAGNOSTIC_CREATE_FAILURE_OBSERVED',
  'DIAGNOSTIC_NO_CREATE_FAILURE_REPRODUCED',
  'DIAGNOSTIC_LIFECYCLE_NOT_REPRODUCED'
]);
const ALLOWED_FAILURE_CLASSES = new Set([
  'NONE','RATE_LIMIT_429','AUTH_401','PAYMENT_402','OTHER_4XX','SERVER_5XX','NETWORK_FAILURE'
]);

function privacyEnvelope() {
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

function baseReport(status = 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY') {
  return {
    schema: 'seenrelay-private314-browserbase-session-create-diagnostic-v1',
    experiment_id: EXPERIMENT_ID,
    status,
    diagnostic_performed: status !== 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY',
    measurement_performed: false,
    attempted_create_count: 0,
    successful_create_count: 0,
    cdp_connect_success_count: 0,
    release_attempt_count: 0,
    first_create_failure_http_status: null,
    first_create_failure_class: 'NONE',
    retry_after_present: null,
    retry_after_seconds: null,
    rate_limit_remaining: null,
    privacy: privacyEnvelope()
  };
}

function parseNonNegativeInt(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function classifyCreateFailure(status, retryAfterValue = null, rateLimitRemainingValue = null) {
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new TypeError('HTTP status invalid');
  let failureClass;
  if (status === 429) failureClass = 'RATE_LIMIT_429';
  else if (status === 401) failureClass = 'AUTH_401';
  else if (status === 402) failureClass = 'PAYMENT_402';
  else if (status >= 400 && status <= 499) failureClass = 'OTHER_4XX';
  else if (status >= 500) failureClass = 'SERVER_5XX';
  else throw new TypeError('failure classifier requires non-success HTTP status');
  const retryAfterPresent = typeof retryAfterValue === 'string' && retryAfterValue.length > 0;
  return {
    failureClass,
    retryAfterPresent,
    retryAfterSeconds: retryAfterPresent ? parseNonNegativeInt(retryAfterValue) : null,
    rateLimitRemaining: parseNonNegativeInt(rateLimitRemainingValue)
  };
}

export function validateAggregateReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('report must be object');
  const expected = [
    'schema','experiment_id','status','diagnostic_performed','measurement_performed','attempted_create_count',
    'successful_create_count','cdp_connect_success_count','release_attempt_count','first_create_failure_http_status',
    'first_create_failure_class','retry_after_present','retry_after_seconds','rate_limit_remaining','privacy'
  ].sort();
  const actual = Object.keys(report).sort();
  if (actual.length !== expected.length || expected.some((k, i) => actual[i] !== k)) throw new TypeError('aggregate report keys changed');
  if (report.schema !== 'seenrelay-private314-browserbase-session-create-diagnostic-v1' || report.experiment_id !== EXPERIMENT_ID) throw new TypeError('identity mismatch');
  if (!ALLOWED_STATUSES.has(report.status) || !ALLOWED_FAILURE_CLASSES.has(report.first_create_failure_class)) throw new TypeError('status/class invalid');
  if (report.measurement_performed !== false || typeof report.diagnostic_performed !== 'boolean') throw new TypeError('diagnostic flags invalid');
  for (const key of ['attempted_create_count','successful_create_count','cdp_connect_success_count','release_attempt_count']) {
    if (!Number.isInteger(report[key]) || report[key] < 0 || report[key] > MAX_CYCLES) throw new TypeError(`${key} invalid`);
  }
  if (report.successful_create_count > report.attempted_create_count || report.cdp_connect_success_count > report.successful_create_count || report.release_attempt_count > report.successful_create_count) throw new TypeError('counter ordering invalid');
  if (report.first_create_failure_http_status !== null && (!Number.isInteger(report.first_create_failure_http_status) || report.first_create_failure_http_status < 100 || report.first_create_failure_http_status > 599)) throw new TypeError('failure status invalid');
  if (report.retry_after_present !== null && typeof report.retry_after_present !== 'boolean') throw new TypeError('retry_after_present invalid');
  for (const key of ['retry_after_seconds','rate_limit_remaining']) {
    if (report[key] !== null && (!Number.isInteger(report[key]) || report[key] < 0)) throw new TypeError(`${key} invalid`);
  }
  if (!report.privacy || report.privacy.aggregate_only !== true) throw new TypeError('privacy contract mismatch');
  for (const key of ['browserbase_api_key_retained','session_identifiers_retained','project_identifiers_retained','connect_urls_retained','provider_response_body_retained','request_headers_retained','screenshots_retained','render_digests_retained','page_source_retained']) {
    if (report.privacy[key] !== false) throw new TypeError(`privacy.${key} must be false`);
  }
  if (report.status === 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY') {
    if (report.diagnostic_performed !== false || report.attempted_create_count !== 0 || report.first_create_failure_class !== 'NONE') throw new TypeError('blocked report inconsistent');
  }
  if (report.status === 'DIAGNOSTIC_CREATE_FAILURE_OBSERVED') {
    if (report.first_create_failure_http_status === null || report.first_create_failure_class === 'NONE') throw new TypeError('failure report missing failure');
  }
  if (report.status === 'DIAGNOSTIC_NO_CREATE_FAILURE_REPRODUCED') {
    if (report.attempted_create_count !== MAX_CYCLES || report.successful_create_count !== MAX_CYCLES || report.first_create_failure_http_status !== null || report.first_create_failure_class !== 'NONE') throw new TypeError('no-failure report inconsistent');
  }
  return true;
}

async function requestRelease(apiKey, sessionId, projectId) {
  if (!sessionId || !projectId) return false;
  try {
    await fetch(`${SESSIONS_URL}/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bb-api-key': apiKey },
      body: JSON.stringify({ status: 'REQUEST_RELEASE', projectId }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    // Best-effort cleanup; the attempt itself is counted.
  }
  return true;
}

async function writeReport(report) {
  validateAggregateReport(report);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

export async function runPrivate314() {
  const apiKey = String(process.env.BROWSERBASE_API_KEY || '').trim();
  if (!apiKey) return writeReport(baseReport());
  const report = baseReport('DIAGNOSTIC_NO_CREATE_FAILURE_REPRODUCED');
  report.diagnostic_performed = true;
  const { chromium } = await import('playwright-core');

  for (let i = 0; i < MAX_CYCLES; i++) {
    report.attempted_create_count++;
    let response;
    try {
      response = await fetch(SESSIONS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bb-api-key': apiKey },
        body: JSON.stringify({
          region: REGION,
          userMetadata: { experiment: EXPERIMENT_ID, workload: 'session-create-diagnostic-v1' }
        }),
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      report.status = 'DIAGNOSTIC_CREATE_FAILURE_OBSERVED';
      report.first_create_failure_class = 'NETWORK_FAILURE';
      return writeReport(report);
    }

    if (!response.ok) {
      const c = classifyCreateFailure(response.status, response.headers.get('retry-after'), response.headers.get('x-ratelimit-remaining'));
      report.status = 'DIAGNOSTIC_CREATE_FAILURE_OBSERVED';
      report.first_create_failure_http_status = response.status;
      report.first_create_failure_class = c.failureClass;
      report.retry_after_present = c.retryAfterPresent;
      report.retry_after_seconds = c.retryAfterSeconds;
      report.rate_limit_remaining = c.rateLimitRemaining;
      return writeReport(report);
    }

    let session;
    try { session = await response.json(); } catch { session = null; }
    if (!session || typeof session.id !== 'string' || typeof session.projectId !== 'string' || typeof session.connectUrl !== 'string' || !session.connectUrl.startsWith('ws')) {
      report.status = 'DIAGNOSTIC_LIFECYCLE_NOT_REPRODUCED';
      return writeReport(report);
    }
    report.successful_create_count++;
    const sessionId = session.id;
    const projectId = session.projectId;
    const connectUrl = session.connectUrl;
    session = null;

    let browser = null;
    try {
      browser = await chromium.connectOverCDP(connectUrl, { timeout: 30_000 });
      report.cdp_connect_success_count++;
    } catch {
      report.status = 'DIAGNOSTIC_LIFECYCLE_NOT_REPRODUCED';
      if (await requestRelease(apiKey, sessionId, projectId)) report.release_attempt_count++;
      return writeReport(report);
    }
    try { await browser.close(); } catch {}
    browser = null;
    if (await requestRelease(apiKey, sessionId, projectId)) report.release_attempt_count++;
  }

  return writeReport(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrivate314().then((report) => {
    process.stdout.write(`${JSON.stringify({ status: report.status, first_create_failure_class: report.first_create_failure_class, measurement_performed: false })}\n`);
  }).catch(() => { process.exitCode = 1; });
}
