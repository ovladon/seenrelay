import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { evaluateHostileBenchmark } from './evaluate-hostile-benchmark.mjs';
import { WORKLOAD_ID, WORKLOAD_CLASS, COST_UNIT } from './fleet-wrapper-shadow.mjs';

const REQUIRED_ROLES = Object.freeze(['ci', 'client-wrappers']);
const RECORD_KEYS = Object.freeze([
  'check_status', 'policy_reusable', 'reuse_would_match_validation', 'observe_after_baseline',
  'baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost'
]);

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}

function sanitizedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('fleet record must be an object');
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || !RECORD_KEYS.every((key) => keys.includes(key))) {
    throw new TypeError('fleet record contains non-sanitized fields');
  }
  return Object.fromEntries(RECORD_KEYS.map((key) => [key, record[key]]));
}

function validateLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) throw new TypeError('fleet ledger must be an object');
  if (ledger.workload_id !== WORKLOAD_ID || ledger.workload_class !== WORKLOAD_CLASS || ledger.cost_unit !== COST_UNIT) {
    throw new TypeError('fleet ledger identity is incompatible');
  }
  if (!REQUIRED_ROLES.includes(ledger.role)) throw new TypeError(`unexpected fleet ledger role: ${ledger.role}`);
  if (!Array.isArray(ledger.records)) throw new TypeError('fleet ledger records must be an array');
  for (const flag of ['raw_values_retained', 'fact_identity_retained', 'sources_retained', 'timestamps_retained']) {
    if (ledger[flag] !== false) throw new TypeError(`fleet ledger privacy flag ${flag} must be false`);
  }
  const control = ledger.control_evidence;
  if (!control || typeof control !== 'object' || Array.isArray(control)) throw new TypeError('fleet ledger control_evidence is required');
  return Object.freeze({
    role: ledger.role,
    natural_events: nonNegativeInteger(ledger.natural_events, 'natural_events'),
    records_dropped: nonNegativeInteger(ledger.records_dropped, 'records_dropped'),
    provider_native_queries: nonNegativeInteger(control.provider_native_queries, 'provider_native_queries'),
    provider_native_hits: nonNegativeInteger(control.provider_native_hits, 'provider_native_hits'),
    provider_native_query_failures: nonNegativeInteger(control.provider_native_query_failures, 'provider_native_query_failures'),
    records: Object.freeze(ledger.records.map(sanitizedRecord))
  });
}

function hostileInput(records) {
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
    records: Object.freeze(records.map((record) => Object.freeze({ ...record })))
  });
}

export function combineFleetLedgers(inputLedgers) {
  if (!Array.isArray(inputLedgers) || inputLedgers.length !== REQUIRED_ROLES.length) {
    throw new TypeError('exactly two fleet role ledgers are required');
  }
  const ledgers = inputLedgers.map(validateLedger);
  const roles = ledgers.map((ledger) => ledger.role).sort();
  if (new Set(roles).size !== REQUIRED_ROLES.length || roles.join(',') !== [...REQUIRED_ROLES].sort().join(',')) {
    throw new TypeError('fleet role ledgers must contain exactly CI and Client Wrappers once each');
  }

  const records = ledgers.flatMap((ledger) => ledger.records);
  const recordsDropped = ledgers.reduce((sum, ledger) => sum + ledger.records_dropped, 0);
  const naturalEvents = ledgers.reduce((sum, ledger) => sum + ledger.natural_events, 0);
  const providerQueries = ledgers.reduce((sum, ledger) => sum + ledger.provider_native_queries, 0);
  const providerHits = ledgers.reduce((sum, ledger) => sum + ledger.provider_native_hits, 0);
  const providerFailures = ledgers.reduce((sum, ledger) => sum + ledger.provider_native_query_failures, 0);

  const combinedLedger = Object.freeze({
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    roles: Object.freeze([...REQUIRED_ROLES]),
    cost_unit: COST_UNIT,
    natural_events: naturalEvents,
    protected_calls: records.length,
    records_dropped: recordsDropped,
    preliminary_sample_floor_met: records.length >= 100,
    control_evidence: Object.freeze({
      provider_native_queries: providerQueries,
      provider_native_hits: providerHits,
      provider_native_query_failures: providerFailures
    }),
    records: Object.freeze(records),
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });

  let benchmark = null;
  let evaluation = null;
  let evaluationState = 'incomplete';
  let evaluationReason = records.length === 0 ? 'no_protected_calls' : null;
  if (records.length > 0 && recordsDropped === 0) {
    benchmark = hostileInput(records);
    evaluation = evaluateHostileBenchmark(benchmark);
    evaluationState = 'complete';
  } else if (recordsDropped > 0) {
    evaluationReason = 'ledger_overflow';
  }

  const summary = Object.freeze({
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    first_party: true,
    external_adoption_evidence: false,
    cost_unit: COST_UNIT,
    role_count: REQUIRED_ROLES.length,
    cumulative_natural_events: naturalEvents,
    cumulative_protected_calls: records.length,
    preliminary_sample_floor_met: records.length >= 100,
    provider_native_queries: providerQueries,
    provider_native_hits: providerHits,
    provider_native_hit_rate: providerQueries > 0 ? providerHits / providerQueries : null,
    provider_native_query_failures: providerFailures,
    evaluation_state: evaluationState,
    evaluation_reason: evaluationReason,
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });

  return Object.freeze({ ledger: combinedLedger, benchmark, evaluation, summary });
}

function readLedger(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [ciPath, clientPath] = process.argv.slice(2);
  if (!ciPath || !clientPath) {
    console.error('Usage: node scripts/evaluate-fleet-wrapper-ledgers.mjs <ci-ledger.json> <client-wrappers-ledger.json>');
    process.exitCode = 2;
  } else {
    const result = combineFleetLedgers([readLedger(ciPath), readLedger(clientPath)]);
    fs.writeFileSync('fleet-wrapper-natural-ledger.json', `${JSON.stringify(result.ledger, null, 2)}\n`);
    fs.writeFileSync('fleet-wrapper-natural-summary.json', `${JSON.stringify(result.summary, null, 2)}\n`);
    if (result.benchmark) fs.writeFileSync('fleet-wrapper-natural-benchmark.json', `${JSON.stringify(result.benchmark, null, 2)}\n`);
    if (result.evaluation) fs.writeFileSync('fleet-wrapper-natural-evaluation.json', `${JSON.stringify(result.evaluation, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result.summary)}\n`);
  }
}
