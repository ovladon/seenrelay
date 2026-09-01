import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { SeenRelayClient } from '../clients/typescript/dist/seenrelay.js';

export const WORKLOAD_ID = 'wrapper-deterministic-suite-fleet-v1';
export const WORKLOAD_CLASS = 'fleet_tool_validations';
export const COST_UNIT = 'github_actions_runner_ms';
export const TARGET_TESTS = Object.freeze([
  'tests/client-wrappers.test.mjs',
  'tests/shadow-proof.test.mjs',
  'tests/deferred-observe.test.mjs'
]);

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_ROLES = new Set(['ci', 'client-wrappers', 'test']);

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

function suiteDigest() {
  const material = TARGET_TESTS.map((path) => `${path}\n${fs.readFileSync(path, 'utf8')}`).join('\n--seenrelay-suite-file--\n');
  return sha256(material);
}

export function buildFleetCoordinate({ headSha, baseSha, nodeVersion = process.version, platform = process.platform, arch = process.arch } = {}) {
  if (!headSha || !baseSha) throw new TypeError('headSha and baseSha are required');
  return sha256(stableJson({
    workload: WORKLOAD_ID,
    head_sha: headSha,
    base_sha: baseSha,
    node_version: nodeVersion,
    platform,
    arch,
    suite_digest: suiteDigest()
  }));
}

export function buildFleetFact({ headSha, baseSha, coordinate }) {
  return Object.freeze({
    subject: 'SeenRelay deterministic JavaScript wrapper suite',
    predicate: 'validation.pass.current',
    source: `https://github.com/ovladon/seenrelay/commit/${encodeURIComponent(headSha)}?base=${encodeURIComponent(baseSha)}&seenrelay_internal_benchmark=fleet_wrapper_js_v1`,
    locator: { scheme: 'source_key', value: coordinate }
  });
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

export function buildSanitizedMeasurement({
  role,
  provider,
  checkStatus,
  policyReusable,
  reuseWouldMatchValidation,
  validationMs,
  checkMs,
  observeMs,
  observeAfterBaseline
}) {
  return Object.freeze({
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    first_party: true,
    external_adoption_evidence: false,
    cost_unit: COST_UNIT,
    role,
    provider_native_control: Object.freeze({
      available: true,
      measured: true,
      query_ok: provider.ok === true,
      hit: provider.hit === true,
      latency_ms: safeMs(provider.latency_ms)
    }),
    record: Object.freeze({
      check_status: checkStatus ?? null,
      policy_reusable: policyReusable === true,
      reuse_would_match_validation: policyReusable === true ? reuseWouldMatchValidation === true : null,
      observe_after_baseline: observeAfterBaseline === true,
      direct_validation_ms: safeMs(validationMs),
      check_ms: safeMs(checkMs),
      observe_ms: safeMs(observeMs)
    }),
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });
}

export async function runFleetWrapperShadow({
  role = process.env.SEENRELAY_FLEET_ROLE || 'test',
  headSha = process.env.SEENRELAY_FLEET_HEAD_SHA || process.env.GITHUB_SHA || 'local-head',
  baseSha = process.env.SEENRELAY_FLEET_BASE_SHA || process.env.GITHUB_SHA || 'local-base',
  origin = process.env.SEENRELAY_ORIGIN || 'https://seenrelay.com',
  outputPath = process.env.FLEET_SHADOW_OUTPUT || `fleet-wrapper-shadow-${role}.json`,
  fetchImpl = fetch,
  validate = runTargetSuite
} = {}) {
  if (!ALLOWED_ROLES.has(role)) throw new TypeError(`unsupported fleet role: ${role}`);
  const coordinate = buildFleetCoordinate({ headSha, baseSha });
  const fact = buildFleetFact({ headSha, baseSha, coordinate });

  // GitHub's own successful counterpart workflow is a stronger provider-native
  // result cache and must be measured before optional shared CHECK.
  const provider = await measureProviderNativeControl({ role, headSha, baseSha, fetchImpl });

  const client = new SeenRelayClient({
    baseUrl: origin,
    clientHint: `seenrelay-internal-fleet-wrapper-${role}`,
    fetchImpl,
    checkTimeoutMs: 1500,
    observeTimeoutMs: 1000
  });

  let check = null;
  let checkMs = 0;
  if (!provider.hit) {
    const started = performance.now();
    try {
      check = await client.check(fact, 'pass', MAX_AGE_SECONDS);
    } catch {
      check = null;
    } finally {
      checkMs = Math.max(0, performance.now() - started);
    }
  }

  const validationStarted = performance.now();
  const value = await validate();
  const validationMs = Math.max(0, performance.now() - validationStarted);
  if (value !== 'pass') throw new Error('fleet wrapper authoritative validation did not return pass');

  const policyReusable = !provider.hit && check?.status === 'SAME_OBSERVED';
  const reuseWouldMatchValidation = policyReusable ? value === 'pass' : null;

  // Do not manufacture relay evidence: an active provider-cache hit or shared
  // reuse would not independently validate, so neither may create OBSERVE.
  const observeAfterBaseline = !provider.hit && !policyReusable;
  let observeMs = 0;
  if (observeAfterBaseline) {
    const started = performance.now();
    try {
      await client.observe(fact, value, {
        observerId: `gha-${role}`,
        idempotencyKey: `${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}-${role}`,
        evidenceFingerprint: sha256(`${coordinate}:pass`)
      });
    } catch {
      // Benchmark traffic must never turn a valid project test into a failure.
    } finally {
      observeMs = Math.max(0, performance.now() - started);
    }
  }

  const measurement = buildSanitizedMeasurement({
    role,
    provider,
    checkStatus: check?.status ?? null,
    policyReusable,
    reuseWouldMatchValidation,
    validationMs,
    checkMs,
    observeMs,
    observeAfterBaseline
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(measurement, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    event: 'fleet_wrapper_shadow',
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    role,
    provider_native_hit: provider.hit,
    check_status: check?.status ?? null,
    policy_reusable: policyReusable,
    validation_ms: Number(validationMs.toFixed(3)),
    check_ms: Number(checkMs.toFixed(3)),
    observe_ms: Number(observeMs.toFixed(3))
  })}\n`);
  return measurement;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runFleetWrapperShadow();
}
