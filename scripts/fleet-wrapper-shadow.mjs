import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { SeenRelayClient } from '../clients/typescript/dist/seenrelay.js';
import { evaluateHostileBenchmark } from './evaluate-hostile-benchmark.mjs';

export const WORKLOAD_ID = 'wrapper-deterministic-suite-fleet-v2';
export const WORKLOAD_CLASS = 'fleet_tool_validations';
export const COST_UNIT = 'github_actions_runner_ms';
export const TARGET_TESTS = Object.freeze([
  'tests/client-wrappers.test.mjs',
  'tests/shadow-proof.test.mjs',
  'tests/deferred-observe.test.mjs'
]);
export const VALIDATION_INPUTS = Object.freeze([
  ...TARGET_TESTS,
  'clients/typescript/dist/seenrelay.js',
  'clients/typescript/dist/shadow-proof.js',
  'clients/typescript/package.json',
  'clients/python/pyproject.toml',
  'clients/LICENSE'
]);

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_LEDGER_RECORDS = 1000;
const ALLOWED_ROLES = new Set(['ci', 'client-wrappers', 'test']);
const RECORD_KEYS = Object.freeze([
  'check_status', 'policy_reusable', 'reuse_would_match_validation', 'observe_after_baseline',
  'baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost'
]);

function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('value is not JSON-serializable');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validationInputDigest({ readFile = (path) => fs.readFileSync(path, 'utf8') } = {}) {
  const material = VALIDATION_INPUTS
    .map((path) => `${path}\n${readFile(path)}`)
    .join('\n--seenrelay-validation-input--\n');
  return sha256(material);
}

export function buildFleetCoordinate({
  nodeVersion = process.version,
  platform = process.platform,
  arch = process.arch,
  imageOS = process.env.ImageOS || process.env.RUNNER_OS || '',
  imageVersion = process.env.ImageVersion || '',
  inputDigest = validationInputDigest()
} = {}) {
  return sha256(stableJson({
    workload: WORKLOAD_ID,
    input_digest: inputDigest,
    node_version: nodeVersion,
    platform,
    arch,
    image_os: imageOS,
    image_version: imageVersion
  }));
}

export function buildFleetFact({ coordinate }) {
  if (typeof coordinate !== 'string' || coordinate.length !== 64) throw new TypeError('coordinate must be a SHA-256 hex digest');
  return Object.freeze({
    subject: 'SeenRelay deterministic JavaScript wrapper suite input',
    predicate: 'validation.pass.current',
    source: 'https://github.com/ovladon/seenrelay?seenrelay_internal_benchmark=fleet_wrapper_js_v2',
    locator: { scheme: 'source_key', value: coordinate }
  });
}

export function fleetEvidenceEligibility({
  eventName = process.env.GITHUB_EVENT_NAME || '',
  branchName = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || ''
} = {}) {
  if (eventName !== 'pull_request') {
    return Object.freeze({ eligible: false, reason: 'non_pull_request_event' });
  }
  if (/^(?:research|verify)\/fleet(?:[-/]|$)/.test(branchName)) {
    return Object.freeze({ eligible: false, reason: 'commissioning_branch' });
  }
  return Object.freeze({ eligible: true, reason: null });
}

function roleCounterpartWorkflow(role) {
  return role === 'ci' ? 'client-wrappers.yml' : 'ci.yml';
}

function baseMatches(run, headSha, baseSha) {
  if (headSha === baseSha && run?.head_sha === headSha) return true;
  const prs = Array.isArray(run?.pull_requests) ? run.pull_requests : [];
  return prs.some((pr) => pr?.head?.sha === headSha && pr?.base?.sha === baseSha);
}

export async function measureProviderNativeControl({
  role,
  headSha,
  baseSha,
  token = process.env.GITHUB_TOKEN,
  fetchImpl = fetch,
  timeoutMs = 1500
}) {
  if (!ALLOWED_ROLES.has(role)) throw new TypeError(`unsupported fleet role: ${role}`);
  if (!headSha || !baseSha) throw new TypeError('headSha and baseSha are required');
  const workflow = roleCounterpartWorkflow(role);
  const url = `https://api.github.com/repos/ovladon/seenrelay/actions/workflows/${workflow}/runs?head_sha=${encodeURIComponent(headSha)}&status=success&per_page=20`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'seenrelay-natural-workload',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return Object.freeze({ available: true, measured: true, hit: false, ok: false, latency_ms: Math.max(0, performance.now() - started) });
    }
    const payload = await response.json();
    const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
    const hit = runs.some((run) => run?.conclusion === 'success' && run?.head_sha === headSha && baseMatches(run, headSha, baseSha));
    return Object.freeze({ available: true, measured: true, hit, ok: true, latency_ms: Math.max(0, performance.now() - started) });
  } catch {
    return Object.freeze({ available: true, measured: true, hit: false, ok: false, latency_ms: Math.max(0, performance.now() - started) });
  } finally {
    clearTimeout(timer);
  }
}

export function runTargetSuite() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...TARGET_TESTS], { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve('pass');
      else reject(new Error(`fleet wrapper suite failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

function safeMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function sanitizedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('ledger record must be an object');
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || !RECORD_KEYS.every((key) => keys.includes(key))) {
    throw new TypeError('ledger record contains non-sanitized fields');
  }
  return Object.fromEntries(RECORD_KEYS.map((key) => [key, record[key]]));
}

function compatiblePreviousLedger(previousLedger, role) {
  if (!previousLedger) return null;
  if (previousLedger.workload_id !== WORKLOAD_ID) return null;
  if (
    previousLedger.workload_class !== WORKLOAD_CLASS ||
    previousLedger.role !== role ||
    previousLedger.cost_unit !== COST_UNIT
  ) throw new TypeError('previous fleet ledger is incompatible');
  if (!Array.isArray(previousLedger.records)) throw new TypeError('previous fleet ledger records must be an array');
  return previousLedger;
}

function priorLedgerRecords(previousLedger) {
  if (!previousLedger) return [];
  return previousLedger.records.map(sanitizedRecord);
}

function priorCount(previousLedger, key) {
  const value = previousLedger?.control_evidence?.[key] ?? previousLedger?.[key];
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function buildRecord({ checkStatus, policyReusable, reuseWouldMatchValidation, validationMs, checkMs, observeMs, observeAfterBaseline }) {
  return Object.freeze({
    check_status: checkStatus ?? null,
    policy_reusable: policyReusable === true,
    reuse_would_match_validation: policyReusable === true ? reuseWouldMatchValidation === true : null,
    observe_after_baseline: observeAfterBaseline === true,
    baseline_ms: safeMs(validationMs),
    baseline_cost: safeMs(validationMs),
    check_ms: safeMs(checkMs),
    observe_ms: safeMs(observeMs),
    check_cost: safeMs(checkMs),
    observe_cost: safeMs(observeMs)
  });
}

function buildLedger({ role, previousLedger, provider, record, eligible }) {
  const priorRecords = priorLedgerRecords(previousLedger);
  const nextRecords = record ? [...priorRecords, sanitizedRecord(record)] : priorRecords;
  const previousDropped = priorCount(previousLedger, 'records_dropped');
  const overflow = Math.max(0, nextRecords.length - MAX_LEDGER_RECORDS);
  const records = overflow > 0 ? nextRecords.slice(overflow) : nextRecords;
  const protectedCalls = priorCount(previousLedger, 'protected_calls') + (record ? 1 : 0);
  return Object.freeze({
    schema_version: 2,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    role,
    cost_unit: COST_UNIT,
    natural_events: priorCount(previousLedger, 'natural_events') + (eligible ? 1 : 0),
    protected_calls: protectedCalls,
    records_dropped: previousDropped + overflow,
    preliminary_sample_floor_met: protectedCalls >= 100,
    control_evidence: Object.freeze({
      provider_native_queries: priorCount(previousLedger, 'provider_native_queries') + (eligible ? 1 : 0),
      provider_native_hits: priorCount(previousLedger, 'provider_native_hits') + (eligible && provider.hit ? 1 : 0),
      provider_native_query_failures: priorCount(previousLedger, 'provider_native_query_failures') + (eligible && !provider.ok ? 1 : 0)
    }),
    records: Object.freeze(records),
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });
}

function buildHostileInput(ledger) {
  return Object.freeze({
    schema_version: 2,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    sample_type: 'natural_workload',
    baseline_definition: 'best_existing_non_shared_path',
    controls: Object.freeze({
      local_cache: Object.freeze({ available: false, measured: true }),
      source_native_conditional: Object.freeze({ available: false, measured: true }),
      provider_native_cache: Object.freeze({ available: true, measured: true })
    }),
    observe_off_critical_path: false,
    records: Object.freeze(ledger.records.map((record) => Object.freeze({ ...record })))
  });
}

function safeEvaluate(ledger) {
  if (ledger.records.length === 0) return { state: 'incomplete', reason: 'no_protected_calls', report: null };
  if (ledger.records_dropped > 0) return { state: 'incomplete', reason: 'ledger_overflow', report: null };
  try {
    return { state: 'complete', reason: null, report: evaluateHostileBenchmark(buildHostileInput(ledger)) };
  } catch (error) {
    return { state: 'incomplete', reason: error instanceof Error ? error.message : 'evaluation_error', report: null };
  }
}

export async function runFleetWrapperShadow({
  role = process.env.SEENRELAY_FLEET_ROLE || 'test',
  headSha = process.env.SEENRELAY_FLEET_HEAD_SHA || process.env.GITHUB_SHA || 'local-head',
  baseSha = process.env.SEENRELAY_FLEET_BASE_SHA || process.env.GITHUB_SHA || 'local-base',
  origin = process.env.SEENRELAY_ORIGIN || 'https://seenrelay.com',
  fetchImpl = fetch,
  validate = runTargetSuite,
  previousLedger = null,
  eligibility = fleetEvidenceEligibility(),
  writeFiles = false,
  outputPrefix = process.env.FLEET_SHADOW_PREFIX || `fleet-wrapper-v2-shadow-${role}`
} = {}) {
  if (!ALLOWED_ROLES.has(role)) throw new TypeError(`unsupported fleet role: ${role}`);
  if (!eligibility || typeof eligibility.eligible !== 'boolean') throw new TypeError('eligibility must declare an eligible boolean');
  const eligible = eligibility.eligible;
  const prior = compatiblePreviousLedger(previousLedger, role);
  const coordinate = buildFleetCoordinate();
  const fact = buildFleetFact({ coordinate });

  // Commissioning and non-PR runs still execute the authoritative tests, but
  // they cannot query or seed either GitHub control evidence or SeenRelay.
  const provider = eligible
    ? await measureProviderNativeControl({ role, headSha, baseSha, fetchImpl })
    : Object.freeze({ available: true, measured: false, hit: false, ok: true, latency_ms: 0 });
  const controlReady = eligible && provider.ok === true;

  const client = controlReady ? new SeenRelayClient({
    baseUrl: origin,
    clientHint: `seenrelay-internal-fleet-wrapper-v2-${role}`,
    fetchImpl,
    checkTimeoutMs: 1500,
    observeTimeoutMs: 1000
  }) : null;

  let check = null;
  let checkMs = 0;
  if (controlReady && !provider.hit) {
    const started = performance.now();
    try {
      check = await client.check(fact, 'pass', MAX_AGE_SECONDS);
    } catch {
      check = null;
    } finally {
      checkMs = Math.max(0, performance.now() - started);
    }
  }

  // The original validation remains authoritative on every run, including
  // commissioning runs and hypothetical reuse opportunities.
  const validationStarted = performance.now();
  const value = await validate();
  const validationMs = Math.max(0, performance.now() - validationStarted);
  if (value !== 'pass') throw new Error('fleet wrapper authoritative validation did not return pass');

  const policyReusable = controlReady && !provider.hit && check?.status === 'SAME_OBSERVED';
  const reuseWouldMatchValidation = policyReusable ? value === 'pass' : null;
  const protectedCall = controlReady && !provider.hit;
  const observeAfterBaseline = protectedCall && !policyReusable;

  let observeMs = 0;
  if (observeAfterBaseline) {
    const started = performance.now();
    try {
      await client.observe(fact, value, {
        // Constant role identity avoids manufacturing new observer independence
        // on every workflow run; CI and Client Wrappers remain two first-party roles.
        observerId: `gha-${role}`,
        idempotencyKey: `${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}-${role}`,
        evidenceFingerprint: sha256(`${coordinate}:pass`)
      });
    } catch {
      // Measurement must never turn a valid project test into a failure.
    } finally {
      observeMs = Math.max(0, performance.now() - started);
    }
  }

  // Provider-native hits and failed provider controls are upstream of SeenRelay
  // and therefore do not enter the protected-call ledger.
  const record = protectedCall ? buildRecord({
    checkStatus: check?.status ?? null,
    policyReusable,
    reuseWouldMatchValidation,
    validationMs,
    checkMs,
    observeMs,
    observeAfterBaseline
  }) : null;

  const ledger = buildLedger({ role, previousLedger: prior, provider, record, eligible });
  const evaluation = safeEvaluate(ledger);
  const benchmark = ledger.records.length > 0 ? buildHostileInput(ledger) : null;
  const measurement = Object.freeze({
    schema_version: 3,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    first_party: true,
    external_adoption_evidence: false,
    cost_unit: COST_UNIT,
    role,
    evidence_eligible: eligible,
    exclusion_reason: eligible ? null : eligibility.reason || 'ineligible',
    natural_event: eligible,
    protected_call: protectedCall,
    provider_native_control: Object.freeze({
      available: true,
      measured: provider.measured === true,
      query_ok: provider.measured === true ? provider.ok === true : null,
      hit: provider.hit === true,
      latency_ms: safeMs(provider.latency_ms)
    }),
    record,
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });
  const summary = Object.freeze({
    schema_version: 3,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    first_party: true,
    external_adoption_evidence: false,
    cost_unit: COST_UNIT,
    role,
    current_run_evidence_eligible: eligible,
    current_run_exclusion_reason: eligible ? null : eligibility.reason || 'ineligible',
    current_run_natural_events: eligible ? 1 : 0,
    current_run_protected_calls: protectedCall ? 1 : 0,
    cumulative_natural_events: ledger.natural_events,
    cumulative_protected_calls: ledger.protected_calls,
    preliminary_sample_floor_met: ledger.preliminary_sample_floor_met,
    provider_native_queries: ledger.control_evidence.provider_native_queries,
    provider_native_hits: ledger.control_evidence.provider_native_hits,
    provider_native_query_failures: ledger.control_evidence.provider_native_query_failures,
    evaluation_state: evaluation.state,
    evaluation_reason: evaluation.reason,
    previous_v1_evidence_carried_forward: false,
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });

  if (writeFiles) {
    fs.writeFileSync(`${outputPrefix}-measurement.json`, `${JSON.stringify(measurement, null, 2)}\n`);
    fs.writeFileSync(`${outputPrefix}-ledger.json`, `${JSON.stringify(ledger, null, 2)}\n`);
    fs.writeFileSync(`${outputPrefix}-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
    if (benchmark) fs.writeFileSync(`${outputPrefix}-benchmark.json`, `${JSON.stringify(benchmark, null, 2)}\n`);
    if (evaluation.report) fs.writeFileSync(`${outputPrefix}-evaluation.json`, `${JSON.stringify(evaluation.report, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify({
    event: 'fleet_wrapper_shadow',
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    role,
    evidence_eligible: eligible,
    exclusion_reason: eligible ? null : eligibility.reason || 'ineligible',
    provider_native_hit: provider.hit,
    provider_native_query_ok: provider.measured === true ? provider.ok === true : null,
    protected_call: protectedCall,
    check_status: check?.status ?? null,
    policy_reusable: policyReusable,
    cumulative_protected_calls: ledger.protected_calls,
    validation_ms: Number(validationMs.toFixed(3)),
    check_ms: Number(checkMs.toFixed(3)),
    observe_ms: Number(observeMs.toFixed(3))
  })}\n`);

  return Object.freeze({ measurement, ledger, benchmark, evaluation, summary });
}

function readPreviousLedger(path) {
  if (!path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const previousLedger = readPreviousLedger(process.env.FLEET_SHADOW_PREVIOUS_LEDGER || '');
  await runFleetWrapperShadow({ previousLedger, writeFiles: true });
}
