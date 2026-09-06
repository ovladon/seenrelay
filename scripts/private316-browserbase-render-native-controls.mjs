import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPERIMENT_ID = 'PRIVATE316';
const REQUIRED_DEPLOYMENT_SHA = '2cc216207044f55b27aced00aa0baa5af738ba62';
const HEALTH_URL = 'https://seenrelay.com/healthz';
const RESOURCE_URLS = Object.freeze([
  'https://seenrelay.com/',
  'https://seenrelay.com/revamp.css',
  'https://seenrelay.com/revamp-factual.css',
  'https://seenrelay.com/revamp.js'
]);
const ROUNDS = 20;
const OUTPUT_PATH = process.env.PRIVATE316_OUTPUT || 'private316-browserbase-render-native-controls.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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

function baseReport() {
  return {
    schema: 'seenrelay-private316-browserbase-render-native-controls-v1',
    experiment_id: EXPERIMENT_ID,
    status: 'INCOMPLETE',
    measurement_performed: false,
    resource_count: RESOURCE_URLS.length,
    round_count: 0,
    etag_resource_count: 0,
    last_modified_resource_count: 0,
    conditional_capable_resource_count: 0,
    conditional_request_count: 0,
    conditional_304_count: 0,
    fallback_full_get_count: 0,
    fallback_hash_match_count: 0,
    initial_total_resource_bytes: 0,
    median_parallel_bundle_ms: null,
    p95_parallel_bundle_ms: null,
    deployment_before_matches_required: null,
    deployment_after_matches_required: null,
    resource_hashes_changed: null,
    decision: 'NATIVE_CONTROL_NOT_CLEAN',
    privacy: privacy()
  };
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function classifyNativeControl({ resourceCount, rounds, conditionalCapableResourceCount, conditionalRequestCount, conditional304Count, fallbackFullGetCount, fallbackHashMatchCount, deploymentBeforeMatchesRequired, deploymentAfterMatchesRequired, resourceHashesChanged }) {
  if (resourceCount !== 4 || rounds !== 20 || deploymentBeforeMatchesRequired !== true || deploymentAfterMatchesRequired !== true || resourceHashesChanged !== false) return 'NATIVE_CONTROL_NOT_CLEAN';
  const totalValidations = resourceCount * rounds;
  if (conditionalRequestCount + fallbackFullGetCount !== totalValidations) return 'NATIVE_CONTROL_NOT_CLEAN';
  if (conditional304Count !== conditionalRequestCount || fallbackHashMatchCount !== fallbackFullGetCount) return 'NATIVE_CONTROL_NOT_CLEAN';
  if (conditionalCapableResourceCount === resourceCount && conditionalRequestCount === totalValidations && fallbackFullGetCount === 0) return 'NATIVE_CONDITIONAL_SHORTCUT_STRONG';
  return 'NATIVE_FULL_HASH_SHORTCUT_PRESENT';
}

export function validateAggregateReport(report) {
  const expected = [
    'schema','experiment_id','status','measurement_performed','resource_count','round_count','etag_resource_count',
    'last_modified_resource_count','conditional_capable_resource_count','conditional_request_count','conditional_304_count',
    'fallback_full_get_count','fallback_hash_match_count','initial_total_resource_bytes','median_parallel_bundle_ms',
    'p95_parallel_bundle_ms','deployment_before_matches_required','deployment_after_matches_required','resource_hashes_changed','decision','privacy'
  ].sort();
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('report invalid');
  const actual = Object.keys(report).sort();
  if (actual.length !== expected.length || expected.some((key, i) => actual[i] !== key)) throw new TypeError('aggregate keys changed');
  if (report.schema !== 'seenrelay-private316-browserbase-render-native-controls-v1' || report.experiment_id !== EXPERIMENT_ID) throw new TypeError('identity mismatch');
  if (!['INCOMPLETE','MEASURED'].includes(report.status) || typeof report.measurement_performed !== 'boolean') throw new TypeError('status invalid');
  for (const key of ['resource_count','round_count','etag_resource_count','last_modified_resource_count','conditional_capable_resource_count','conditional_request_count','conditional_304_count','fallback_full_get_count','fallback_hash_match_count','initial_total_resource_bytes']) {
    if (!Number.isInteger(report[key]) || report[key] < 0) throw new TypeError(`${key} invalid`);
  }
  for (const key of ['median_parallel_bundle_ms','p95_parallel_bundle_ms']) {
    if (report[key] !== null && (typeof report[key] !== 'number' || !Number.isFinite(report[key]) || report[key] < 0)) throw new TypeError(`${key} invalid`);
  }
  for (const key of ['deployment_before_matches_required','deployment_after_matches_required','resource_hashes_changed']) {
    if (report[key] !== null && typeof report[key] !== 'boolean') throw new TypeError(`${key} invalid`);
  }
  if (!['NATIVE_CONDITIONAL_SHORTCUT_STRONG','NATIVE_FULL_HASH_SHORTCUT_PRESENT','NATIVE_CONTROL_NOT_CLEAN'].includes(report.decision)) throw new TypeError('decision invalid');
  if (!report.privacy || report.privacy.aggregate_only !== true) throw new TypeError('privacy mismatch');
  for (const key of ['validator_values_retained','resource_hash_values_retained','resource_bodies_retained','headers_retained','cookies_retained','browserbase_identifiers_retained','seenrelay_identifiers_retained']) {
    if (report.privacy[key] !== false) throw new TypeError(`privacy.${key} must be false`);
  }
  if (report.status === 'MEASURED' && (report.measurement_performed !== true || report.round_count !== ROUNDS)) throw new TypeError('measured report incomplete');
  if (report.status !== 'MEASURED' && report.decision !== 'NATIVE_CONTROL_NOT_CLEAN') throw new TypeError('incomplete report cannot carry shortcut decision');
  return true;
}

async function fetchControlled(url, extraHeaders = {}) {
  return fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'SeenRelay-PRIVATE316-Native-Control/1',
      ...extraHeaders
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000)
  });
}

async function deploymentMatches() {
  const response = await fetchControlled(HEALTH_URL);
  if (!response.ok) throw new Error(`health HTTP ${response.status}`);
  const body = await response.json();
  return body?.ok === true && body?.environment === 'production' && body?.deployment_sha === REQUIRED_DEPLOYMENT_SHA;
}

async function initialResourceState(url) {
  const response = await fetchControlled(url);
  if (!response.ok) throw new Error(`resource HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  return {
    byteLength: bytes.length,
    hash: sha256(bytes),
    validatorType: etag ? 'etag' : (lastModified ? 'last-modified' : 'none'),
    validatorValue: etag || lastModified || null
  };
}

async function validateOne(url, state) {
  if (state.validatorType === 'etag') {
    const response = await fetchControlled(url, { 'if-none-match': state.validatorValue });
    return { type: 'conditional', valid: response.status === 304 };
  }
  if (state.validatorType === 'last-modified') {
    const response = await fetchControlled(url, { 'if-modified-since': state.validatorValue });
    return { type: 'conditional', valid: response.status === 304 };
  }
  const response = await fetchControlled(url);
  if (!response.ok) return { type: 'fallback', valid: false };
  const bytes = Buffer.from(await response.arrayBuffer());
  return { type: 'fallback', valid: sha256(bytes) === state.hash };
}

async function finalHash(url) {
  const response = await fetchControlled(url);
  if (!response.ok) throw new Error(`final resource HTTP ${response.status}`);
  return sha256(Buffer.from(await response.arrayBuffer()));
}

async function writeReport(report) {
  validateAggregateReport(report);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

export async function runPrivate316() {
  const report = baseReport();
  let states;
  let bundleLatencies = [];
  try {
    report.deployment_before_matches_required = await deploymentMatches();
    if (!report.deployment_before_matches_required) return writeReport(report);

    states = await Promise.all(RESOURCE_URLS.map(initialResourceState));
    report.initial_total_resource_bytes = states.reduce((sum, state) => sum + state.byteLength, 0);
    report.etag_resource_count = states.filter((state) => state.validatorType === 'etag').length;
    report.last_modified_resource_count = states.filter((state) => state.validatorType === 'last-modified').length;
    report.conditional_capable_resource_count = states.filter((state) => state.validatorType !== 'none').length;

    for (let round = 0; round < ROUNDS; round++) {
      const start = performance.now();
      const results = await Promise.all(RESOURCE_URLS.map((url, i) => validateOne(url, states[i])));
      bundleLatencies.push(performance.now() - start);
      for (const result of results) {
        if (result.type === 'conditional') {
          report.conditional_request_count++;
          if (result.valid) report.conditional_304_count++;
        } else {
          report.fallback_full_get_count++;
          if (result.valid) report.fallback_hash_match_count++;
        }
      }
      report.round_count++;
      if (results.some((result) => !result.valid)) return writeReport(report);
    }

    report.deployment_after_matches_required = await deploymentMatches();
    const hashesAfter = await Promise.all(RESOURCE_URLS.map(finalHash));
    report.resource_hashes_changed = states.some((state, i) => state.hash !== hashesAfter[i]);
    report.median_parallel_bundle_ms = percentile(bundleLatencies, 0.5);
    report.p95_parallel_bundle_ms = percentile(bundleLatencies, 0.95);
    report.decision = classifyNativeControl({
      resourceCount: report.resource_count,
      rounds: report.round_count,
      conditionalCapableResourceCount: report.conditional_capable_resource_count,
      conditionalRequestCount: report.conditional_request_count,
      conditional304Count: report.conditional_304_count,
      fallbackFullGetCount: report.fallback_full_get_count,
      fallbackHashMatchCount: report.fallback_hash_match_count,
      deploymentBeforeMatchesRequired: report.deployment_before_matches_required,
      deploymentAfterMatchesRequired: report.deployment_after_matches_required,
      resourceHashesChanged: report.resource_hashes_changed
    });
    report.status = 'MEASURED';
    report.measurement_performed = true;
    states = null;
    bundleLatencies = [];
    return writeReport(report);
  } catch {
    states = null;
    bundleLatencies = [];
    return writeReport(report);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrivate316().then((report) => {
    process.stdout.write(`${JSON.stringify({ status: report.status, decision: report.decision, measurement_performed: report.measurement_performed })}\n`);
  }).catch(() => { process.exitCode = 1; });
}
