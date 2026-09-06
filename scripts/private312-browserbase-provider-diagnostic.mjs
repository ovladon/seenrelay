import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPERIMENT_ID = 'PRIVATE312';
const OUTPUT_PATH = process.env.PRIVATE312_OUTPUT || 'private312-browserbase-provider-diagnostic.json';
const PROJECTS_URL = 'https://api.browserbase.com/v1/projects';
const SESSIONS_URL = 'https://api.browserbase.com/v1/sessions';
const TARGET_URL = 'https://seenrelay.com/';
const TARGET_SELECTOR = '.hero-shell';
const REGION = 'eu-central-1';

const ALLOWED_STATUSES = new Set([
  'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY',
  'PROJECTS_REQUEST_FAILED',
  'PROJECTS_AUTH_OR_API_REJECTED',
  'PROJECTS_RESPONSE_INVALID',
  'SESSION_CREATE_REQUEST_FAILED',
  'SESSION_CREATE_REJECTED',
  'SESSION_CREATE_RESPONSE_INVALID',
  'CDP_CONNECT_FAILED',
  'NAVIGATION_FAILED',
  'SELECTOR_INVALID',
  'SCREENSHOT_FAILED',
  'DIAGNOSTIC_ALL_STAGES_SUCCEEDED'
]);

const ALLOWED_STAGES = new Set([
  'NONE',
  'PROJECTS_RESPONSE',
  'PROJECTS_PARSED',
  'SESSION_CREATE_RESPONSE',
  'SESSION_CREATED',
  'CDP_CONNECTED',
  'NAVIGATED',
  'SELECTOR_VALID',
  'SCREENSHOT_SUCCEEDED'
]);

function privacyEnvelope() {
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

function baseReport(status = 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY') {
  return {
    schema: 'seenrelay-private312-browserbase-provider-diagnostic-v1',
    experiment_id: EXPERIMENT_ID,
    status,
    diagnostic_performed: status !== 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY',
    measurement_performed: false,
    highest_stage: 'NONE',
    projects_http_status: null,
    project_count: null,
    session_create_http_status: null,
    create_error_mentions_project_id: null,
    target_navigation_http_status: null,
    selector_count: null,
    screenshot_succeeded: false,
    session_release_attempted: false,
    privacy: privacyEnvelope()
  };
}

export function blockedReport() {
  return Object.freeze(baseReport());
}

export function validateAggregateReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('report must be object');
  const expectedKeys = [
    'schema','experiment_id','status','diagnostic_performed','measurement_performed','highest_stage',
    'projects_http_status','project_count','session_create_http_status','create_error_mentions_project_id',
    'target_navigation_http_status','selector_count','screenshot_succeeded','session_release_attempted','privacy'
  ].sort();
  const actualKeys = Object.keys(report).sort();
  if (actualKeys.length !== expectedKeys.length || expectedKeys.some((k, i) => actualKeys[i] !== k)) throw new TypeError('aggregate report keys changed');
  if (report.schema !== 'seenrelay-private312-browserbase-provider-diagnostic-v1' || report.experiment_id !== EXPERIMENT_ID) throw new TypeError('diagnostic identity mismatch');
  if (!ALLOWED_STATUSES.has(report.status)) throw new TypeError('unexpected status');
  if (!ALLOWED_STAGES.has(report.highest_stage)) throw new TypeError('unexpected stage');
  if (report.measurement_performed !== false) throw new TypeError('PRIVATE312 must never perform stability measurement');
  if (typeof report.diagnostic_performed !== 'boolean' || typeof report.screenshot_succeeded !== 'boolean' || typeof report.session_release_attempted !== 'boolean') throw new TypeError('boolean field invalid');
  for (const key of ['projects_http_status','project_count','session_create_http_status','target_navigation_http_status','selector_count']) {
    if (report[key] !== null && (!Number.isInteger(report[key]) || report[key] < 0)) throw new TypeError(`${key} invalid`);
  }
  if (report.create_error_mentions_project_id !== null && typeof report.create_error_mentions_project_id !== 'boolean') throw new TypeError('create_error_mentions_project_id invalid');
  if (!report.privacy || report.privacy.aggregate_only !== true) throw new TypeError('privacy contract mismatch');
  for (const key of ['browserbase_api_key_retained','project_ids_or_names_retained','session_ids_retained','connect_urls_retained','provider_response_body_retained','screenshots_retained','render_digests_retained','page_source_retained','request_headers_retained']) {
    if (report.privacy[key] !== false) throw new TypeError(`privacy.${key} must be false`);
  }
  if (report.status === 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY' && (report.diagnostic_performed !== false || report.highest_stage !== 'NONE')) throw new TypeError('blocked report inconsistent');
  if (report.status === 'DIAGNOSTIC_ALL_STAGES_SUCCEEDED' && (report.highest_stage !== 'SCREENSHOT_SUCCEEDED' || report.screenshot_succeeded !== true || report.selector_count !== 1)) throw new TypeError('success report inconsistent');
  return true;
}

async function writeReport(report) {
  validateAggregateReport(report);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
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
    // Cleanup is best-effort and never changes the diagnostic classification.
  }
  return true;
}

export async function runPrivate312() {
  const apiKey = String(process.env.BROWSERBASE_API_KEY || '').trim();
  if (!apiKey) return writeReport(blockedReport());

  const report = baseReport('PROJECTS_REQUEST_FAILED');
  report.diagnostic_performed = true;
  let sessionId = null;
  let sessionProjectId = null;
  let browser = null;

  const finish = async () => {
    if (browser) {
      try { await browser.close(); } catch {}
      browser = null;
    }
    if (sessionId && sessionProjectId) report.session_release_attempted = await requestRelease(apiKey, sessionId, sessionProjectId);
    return writeReport(report);
  };

  let projectsResponse;
  try {
    projectsResponse = await fetch(PROJECTS_URL, {
      headers: { 'x-bb-api-key': apiKey },
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    report.status = 'PROJECTS_REQUEST_FAILED';
    return finish();
  }
  report.projects_http_status = projectsResponse.status;
  report.highest_stage = 'PROJECTS_RESPONSE';
  if (!projectsResponse.ok) {
    report.status = 'PROJECTS_AUTH_OR_API_REJECTED';
    return finish();
  }

  let projects;
  try { projects = await projectsResponse.json(); } catch { projects = null; }
  if (!Array.isArray(projects)) {
    report.status = 'PROJECTS_RESPONSE_INVALID';
    return finish();
  }
  report.project_count = projects.length;
  report.highest_stage = 'PROJECTS_PARSED';

  let createResponse;
  try {
    createResponse = await fetch(SESSIONS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bb-api-key': apiKey },
      body: JSON.stringify({
        region: REGION,
        userMetadata: { experiment: 'PRIVATE311', workload: 'rendered-state-stability-v1' }
      }),
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    report.status = 'SESSION_CREATE_REQUEST_FAILED';
    return finish();
  }

  report.session_create_http_status = createResponse.status;
  report.highest_stage = 'SESSION_CREATE_RESPONSE';
  if (!createResponse.ok) {
    let errorText = '';
    try { errorText = await createResponse.text(); } catch {}
    report.create_error_mentions_project_id = /project\s*_?\s*id|projectId/i.test(errorText);
    errorText = '';
    report.status = 'SESSION_CREATE_REJECTED';
    return finish();
  }

  let session;
  try { session = await createResponse.json(); } catch { session = null; }
  if (!session || typeof session.id !== 'string' || typeof session.projectId !== 'string' || typeof session.connectUrl !== 'string' || !session.connectUrl.startsWith('ws')) {
    report.status = 'SESSION_CREATE_RESPONSE_INVALID';
    return finish();
  }
  sessionId = session.id;
  sessionProjectId = session.projectId;
  const connectUrl = session.connectUrl;
  session = null;
  report.highest_stage = 'SESSION_CREATED';

  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
    browser = await chromium.connectOverCDP(connectUrl, { timeout: 30_000 });
  } catch {
    report.status = 'CDP_CONNECT_FAILED';
    return finish();
  }
  report.highest_stage = 'CDP_CONNECTED';

  const context = browser.contexts()[0];
  const page = context?.pages()[0] || (context ? await context.newPage() : null);
  if (!page) {
    report.status = 'NAVIGATION_FAILED';
    return finish();
  }

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    const navigation = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    report.target_navigation_http_status = navigation?.status() ?? null;
    if (!navigation || !navigation.ok()) {
      report.status = 'NAVIGATION_FAILED';
      return finish();
    }
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
    await page.waitForTimeout(500);
  } catch {
    report.status = 'NAVIGATION_FAILED';
    return finish();
  }
  report.highest_stage = 'NAVIGATED';

  let locator;
  try {
    locator = page.locator(TARGET_SELECTOR);
    report.selector_count = await locator.count();
  } catch {
    report.status = 'SELECTOR_INVALID';
    return finish();
  }
  if (report.selector_count !== 1) {
    report.status = 'SELECTOR_INVALID';
    return finish();
  }
  report.highest_stage = 'SELECTOR_VALID';

  try {
    let screenshot = await locator.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', scale: 'css', timeout: 20_000 });
    if (!Buffer.isBuffer(screenshot) || screenshot.length === 0) throw new Error('empty screenshot');
    screenshot = null;
  } catch {
    report.status = 'SCREENSHOT_FAILED';
    return finish();
  }
  report.screenshot_succeeded = true;
  report.highest_stage = 'SCREENSHOT_SUCCEEDED';
  report.status = 'DIAGNOSTIC_ALL_STAGES_SUCCEEDED';
  return finish();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrivate312().then((report) => {
    process.stdout.write(`${JSON.stringify({ status: report.status, highest_stage: report.highest_stage, measurement_performed: report.measurement_performed })}\n`);
  }).catch(() => { process.exitCode = 1; });
}
