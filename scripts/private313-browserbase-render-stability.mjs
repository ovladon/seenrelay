import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPERIMENT_ID = 'PRIVATE313';
const REQUIRED_CAPTURES = 20;
const REQUIRED_DEPLOYMENT_SHA = '2cc216207044f55b27aced00aa0baa5af738ba62';
const HEALTH_URL = 'https://seenrelay.com/healthz';
const TARGET_URL = 'https://seenrelay.com/';
const TARGET_SELECTOR = '.rv-mechanism';
const RESOURCE_URLS = Object.freeze([
  'https://seenrelay.com/',
  'https://seenrelay.com/revamp.css',
  'https://seenrelay.com/revamp-factual.css',
  'https://seenrelay.com/revamp.js'
]);
const REGION = 'eu-central-1';
const SESSIONS_URL = 'https://api.browserbase.com/v1/sessions';
const OUTPUT_PATH = process.env.PRIVATE313_OUTPUT || 'private313-browserbase-render-stability.json';

const REPORT_KEYS = Object.freeze([
  'schema','experiment_id','status','measurement_performed','completed_captures','required_captures',
  'sessions_created','session_release_attempts','failure_stage','selector_count_at_failure',
  'unique_exact_render_digests','modal_digest_count','exact_modal_recurrence_percent','browser_version_count',
  'deployment_before_matches_required','deployment_after_matches_required','resource_hashes_changed','decision','privacy'
]);

const ALLOWED_STATUSES = new Set([
  'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY',
  'INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE',
  'INCOMPLETE_SELECTOR_CONTRACT',
  'INADMISSIBLE_DEPLOYMENT_CHANGED',
  'INADMISSIBLE_SOURCE_CHANGED_DURING_RUN',
  'INADMISSIBLE_PROVIDER_ENVIRONMENT_CHANGED',
  'MEASURED'
]);

const ALLOWED_FAILURE_STAGES = new Set([
  'NONE','HEALTH_BEFORE','RESOURCE_HASH_BEFORE','SESSION_CREATE','CDP_CONNECT','NAVIGATION',
  'FONTS_READY','SELECTOR_CARDINALITY','SCREENSHOT','BROWSER_VERSION','HEALTH_AFTER','RESOURCE_HASH_AFTER'
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function privacyEnvelope() {
  return {
    screenshots_retained: false,
    individual_digest_values_retained: false,
    session_identifiers_retained: false,
    project_identifiers_retained: false,
    connect_urls_retained: false,
    browserbase_api_key_retained: false,
    raw_resource_bytes_retained: false,
    resource_hash_values_retained: false,
    browser_version_values_retained: false,
    page_source_retained: false,
    aggregate_only: true
  };
}

function baseReport(status = 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY', failureStage = 'NONE') {
  return {
    schema: 'seenrelay-private313-browserbase-rendered-state-stability-v2',
    experiment_id: EXPERIMENT_ID,
    status,
    measurement_performed: false,
    completed_captures: 0,
    required_captures: REQUIRED_CAPTURES,
    sessions_created: 0,
    session_release_attempts: 0,
    failure_stage: failureStage,
    selector_count_at_failure: null,
    unique_exact_render_digests: null,
    modal_digest_count: null,
    exact_modal_recurrence_percent: null,
    browser_version_count: null,
    deployment_before_matches_required: null,
    deployment_after_matches_required: null,
    resource_hashes_changed: null,
    decision: 'NO_STABILITY_VERDICT',
    privacy: privacyEnvelope()
  };
}

export function blockedReport() {
  return Object.freeze(baseReport());
}

function nonMeasuredReport(status, failureStage, completedCaptures, extras = {}) {
  const report = baseReport(status, failureStage);
  report.completed_captures = completedCaptures;
  Object.assign(report, extras);
  return Object.freeze(report);
}

function validateMeasurementInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('measurement input must be object');
  if (!Array.isArray(input.digests) || !Array.isArray(input.browserVersions)) throw new TypeError('digests and browserVersions must be arrays');
  if (!Number.isInteger(input.completedCaptures) || input.completedCaptures < 0 || input.completedCaptures > REQUIRED_CAPTURES) throw new TypeError('completedCaptures invalid');
  if (!Number.isInteger(input.sessionsCreated) || input.sessionsCreated < 0) throw new TypeError('sessionsCreated invalid');
  if (!Number.isInteger(input.sessionReleaseAttempts) || input.sessionReleaseAttempts < 0) throw new TypeError('sessionReleaseAttempts invalid');
  for (const digest of input.digests) if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new TypeError('digest invalid');
  for (const version of input.browserVersions) if (typeof version !== 'string' || !version.trim()) throw new TypeError('browser version invalid');
  if (typeof input.deploymentBeforeMatchesRequired !== 'boolean' || typeof input.deploymentAfterMatchesRequired !== 'boolean') throw new TypeError('deployment flags invalid');
  if (typeof input.resourceHashesChanged !== 'boolean') throw new TypeError('resource hash flag invalid');
}

export function classifyMeasurement(input) {
  validateMeasurementInput(input);
  const common = {
    sessions_created: input.sessionsCreated,
    session_release_attempts: input.sessionReleaseAttempts,
    deployment_before_matches_required: input.deploymentBeforeMatchesRequired,
    deployment_after_matches_required: input.deploymentAfterMatchesRequired,
    resource_hashes_changed: input.resourceHashesChanged
  };

  if (!input.deploymentBeforeMatchesRequired || !input.deploymentAfterMatchesRequired) {
    return nonMeasuredReport('INADMISSIBLE_DEPLOYMENT_CHANGED', 'NONE', input.completedCaptures, common);
  }
  if (input.resourceHashesChanged) {
    return nonMeasuredReport('INADMISSIBLE_SOURCE_CHANGED_DURING_RUN', 'NONE', input.completedCaptures, common);
  }
  if (input.completedCaptures !== REQUIRED_CAPTURES || input.digests.length !== REQUIRED_CAPTURES || input.browserVersions.length !== REQUIRED_CAPTURES) {
    return nonMeasuredReport('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', 'NONE', input.completedCaptures, common);
  }

  const browserVersionCount = new Set(input.browserVersions).size;
  if (browserVersionCount !== 1) {
    return nonMeasuredReport('INADMISSIBLE_PROVIDER_ENVIRONMENT_CHANGED', 'NONE', REQUIRED_CAPTURES, {
      ...common,
      browser_version_count: browserVersionCount
    });
  }

  const counts = new Map();
  for (const digest of input.digests) counts.set(digest, (counts.get(digest) || 0) + 1);
  const modalDigestCount = Math.max(...counts.values());
  const report = baseReport('MEASURED', 'NONE');
  report.measurement_performed = true;
  report.completed_captures = REQUIRED_CAPTURES;
  report.sessions_created = input.sessionsCreated;
  report.session_release_attempts = input.sessionReleaseAttempts;
  report.unique_exact_render_digests = counts.size;
  report.modal_digest_count = modalDigestCount;
  report.exact_modal_recurrence_percent = modalDigestCount / REQUIRED_CAPTURES * 100;
  report.browser_version_count = 1;
  report.deployment_before_matches_required = true;
  report.deployment_after_matches_required = true;
  report.resource_hashes_changed = false;
  report.decision = modalDigestCount === REQUIRED_CAPTURES
    ? 'EXACT_RENDER_STABLE_CANDIDATE_V2'
    : 'KILL_EXACT_VISUAL_DIGEST_V2';
  return Object.freeze(report);
}

export function validateAggregateReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('report must be object');
  const actual = Object.keys(report).sort();
  const expected = [...REPORT_KEYS].sort();
  if (actual.length !== expected.length || expected.some((key, index) => actual[index] !== key)) throw new TypeError('aggregate report keys changed');
  if (report.schema !== 'seenrelay-private313-browserbase-rendered-state-stability-v2' || report.experiment_id !== EXPERIMENT_ID) throw new TypeError('aggregate identity mismatch');
  if (!ALLOWED_STATUSES.has(report.status)) throw new TypeError('status invalid');
  if (!ALLOWED_FAILURE_STAGES.has(report.failure_stage)) throw new TypeError('failure_stage invalid');
  if (!Number.isInteger(report.completed_captures) || report.completed_captures < 0 || report.completed_captures > REQUIRED_CAPTURES) throw new TypeError('completed_captures invalid');
  if (report.required_captures !== REQUIRED_CAPTURES) throw new TypeError('required_captures changed');
  if (!Number.isInteger(report.sessions_created) || report.sessions_created < 0) throw new TypeError('sessions_created invalid');
  if (!Number.isInteger(report.session_release_attempts) || report.session_release_attempts < 0) throw new TypeError('session_release_attempts invalid');
  if (report.selector_count_at_failure !== null && (!Number.isInteger(report.selector_count_at_failure) || report.selector_count_at_failure < 0)) throw new TypeError('selector_count_at_failure invalid');
  for (const key of ['deployment_before_matches_required','deployment_after_matches_required','resource_hashes_changed']) {
    if (report[key] !== null && typeof report[key] !== 'boolean') throw new TypeError(`${key} invalid`);
  }
  if (!report.privacy || report.privacy.aggregate_only !== true) throw new TypeError('privacy contract mismatch');
  for (const key of ['screenshots_retained','individual_digest_values_retained','session_identifiers_retained','project_identifiers_retained','connect_urls_retained','browserbase_api_key_retained','raw_resource_bytes_retained','resource_hash_values_retained','browser_version_values_retained','page_source_retained']) {
    if (report.privacy[key] !== false) throw new TypeError(`privacy.${key} must be false`);
  }

  if (report.status === 'MEASURED') {
    if (report.measurement_performed !== true || report.completed_captures !== REQUIRED_CAPTURES || report.failure_stage !== 'NONE') throw new TypeError('measured report incomplete');
    if (!Number.isInteger(report.unique_exact_render_digests) || report.unique_exact_render_digests < 1 || report.unique_exact_render_digests > REQUIRED_CAPTURES) throw new TypeError('unique digest count invalid');
    if (!Number.isInteger(report.modal_digest_count) || report.modal_digest_count < 1 || report.modal_digest_count > REQUIRED_CAPTURES) throw new TypeError('modal digest count invalid');
    if (typeof report.exact_modal_recurrence_percent !== 'number' || !Number.isFinite(report.exact_modal_recurrence_percent)) throw new TypeError('recurrence percent invalid');
    if (report.browser_version_count !== 1 || report.deployment_before_matches_required !== true || report.deployment_after_matches_required !== true || report.resource_hashes_changed !== false) throw new TypeError('measured admissibility flags invalid');
    const expectedDecision = report.modal_digest_count === REQUIRED_CAPTURES ? 'EXACT_RENDER_STABLE_CANDIDATE_V2' : 'KILL_EXACT_VISUAL_DIGEST_V2';
    if (report.decision !== expectedDecision) throw new TypeError('decision mismatch');
  } else {
    if (report.measurement_performed !== false || report.decision !== 'NO_STABILITY_VERDICT') throw new TypeError('non-measured report carried verdict');
    if (report.unique_exact_render_digests !== null || report.modal_digest_count !== null || report.exact_modal_recurrence_percent !== null) throw new TypeError('non-measured report leaked stability aggregates');
  }
  return true;
}

async function fetchNoCache(url) {
  return fetch(url, {
    headers: { 'cache-control': 'no-cache', 'user-agent': 'SeenRelay-PRIVATE313/1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000)
  });
}

async function deploymentMatchesRequired() {
  const response = await fetchNoCache(HEALTH_URL);
  if (!response.ok) throw new Error(`health HTTP ${response.status}`);
  const body = await response.json();
  return body?.ok === true && body?.environment === 'production' && body?.deployment_sha === REQUIRED_DEPLOYMENT_SHA;
}

async function resourceHashes() {
  const hashes = [];
  for (const url of RESOURCE_URLS) {
    const response = await fetchNoCache(url);
    if (!response.ok) throw new Error(`resource HTTP ${response.status}`);
    hashes.push(sha256(Buffer.from(await response.arrayBuffer())));
  }
  return hashes;
}

async function createBrowserbaseSession(apiKey) {
  const response = await fetch(SESSIONS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bb-api-key': apiKey },
    body: JSON.stringify({
      region: REGION,
      userMetadata: { experiment: EXPERIMENT_ID, workload: 'rendered-state-stability-v2' }
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`session create HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body.id !== 'string' || typeof body.projectId !== 'string' || typeof body.connectUrl !== 'string' || !body.connectUrl.startsWith('ws')) throw new Error('session create response invalid');
  return { sessionId: body.id, projectId: body.projectId, connectUrl: body.connectUrl };
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
    // Best-effort cleanup never changes measurement classification.
  }
  return true;
}

async function captureOne(apiKey) {
  const { chromium } = await import('playwright-core');
  let sessionId = null;
  let projectId = null;
  let connectUrl = null;
  let browser = null;
  let stage = 'SESSION_CREATE';
  let selectorCount = null;
  try {
    const session = await createBrowserbaseSession(apiKey);
    sessionId = session.sessionId;
    projectId = session.projectId;
    connectUrl = session.connectUrl;
    stage = 'CDP_CONNECT';
    browser = await chromium.connectOverCDP(connectUrl, { timeout: 30_000 });
    const context = browser.contexts()[0];
    const page = context?.pages()[0] || (context ? await context.newPage() : null);
    if (!page) throw new Error('missing page');

    stage = 'NAVIGATION';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    const navigation = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!navigation || !navigation.ok()) throw new Error(`navigation HTTP ${navigation?.status() ?? 'none'}`);

    stage = 'FONTS_READY';
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
    await page.waitForTimeout(500);

    stage = 'SELECTOR_CARDINALITY';
    const locator = page.locator(TARGET_SELECTOR);
    selectorCount = await locator.count();
    if (selectorCount !== 1) return { kind: 'selector-failure', stage, selectorCount, sessionId, projectId, browser };

    stage = 'SCREENSHOT';
    const png = await locator.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', scale: 'css', timeout: 20_000 });
    if (!Buffer.isBuffer(png) || png.length === 0) throw new Error('empty screenshot');
    stage = 'BROWSER_VERSION';
    const browserVersion = browser.version();
    if (!browserVersion || typeof browserVersion !== 'string') throw new Error('browser version unavailable');
    return { kind: 'capture', digest: sha256(png), browserVersion, stage: 'NONE', selectorCount: 1, sessionId, projectId, browser };
  } catch {
    return { kind: 'failure', stage, selectorCount, sessionId, projectId, browser };
  }
}

async function cleanupCapture(apiKey, capture) {
  if (capture?.browser) {
    try { await capture.browser.close(); } catch {}
    capture.browser = null;
  }
  if (capture?.sessionId && capture?.projectId) {
    await requestRelease(apiKey, capture.sessionId, capture.projectId);
    capture.sessionId = null;
    capture.projectId = null;
    capture.connectUrl = null;
    return true;
  }
  return false;
}

async function writeReport(report) {
  validateAggregateReport(report);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

export async function runPrivate313() {
  const apiKey = String(process.env.BROWSERBASE_API_KEY || '').trim();
  if (!apiKey) return writeReport(blockedReport());

  let sessionsCreated = 0;
  let sessionReleaseAttempts = 0;
  const digests = [];
  const browserVersions = [];
  let deploymentBeforeMatchesRequired;
  let hashesBefore;

  try {
    deploymentBeforeMatchesRequired = await deploymentMatchesRequired();
  } catch {
    return writeReport(nonMeasuredReport('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', 'HEALTH_BEFORE', 0, {
      sessions_created: 0,
      session_release_attempts: 0
    }));
  }
  if (!deploymentBeforeMatchesRequired) {
    return writeReport(nonMeasuredReport('INADMISSIBLE_DEPLOYMENT_CHANGED', 'NONE', 0, {
      deployment_before_matches_required: false,
      sessions_created: 0,
      session_release_attempts: 0
    }));
  }

  try {
    hashesBefore = await resourceHashes();
  } catch {
    return writeReport(nonMeasuredReport('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', 'RESOURCE_HASH_BEFORE', 0, {
      deployment_before_matches_required: true,
      sessions_created: 0,
      session_release_attempts: 0
    }));
  }

  for (let i = 0; i < REQUIRED_CAPTURES; i++) {
    const capture = await captureOne(apiKey);
    if (capture.sessionId) sessionsCreated++;
    if (capture.kind === 'selector-failure') {
      if (await cleanupCapture(apiKey, capture)) sessionReleaseAttempts++;
      return writeReport(nonMeasuredReport('INCOMPLETE_SELECTOR_CONTRACT', 'SELECTOR_CARDINALITY', digests.length, {
        sessions_created: sessionsCreated,
        session_release_attempts: sessionReleaseAttempts,
        selector_count_at_failure: capture.selectorCount,
        deployment_before_matches_required: true
      }));
    }
    if (capture.kind !== 'capture') {
      if (await cleanupCapture(apiKey, capture)) sessionReleaseAttempts++;
      return writeReport(nonMeasuredReport('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', capture.stage, digests.length, {
        sessions_created: sessionsCreated,
        session_release_attempts: sessionReleaseAttempts,
        selector_count_at_failure: capture.stage === 'SELECTOR_CARDINALITY' ? capture.selectorCount : null,
        deployment_before_matches_required: true
      }));
    }
    digests.push(capture.digest);
    browserVersions.push(capture.browserVersion);
    capture.digest = null;
    capture.browserVersion = null;
    if (await cleanupCapture(apiKey, capture)) sessionReleaseAttempts++;
  }

  let deploymentAfterMatchesRequired;
  try {
    deploymentAfterMatchesRequired = await deploymentMatchesRequired();
  } catch {
    return writeReport(nonMeasuredReport('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', 'HEALTH_AFTER', REQUIRED_CAPTURES, {
      sessions_created: sessionsCreated,
      session_release_attempts: sessionReleaseAttempts,
      deployment_before_matches_required: true
    }));
  }

  let hashesAfter;
  try {
    hashesAfter = await resourceHashes();
  } catch {
    return writeReport(nonMeasuredReport('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', 'RESOURCE_HASH_AFTER', REQUIRED_CAPTURES, {
      sessions_created: sessionsCreated,
      session_release_attempts: sessionReleaseAttempts,
      deployment_before_matches_required: true,
      deployment_after_matches_required: deploymentAfterMatchesRequired
    }));
  }

  const resourceHashesChanged = hashesBefore.some((hash, index) => hash !== hashesAfter[index]);
  hashesBefore = null;
  hashesAfter = null;
  const report = classifyMeasurement({
    digests,
    browserVersions,
    completedCaptures: digests.length,
    sessionsCreated,
    sessionReleaseAttempts,
    deploymentBeforeMatchesRequired,
    deploymentAfterMatchesRequired,
    resourceHashesChanged
  });
  digests.fill('');
  browserVersions.fill('');
  return writeReport(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrivate313().then((report) => {
    process.stdout.write(`${JSON.stringify({ status: report.status, decision: report.decision, measurement_performed: report.measurement_performed })}\n`);
  }).catch(() => { process.exitCode = 1; });
}
