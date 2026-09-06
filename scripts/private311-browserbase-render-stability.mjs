import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPERIMENT_ID = 'PRIVATE311';
const REQUIRED_CAPTURES = 20;
const TARGET_URL = 'https://seenrelay.com/';
const TARGET_CSS_URL = 'https://seenrelay.com/site.css';
const TARGET_SELECTOR = '.hero-shell';
const REGION = 'eu-central-1';
const OUTPUT_PATH = process.env.PRIVATE311_OUTPUT || 'private311-browserbase-render-stability.json';

const REPORT_KEYS = Object.freeze([
  'schema',
  'experiment_id',
  'status',
  'measurement_performed',
  'completed_captures',
  'required_captures',
  'unique_exact_render_digests',
  'modal_digest_count',
  'exact_modal_recurrence_percent',
  'browser_version_count',
  'source_html_changed',
  'source_css_changed',
  'decision',
  'privacy'
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function privacyEnvelope() {
  return Object.freeze({
    screenshots_retained: false,
    individual_digest_values_retained: false,
    session_identifiers_retained: false,
    connect_urls_retained: false,
    browserbase_api_key_retained: false,
    raw_source_bytes_retained: false,
    aggregate_only: true
  });
}

function reportBase(status, measurementPerformed, completedCaptures, decision) {
  return {
    schema: 'seenrelay-private311-browserbase-rendered-state-stability-v1',
    experiment_id: EXPERIMENT_ID,
    status,
    measurement_performed: measurementPerformed,
    completed_captures: completedCaptures,
    required_captures: REQUIRED_CAPTURES,
    unique_exact_render_digests: null,
    modal_digest_count: null,
    exact_modal_recurrence_percent: null,
    browser_version_count: null,
    source_html_changed: null,
    source_css_changed: null,
    decision,
    privacy: privacyEnvelope()
  };
}

export function blockedReport(status = 'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY') {
  return Object.freeze(reportBase(status, false, 0, 'NO_STABILITY_VERDICT'));
}

export function incompleteReport(completedCaptures = 0) {
  return Object.freeze(reportBase('INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE', false, completedCaptures, 'NO_STABILITY_VERDICT'));
}

function validateSyntheticInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('measurement input must be object');
  if (!Array.isArray(input.digests) || !Array.isArray(input.browserVersions)) throw new TypeError('digests and browserVersions must be arrays');
  if (!Number.isInteger(input.completedCaptures) || input.completedCaptures < 0) throw new TypeError('completedCaptures must be non-negative integer');
  for (const digest of input.digests) if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new TypeError('digest must be lowercase sha256 hex');
  for (const version of input.browserVersions) if (typeof version !== 'string' || !version.trim()) throw new TypeError('browser version must be non-empty string');
  for (const key of ['sourceHtmlBefore','sourceHtmlAfter','sourceCssBefore','sourceCssAfter']) {
    if (typeof input[key] !== 'string' || !/^[0-9a-f]{64}$/.test(input[key])) throw new TypeError(`${key} must be lowercase sha256 hex`);
  }
}

export function classifyMeasurement(input) {
  validateSyntheticInput(input);
  if (input.completedCaptures !== REQUIRED_CAPTURES || input.digests.length !== REQUIRED_CAPTURES || input.browserVersions.length !== REQUIRED_CAPTURES) {
    return incompleteReport(input.completedCaptures);
  }

  const sourceHtmlChanged = input.sourceHtmlBefore !== input.sourceHtmlAfter;
  const sourceCssChanged = input.sourceCssBefore !== input.sourceCssAfter;
  if (sourceHtmlChanged || sourceCssChanged) {
    const report = reportBase('INADMISSIBLE_SOURCE_CHANGED_DURING_RUN', false, REQUIRED_CAPTURES, 'NO_STABILITY_VERDICT');
    report.source_html_changed = sourceHtmlChanged;
    report.source_css_changed = sourceCssChanged;
    return Object.freeze(report);
  }

  const versionCount = new Set(input.browserVersions).size;
  if (versionCount !== 1) {
    const report = reportBase('INADMISSIBLE_PROVIDER_ENVIRONMENT_CHANGED', false, REQUIRED_CAPTURES, 'NO_STABILITY_VERDICT');
    report.source_html_changed = false;
    report.source_css_changed = false;
    report.browser_version_count = versionCount;
    return Object.freeze(report);
  }

  const counts = new Map();
  for (const digest of input.digests) counts.set(digest, (counts.get(digest) || 0) + 1);
  const modalDigestCount = Math.max(...counts.values());
  const uniqueCount = counts.size;
  const exactPercent = modalDigestCount / REQUIRED_CAPTURES * 100;
  const decision = modalDigestCount === REQUIRED_CAPTURES
    ? 'EXACT_RENDER_STABLE_CANDIDATE'
    : 'KILL_EXACT_VISUAL_DIGEST_V1';
  const report = reportBase('MEASURED', true, REQUIRED_CAPTURES, decision);
  report.unique_exact_render_digests = uniqueCount;
  report.modal_digest_count = modalDigestCount;
  report.exact_modal_recurrence_percent = exactPercent;
  report.browser_version_count = 1;
  report.source_html_changed = false;
  report.source_css_changed = false;
  return Object.freeze(report);
}

export function validateAggregateReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('report must be object');
  const keys = Object.keys(report).sort();
  const expected = [...REPORT_KEYS].sort();
  if (keys.length !== expected.length || expected.some((key, i) => keys[i] !== key)) throw new TypeError('aggregate report keys changed');
  if (report.schema !== 'seenrelay-private311-browserbase-rendered-state-stability-v1' || report.experiment_id !== EXPERIMENT_ID) throw new TypeError('aggregate identity mismatch');
  if (!report.privacy || report.privacy.aggregate_only !== true) throw new TypeError('aggregate privacy contract mismatch');
  for (const key of ['screenshots_retained','individual_digest_values_retained','session_identifiers_retained','connect_urls_retained','browserbase_api_key_retained','raw_source_bytes_retained']) {
    if (report.privacy[key] !== false) throw new TypeError(`privacy.${key} must be false`);
  }
  const allowedStatuses = new Set([
    'ACCESS_BLOCKED_NO_BROWSERBASE_API_KEY',
    'INCOMPLETE_PROVIDER_OR_CAPTURE_FAILURE',
    'INADMISSIBLE_SOURCE_CHANGED_DURING_RUN',
    'INADMISSIBLE_PROVIDER_ENVIRONMENT_CHANGED',
    'MEASURED'
  ]);
  if (!allowedStatuses.has(report.status)) throw new TypeError('unexpected status');
  if (report.status === 'MEASURED') {
    if (report.measurement_performed !== true || report.completed_captures !== REQUIRED_CAPTURES) throw new TypeError('MEASURED report incomplete');
    if (!Number.isInteger(report.unique_exact_render_digests) || report.unique_exact_render_digests < 1 || report.unique_exact_render_digests > REQUIRED_CAPTURES) throw new TypeError('invalid unique digest count');
    if (!Number.isInteger(report.modal_digest_count) || report.modal_digest_count < 1 || report.modal_digest_count > REQUIRED_CAPTURES) throw new TypeError('invalid modal count');
    if (typeof report.exact_modal_recurrence_percent !== 'number' || !Number.isFinite(report.exact_modal_recurrence_percent)) throw new TypeError('invalid recurrence percent');
    const expectedDecision = report.modal_digest_count === REQUIRED_CAPTURES ? 'EXACT_RENDER_STABLE_CANDIDATE' : 'KILL_EXACT_VISUAL_DIGEST_V1';
    if (report.decision !== expectedDecision) throw new TypeError('decision mismatch');
  } else {
    if (report.measurement_performed !== false || report.decision !== 'NO_STABILITY_VERDICT') throw new TypeError('non-measured report must not carry stability verdict');
    if (report.unique_exact_render_digests !== null || report.modal_digest_count !== null || report.exact_modal_recurrence_percent !== null) throw new TypeError('non-measured report leaked stability result');
  }
  return true;
}

async function fetchSourceHash(url) {
  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'SeenRelay-PRIVATE311-Source-Invariance/1'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`source control HTTP ${response.status}`);
  return sha256(Buffer.from(await response.arrayBuffer()));
}

async function createBrowserbaseSession(apiKey) {
  const response = await fetch('https://api.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bb-api-key': apiKey
    },
    body: JSON.stringify({
      region: REGION,
      userMetadata: { experiment: EXPERIMENT_ID, workload: 'rendered-state-stability-v1' }
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Browserbase create session HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body.connectUrl !== 'string' || !body.connectUrl.startsWith('ws')) throw new Error('Browserbase session missing connectUrl');
  return body.connectUrl;
}

async function captureOne(apiKey) {
  const { chromium } = await import('playwright-core');
  const connectUrl = await createBrowserbaseSession(apiKey);
  let browser;
  try {
    browser = await chromium.connectOverCDP(connectUrl, { timeout: 30_000 });
    const contexts = browser.contexts();
    const context = contexts[0];
    if (!context) throw new Error('Browserbase session missing default context');
    const pages = context.pages();
    const page = pages[0] || await context.newPage();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response || !response.ok()) throw new Error(`target navigation HTTP ${response?.status() ?? 'none'}`);
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(500);
    const locator = page.locator(TARGET_SELECTOR);
    if (await locator.count() !== 1) throw new Error('target selector cardinality is not exactly one');
    const png = await locator.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      timeout: 20_000
    });
    const version = browser.version();
    if (!version || typeof version !== 'string') throw new Error('browser version unavailable');
    return { digest: sha256(png), browserVersion: version };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function writeReport(report) {
  validateAggregateReport(report);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

export async function runPrivate311() {
  const apiKey = String(process.env.BROWSERBASE_API_KEY || '').trim();
  if (!apiKey) {
    const report = blockedReport();
    await writeReport(report);
    return report;
  }

  const digests = [];
  const browserVersions = [];
  let sourceHtmlBefore;
  let sourceCssBefore;
  try {
    [sourceHtmlBefore, sourceCssBefore] = await Promise.all([
      fetchSourceHash(TARGET_URL),
      fetchSourceHash(TARGET_CSS_URL)
    ]);
    for (let i = 0; i < REQUIRED_CAPTURES; i++) {
      const capture = await captureOne(apiKey);
      digests.push(capture.digest);
      browserVersions.push(capture.browserVersion);
    }
    const [sourceHtmlAfter, sourceCssAfter] = await Promise.all([
      fetchSourceHash(TARGET_URL),
      fetchSourceHash(TARGET_CSS_URL)
    ]);
    const report = classifyMeasurement({
      digests,
      browserVersions,
      completedCaptures: digests.length,
      sourceHtmlBefore,
      sourceHtmlAfter,
      sourceCssBefore,
      sourceCssAfter
    });
    await writeReport(report);
    return report;
  } catch {
    const report = incompleteReport(digests.length);
    await writeReport(report);
    return report;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrivate311().then((report) => {
    process.stdout.write(`${JSON.stringify({ status: report.status, decision: report.decision, measurement_performed: report.measurement_performed })}\n`);
  }).catch(() => {
    process.exitCode = 1;
  });
}
