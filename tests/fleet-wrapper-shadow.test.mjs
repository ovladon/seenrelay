import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TARGET_TESTS,
  VALIDATION_INPUTS,
  WORKLOAD_ID,
  WORKLOAD_CLASS,
  COST_UNIT,
  validationInputDigest,
  buildFleetCoordinate,
  buildFleetFact,
  fleetEvidenceEligibility,
  measureProviderNativeControl,
  runFleetWrapperShadow
} from '../scripts/fleet-wrapper-shadow.mjs';
import { structuralRemainder } from '../scripts/run-structural-remainder.mjs';

const ELIGIBLE = Object.freeze({ eligible: true, reason: null });
const allowedRecordKeys = new Set([
  'check_status', 'policy_reusable', 'reuse_would_match_validation', 'observe_after_baseline',
  'baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost'
]);

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function providerRun(head = 'head', base = 'base') {
  return {
    conclusion: 'success',
    head_sha: head,
    pull_requests: [{ head: { sha: head }, base: { sha: base } }]
  };
}

function mockFetch({ providerHit = false, checkStatus = 'UNKNOWN', onObserve = () => {} } = {}) {
  return async (input) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/')) {
      return response({ workflow_runs: providerHit ? [providerRun()] : [] });
    }
    if (url.endsWith('/v1/check')) return response({ status: checkStatus });
    if (url.endsWith('/v1/observe')) {
      onObserve();
      return response({ accepted: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

test('fleet v2 coordinate covers effective validation inputs and resets v1 identity', () => {
  assert.equal(WORKLOAD_ID, 'wrapper-deterministic-suite-fleet-v2');
  assert.deepEqual(TARGET_TESTS, [
    'tests/client-wrappers.test.mjs',
    'tests/shadow-proof.test.mjs',
    'tests/deferred-observe.test.mjs'
  ]);
  for (const required of [
    'clients/typescript/dist/seenrelay.js',
    'clients/typescript/dist/shadow-proof.js',
    'clients/typescript/package.json',
    'clients/python/pyproject.toml',
    'clients/LICENSE'
  ]) assert.ok(VALIDATION_INPUTS.includes(required));

  const firstDigest = validationInputDigest({ readFile: (path) => `bytes:${path}` });
  const secondDigest = validationInputDigest({ readFile: (path) => path.endsWith('seenrelay.js') ? `changed:${path}` : `bytes:${path}` });
  assert.notEqual(firstDigest, secondDigest);

  const a = buildFleetCoordinate({ inputDigest: firstDigest, nodeVersion: 'v22.0.0', platform: 'linux', arch: 'x64', imageOS: 'ubuntu24', imageVersion: '1' });
  const b = buildFleetCoordinate({ inputDigest: firstDigest, nodeVersion: 'v22.0.0', platform: 'linux', arch: 'x64', imageOS: 'ubuntu24', imageVersion: '1' });
  const c = buildFleetCoordinate({ inputDigest: firstDigest, nodeVersion: 'v22.0.1', platform: 'linux', arch: 'x64', imageOS: 'ubuntu24', imageVersion: '1' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);

  const fact = buildFleetFact({ coordinate: a });
  assert.match(fact.source, /seenrelay_internal_benchmark=fleet_wrapper_js_v2/);
  assert.equal(fact.locator.value, a);
  assert.doesNotMatch(fact.source, /head|base/);
});

test('only non-commissioning pull requests are evidence eligible', () => {
  assert.deepEqual(fleetEvidenceEligibility({ eventName: 'push', branchName: 'main' }), {
    eligible: false,
    reason: 'non_pull_request_event'
  });
  assert.deepEqual(fleetEvidenceEligibility({ eventName: 'pull_request', branchName: 'research/fleet-v2-frozen-evidence' }), {
    eligible: false,
    reason: 'commissioning_branch'
  });
  assert.deepEqual(fleetEvidenceEligibility({ eventName: 'pull_request', branchName: 'verify/fleet-probe' }), {
    eligible: false,
    reason: 'commissioning_branch'
  });
  assert.deepEqual(fleetEvidenceEligibility({ eventName: 'pull_request', branchName: 'feature/ordinary-product-change' }), {
    eligible: true,
    reason: null
  });
});

test('commissioning run executes authoritative suite with zero network and zero evidence', async () => {
  let validations = 0;
  const result = await runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    eligibility: { eligible: false, reason: 'commissioning_branch' },
    fetchImpl: async () => assert.fail('ineligible commissioning run must not make network requests'),
    validate: async () => { validations += 1; return 'pass'; }
  });

  assert.equal(validations, 1);
  assert.equal(result.measurement.evidence_eligible, false);
  assert.equal(result.measurement.exclusion_reason, 'commissioning_branch');
  assert.equal(result.measurement.natural_event, false);
  assert.equal(result.measurement.protected_call, false);
  assert.equal(result.measurement.record, null);
  assert.equal(result.measurement.provider_native_control.measured, false);
  assert.equal(result.ledger.natural_events, 0);
  assert.equal(result.ledger.protected_calls, 0);
  assert.equal(result.ledger.control_evidence.provider_native_queries, 0);
  assert.equal(result.summary.current_run_natural_events, 0);
  assert.equal(result.summary.previous_v1_evidence_carried_forward, false);
});

test('v1 commissioning ledger is discarded rather than carried into v2', async () => {
  const v1 = {
    schema_version: 1,
    workload_id: 'wrapper-deterministic-suite-fleet-v1',
    workload_class: WORKLOAD_CLASS,
    role: 'ci',
    cost_unit: COST_UNIT,
    natural_events: 99,
    protected_calls: 98,
    records_dropped: 0,
    control_evidence: { provider_native_queries: 99, provider_native_hits: 1, provider_native_query_failures: 0 },
    records: []
  };
  const result = await runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    previousLedger: v1,
    eligibility: { eligible: false, reason: 'commissioning_branch' },
    fetchImpl: async () => assert.fail('v1 reset commissioning run must not use network'),
    validate: async () => 'pass'
  });
  assert.equal(result.ledger.natural_events, 0);
  assert.equal(result.ledger.protected_calls, 0);
  assert.equal(result.ledger.records.length, 0);
  assert.equal(result.summary.previous_v1_evidence_carried_forward, false);
});

test('provider-native success on exact PR head/base is measured as an upstream hit', async () => {
  const result = await measureProviderNativeControl({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    fetchImpl: async () => response({ workflow_runs: [providerRun()] })
  });
  assert.equal(result.available, true);
  assert.equal(result.measured, true);
  assert.equal(result.ok, true);
  assert.equal(result.hit, true);
  assert.ok(result.latency_ms >= 0);
});

test('provider-control failure cannot create CHECK, OBSERVE, or protected evidence', async () => {
  let validations = 0;
  let relayRequests = 0;
  const result = await runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    eligibility: ELIGIBLE,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.github.com/')) return response({ error: 'temporary' }, 503);
      relayRequests += 1;
      return response({ status: 'SAME_OBSERVED' });
    },
    validate: async () => { validations += 1; return 'pass'; }
  });

  assert.equal(validations, 1);
  assert.equal(relayRequests, 0);
  assert.equal(result.measurement.evidence_eligible, true);
  assert.equal(result.measurement.provider_native_control.measured, true);
  assert.equal(result.measurement.provider_native_control.query_ok, false);
  assert.equal(result.measurement.protected_call, false);
  assert.equal(result.measurement.record, null);
  assert.equal(result.ledger.natural_events, 1);
  assert.equal(result.ledger.protected_calls, 0);
  assert.equal(result.ledger.control_evidence.provider_native_queries, 1);
  assert.equal(result.ledger.control_evidence.provider_native_query_failures, 1);
});

test('eligible provider-native hit bypasses CHECK and OBSERVE but authoritative shadow validation still runs', async () => {
  let validations = 0;
  const result = await runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    eligibility: ELIGIBLE,
    fetchImpl: mockFetch({ providerHit: true, onObserve: () => assert.fail('provider hit must not OBSERVE') }),
    validate: async () => { validations += 1; return 'pass'; }
  });

  assert.equal(validations, 1);
  assert.equal(result.measurement.evidence_eligible, true);
  assert.equal(result.measurement.protected_call, false);
  assert.equal(result.measurement.record, null);
  assert.equal(result.ledger.natural_events, 1);
  assert.equal(result.ledger.protected_calls, 0);
  assert.equal(result.ledger.control_evidence.provider_native_hits, 1);
  assert.equal(result.summary.cumulative_protected_calls, 0);
  assert.equal(result.summary.evaluation_state, 'incomplete');
  assert.equal(result.summary.evaluation_reason, 'no_protected_calls');
});

test('eligible SAME_OBSERVED remains shadow-only and is compared against authoritative suite result', async () => {
  let validations = 0;
  let observes = 0;
  const result = await runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    eligibility: ELIGIBLE,
    fetchImpl: mockFetch({ providerHit: false, checkStatus: 'SAME_OBSERVED', onObserve: () => { observes += 1; } }),
    validate: async () => { validations += 1; return 'pass'; }
  });

  assert.equal(validations, 1, 'shadow collection must never suppress the existing test suite');
  assert.equal(observes, 0, 'hypothetical reuse must not manufacture a new observation');
  assert.equal(result.measurement.protected_call, true);
  assert.equal(result.measurement.record.policy_reusable, true);
  assert.equal(result.measurement.record.reuse_would_match_validation, true);
  assert.equal(result.measurement.record.observe_after_baseline, false);
  assert.equal(result.ledger.records.length, 1);
  assert.equal(result.evaluation.report?.safety?.pass, true);
});

test('eligible UNKNOWN validates authoritatively and only then contributes first-party evidence', async () => {
  let observes = 0;
  const result = await runFleetWrapperShadow({
    role: 'client-wrappers',
    headSha: 'head',
    baseSha: 'base',
    eligibility: ELIGIBLE,
    fetchImpl: mockFetch({ providerHit: false, checkStatus: 'UNKNOWN', onObserve: () => { observes += 1; } }),
    validate: async () => 'pass'
  });

  assert.equal(observes, 1);
  assert.equal(result.measurement.protected_call, true);
  assert.equal(result.measurement.record.check_status, 'UNKNOWN');
  assert.equal(result.measurement.record.policy_reusable, false);
  assert.equal(result.measurement.record.observe_after_baseline, true);
  assert.equal(result.measurement.external_adoption_evidence, false);
  assert.equal(result.ledger.cost_unit, COST_UNIT);
  for (const key of Object.keys(result.measurement.record)) assert.ok(allowedRecordKeys.has(key), `unexpected record key: ${key}`);
  for (const object of [result.measurement, result.ledger, result.summary]) {
    assert.equal(object.raw_values_retained, false);
    assert.equal(object.fact_identity_retained, false);
    assert.equal(object.sources_retained, false);
    assert.equal(object.timestamps_retained, false);
  }
});

test('same-generation prior ledger cannot smuggle source, fact identity, value, or timestamp fields', async () => {
  const badLedger = {
    schema_version: 2,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    role: 'ci',
    cost_unit: COST_UNIT,
    natural_events: 1,
    protected_calls: 1,
    records_dropped: 0,
    control_evidence: { provider_native_queries: 1, provider_native_hits: 0, provider_native_query_failures: 0 },
    records: [{
      check_status: 'UNKNOWN', policy_reusable: false, reuse_would_match_validation: null,
      observe_after_baseline: true, baseline_ms: 1, baseline_cost: 1, check_ms: 1,
      observe_ms: 1, check_cost: 1, observe_cost: 1, source: 'must-not-survive'
    }]
  };

  await assert.rejects(runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    eligibility: ELIGIBLE,
    previousLedger: badLedger,
    fetchImpl: mockFetch({ providerHit: true }),
    validate: async () => 'pass'
  }), /non-sanitized fields/);
});

test('protected-call totals remain cumulative when retained v2 ledger reaches its cap', async () => {
  const record = {
    check_status: 'UNKNOWN', policy_reusable: false, reuse_would_match_validation: null,
    observe_after_baseline: true, baseline_ms: 1, baseline_cost: 1, check_ms: 1,
    observe_ms: 1, check_cost: 1, observe_cost: 1
  };
  const previousLedger = {
    schema_version: 2,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    role: 'ci',
    cost_unit: COST_UNIT,
    natural_events: 1000,
    protected_calls: 1000,
    records_dropped: 0,
    control_evidence: { provider_native_queries: 1000, provider_native_hits: 0, provider_native_query_failures: 0 },
    records: Array.from({ length: 1000 }, () => ({ ...record }))
  };

  const result = await runFleetWrapperShadow({
    role: 'ci',
    headSha: 'head',
    baseSha: 'base',
    eligibility: ELIGIBLE,
    previousLedger,
    fetchImpl: mockFetch({ providerHit: false, checkStatus: 'UNKNOWN' }),
    validate: async () => 'pass'
  });

  assert.equal(result.ledger.records.length, 1000);
  assert.equal(result.ledger.records_dropped, 1);
  assert.equal(result.ledger.protected_calls, 1001);
  assert.equal(result.summary.cumulative_protected_calls, 1001);
  assert.equal(result.ledger.preliminary_sample_floor_met, true);
  assert.equal(result.summary.evaluation_state, 'incomplete');
  assert.equal(result.summary.evaluation_reason, 'ledger_overflow');
});

test('CI structural remainder excludes exactly fleet target files instead of rerunning them', () => {
  const all = fs.readdirSync('tests', { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => `tests/${entry.name}`)
    .sort();
  const remainder = structuralRemainder();
  for (const target of TARGET_TESTS) assert.ok(!remainder.includes(target), `${target} would be duplicated`);
  assert.deepEqual([...new Set([...TARGET_TESTS, ...remainder])].sort(), all);
});
