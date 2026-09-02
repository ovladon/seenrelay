import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKLOAD_ID = 'standards-watch-daily-v1';
const WORKLOAD_CLASS = 'structured_source_reads';
const COLLECTION_EPOCH = 'schedule-only-v2';
const MAX_LEDGER_RECORDS = 1000;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const RECORD_KEYS = Object.freeze([
  'check_status', 'policy_reusable', 'reuse_would_match_validation', 'observe_after_baseline',
  'baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost'
]);
const CONTROL_KEYS = Object.freeze([
  'validator_available_calls', 'conditional_attempts', 'conditional_304_confirmations'
]);

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
function fp(value) {
  return `sha256:${sha256(value)}`;
}
function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number in evidence');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  throw new TypeError('unsupported evidence value');
}
function fingerprint(value) {
  return fp(stable(value));
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
}
function safeId(value, name) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new TypeError(`${name} must be a bounded opaque id`);
  return value;
}
function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}
function nonNegativeNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a finite non-negative number`);
  return value;
}
function same(a, b) {
  return stable(a) === stable(b);
}
function assertRecord(record, index, label) {
  object(record, `${label}.records[${index}]`);
  const keys = Object.keys(record).sort();
  const expected = [...RECORD_KEYS].sort();
  if (keys.length !== expected.length || expected.some((key, i) => keys[i] !== key)) {
    throw new TypeError(`${label}.records[${index}] violates sanitized record contract`);
  }
  for (const key of ['baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost']) {
    nonNegativeNumber(record[key], `${label}.records[${index}].${key}`);
  }
  if (typeof record.policy_reusable !== 'boolean') throw new TypeError(`${label}.records[${index}].policy_reusable must be boolean`);
  if (![true, false, null].includes(record.reuse_would_match_validation)) throw new TypeError(`${label}.records[${index}].reuse_would_match_validation invalid`);
  if (typeof record.observe_after_baseline !== 'boolean') throw new TypeError(`${label}.records[${index}].observe_after_baseline must be boolean`);
  if (typeof record.check_status !== 'string' || !record.check_status) throw new TypeError(`${label}.records[${index}].check_status must be non-empty string`);
}
function provenance(doc, label) {
  object(doc, label);
  if (doc.provenance_schema_version !== 2) throw new TypeError(`${label} requires provenance_schema_version=2`);
  if (doc.collection_epoch !== COLLECTION_EPOCH) throw new TypeError(`${label} must belong to ${COLLECTION_EPOCH}`);
  if (doc.sample_type !== 'natural_workload') throw new TypeError(`${label} must be natural_workload evidence`);
  if (doc.run_event !== 'schedule') throw new TypeError(`${label} must have run_event=schedule`);
  if (doc.workload_id !== WORKLOAD_ID) throw new TypeError(`${label}.workload_id mismatch`);
  const runId = safeId(doc.run_id, `${label}.run_id`);
  const parentRunId = doc.parent_run_id === null ? null : safeId(doc.parent_run_id, `${label}.parent_run_id`);
  return { runId, parentRunId };
}
function controls(input, label) {
  const controlsObject = object(input.controls, `${label}.controls`);
  for (const name of ['local_cache', 'source_native_conditional', 'provider_native_cache']) {
    const control = object(controlsObject[name], `${label}.controls.${name}`);
    if (typeof control.available !== 'boolean' || typeof control.measured !== 'boolean') {
      throw new TypeError(`${label}.controls.${name} must expose boolean available/measured`);
    }
  }
  return controlsObject;
}
function counters(ledger, label) {
  const evidence = object(ledger.control_evidence, `${label}.control_evidence`);
  const out = {};
  for (const key of CONTROL_KEYS) out[key] = nonNegativeInteger(evidence[key], `${label}.control_evidence.${key}`);
  return out;
}
function summaryDeltas(summary, label) {
  return {
    validator_available_calls: nonNegativeInteger(summary.source_native_validator_available_count, `${label}.source_native_validator_available_count`),
    conditional_attempts: nonNegativeInteger(summary.source_native_conditional_attempt_count, `${label}.source_native_conditional_attempt_count`),
    conditional_304_confirmations: nonNegativeInteger(summary.source_native_conditional_304_count, `${label}.source_native_conditional_304_count`)
  };
}
function assertState(state, label) {
  if (state.schema_version !== 1) throw new TypeError(`${label}.schema_version must be 1`);
  if (state.raw_values_retained !== false || state.sources_retained !== false) throw new TypeError(`${label} privacy flags must remain false`);
  const entries = object(state.entries, `${label}.entries`);
  for (const [key, entryRaw] of Object.entries(entries)) {
    safeId(key, `${label}.entries key`);
    const entry = object(entryRaw, `${label}.entries.${key}`);
    if (typeof entry.value_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(entry.value_fingerprint)) {
      throw new TypeError(`${label}.entries.${key}.value_fingerprint must be 64 lowercase hex`);
    }
    if (entry.validator !== null && entry.validator !== undefined) {
      const validator = object(entry.validator, `${label}.entries.${key}.validator`);
      if (!['etag', 'last_modified'].includes(validator.kind)) throw new TypeError(`${label}.entries.${key}.validator.kind invalid`);
      if (typeof validator.value !== 'string' || !validator.value || validator.value.length > 4096 || /[\r\n]/.test(validator.value)) {
        throw new TypeError(`${label}.entries.${key}.validator.value invalid`);
      }
    }
  }
}
function stateEvidenceEnvelope(state) {
  const entries = {};
  for (const key of Object.keys(state.entries).sort()) {
    const entry = state.entries[key];
    entries[key] = {
      value_fingerprint: entry.value_fingerprint,
      validator_kind: entry.validator?.kind ?? null
    };
  }
  return {
    schema_version: state.schema_version,
    workload_id: state.workload_id,
    provenance_schema_version: state.provenance_schema_version,
    collection_epoch: state.collection_epoch,
    sample_type: state.sample_type,
    run_event: state.run_event,
    run_id: state.run_id,
    parent_run_id: state.parent_run_id,
    raw_values_retained: state.raw_values_retained,
    sources_retained: state.sources_retained,
    entries
  };
}

function assertBundle(bundleRaw, index) {
  const bundle = object(bundleRaw, `bundles[${index}]`);
  const benchmark = object(bundle.benchmark, `bundles[${index}].benchmark`);
  const summary = object(bundle.summary, `bundles[${index}].summary`);
  const state = object(bundle.state, `bundles[${index}].state`);
  const ledger = object(bundle.ledger, `bundles[${index}].ledger`);
  const docs = [
    ['benchmark', benchmark], ['summary', summary], ['state', state], ['ledger', ledger]
  ];
  const provenances = docs.map(([name, doc]) => provenance(doc, `bundles[${index}].${name}`));
  const { runId, parentRunId } = provenances[0];
  for (let i = 1; i < provenances.length; i += 1) {
    if (provenances[i].runId !== runId || provenances[i].parentRunId !== parentRunId) {
      throw new TypeError(`bundles[${index}] documents disagree on run lineage`);
    }
  }

  if (benchmark.schema_version !== 2) throw new TypeError(`bundles[${index}].benchmark.schema_version must be 2`);
  if (benchmark.workload_class !== WORKLOAD_CLASS) throw new TypeError(`bundles[${index}].benchmark.workload_class mismatch`);
  if (benchmark.baseline_definition !== 'best_existing_non_shared_path') throw new TypeError(`bundles[${index}].benchmark baseline mismatch`);
  if (!Array.isArray(benchmark.records)) throw new TypeError(`bundles[${index}].benchmark.records must be array`);
  benchmark.records.forEach((record, recordIndex) => assertRecord(record, recordIndex, `bundles[${index}].benchmark`));
  const inputControls = controls(benchmark, `bundles[${index}].benchmark`);

  if (summary.schema_version !== 2) throw new TypeError(`bundles[${index}].summary.schema_version must be 2`);
  if (summary.workload_class !== WORKLOAD_CLASS) throw new TypeError(`bundles[${index}].summary.workload_class mismatch`);
  if (summary.first_party !== true || summary.external_adoption_evidence !== false) throw new TypeError(`bundles[${index}].summary source classification mismatch`);
  if (summary.observe_requests_sent !== 0) throw new TypeError(`bundles[${index}].summary must remain CHECK-only`);
  const currentRunRecords = nonNegativeInteger(summary.current_run_benchmark_records, `bundles[${index}].summary.current_run_benchmark_records`);
  const cumulativeRecords = nonNegativeInteger(summary.cumulative_benchmark_records, `bundles[${index}].summary.cumulative_benchmark_records`);
  if (summary.preliminary_sample_floor_met !== (cumulativeRecords >= 100)) throw new TypeError(`bundles[${index}].summary sample-floor flag mismatch`);
  const deltas = summaryDeltas(summary, `bundles[${index}].summary`);

  assertState(state, `bundles[${index}].state`);

  if (ledger.schema_version !== 1) throw new TypeError(`bundles[${index}].ledger.schema_version must be 1`);
  if (ledger.workload_class !== WORKLOAD_CLASS) throw new TypeError(`bundles[${index}].ledger.workload_class mismatch`);
  if (ledger.natural_schedule !== 'daily') throw new TypeError(`bundles[${index}].ledger.natural_schedule must be daily`);
  if (ledger.raw_values_retained !== false || ledger.fact_identity_retained !== false || ledger.sources_retained !== false || ledger.timestamps_retained !== false) {
    throw new TypeError(`bundles[${index}].ledger privacy flags must remain false`);
  }
  if (!Array.isArray(ledger.records)) throw new TypeError(`bundles[${index}].ledger.records must be array`);
  ledger.records.forEach((record, recordIndex) => assertRecord(record, recordIndex, `bundles[${index}].ledger`));
  if (!same(benchmark.records, ledger.records)) throw new TypeError(`bundles[${index}] benchmark and ledger records differ`);
  if (cumulativeRecords !== ledger.records.length) throw new TypeError(`bundles[${index}] cumulative record count mismatch`);
  const controlEvidence = counters(ledger, `bundles[${index}].ledger`);
  const sourceNative = inputControls.source_native_conditional;
  if (sourceNative.available !== (controlEvidence.validator_available_calls > 0)) throw new TypeError(`bundles[${index}] source-native availability disagrees with control evidence`);
  if (sourceNative.measured !== (controlEvidence.conditional_attempts > 0)) throw new TypeError(`bundles[${index}] source-native measurement disagrees with control evidence`);

  return Object.freeze({
    runId, parentRunId, benchmark, summary, state, ledger,
    currentRunRecords, cumulativeRecords, deltas, controlEvidence,
    evidenceFingerprint: fingerprint({ benchmark, summary, state: stateEvidenceEnvelope(state), ledger })
  });
}
function assertContinuity(previous, current, index) {
  if (current.parentRunId !== previous.runId) throw new TypeError(`bundles[${index}] parent_run_id does not match prior run_id`);
  if (current.currentRunRecords > MAX_LEDGER_RECORDS) throw new TypeError(`bundles[${index}] current run exceeds retained ledger capacity`);
  const expectedLength = Math.min(MAX_LEDGER_RECORDS, previous.ledger.records.length + current.currentRunRecords);
  if (current.ledger.records.length !== expectedLength) throw new TypeError(`bundles[${index}] retained ledger length breaks append continuity`);
  const carry = Math.min(previous.ledger.records.length, Math.max(0, MAX_LEDGER_RECORDS - current.currentRunRecords));
  const previousSuffix = previous.ledger.records.slice(previous.ledger.records.length - carry);
  const currentPrefix = current.ledger.records.slice(0, carry);
  if (!same(previousSuffix, currentPrefix)) throw new TypeError(`bundles[${index}] retained ledger does not continue prior records`);
  for (const key of CONTROL_KEYS) {
    const expected = previous.controlEvidence[key] + current.deltas[key];
    if (current.controlEvidence[key] !== expected) throw new TypeError(`bundles[${index}] control counter ${key} breaks monotonic delta continuity`);
  }
}

export function verifyStandardsShadowNaturalLineage(bundlesRaw) {
  if (!Array.isArray(bundlesRaw) || bundlesRaw.length === 0) throw new TypeError('bundles must be a non-empty array ordered root-to-head');
  const bundles = bundlesRaw.map(assertBundle);
  if (bundles[0].parentRunId !== null) throw new TypeError('root natural run must have parent_run_id=null');
  const runIds = new Set();
  let observedRecords = 0;
  for (let i = 0; i < bundles.length; i += 1) {
    const bundle = bundles[i];
    if (runIds.has(bundle.runId)) throw new TypeError(`duplicate run_id in lineage: ${bundle.runId}`);
    runIds.add(bundle.runId);
    observedRecords += bundle.currentRunRecords;
    if (i === 0) {
      if (bundle.currentRunRecords !== bundle.ledger.records.length) throw new TypeError('root current record count must equal retained ledger length');
      for (const key of CONTROL_KEYS) {
        if (bundle.controlEvidence[key] !== bundle.deltas[key]) throw new TypeError(`root control counter ${key} must equal current-run delta`);
      }
    } else {
      assertContinuity(bundles[i - 1], bundle, i);
    }
  }

  const head = bundles.at(-1);
  const runEvidence = bundles.map((bundle) => Object.freeze({
    run_id: bundle.runId,
    parent_run_id: bundle.parentRunId,
    evidence_fingerprint: bundle.evidenceFingerprint
  }));
  const chainFingerprint = fingerprint({
    schema: 'seenrelay-standards-shadow-lineage-proof-v1',
    workload_id: WORKLOAD_ID,
    collection_epoch: COLLECTION_EPOCH,
    runs: runEvidence
  });

  return Object.freeze({
    schema: 'seenrelay-standards-shadow-lineage-proof-v1',
    verified: true,
    workload_id: WORKLOAD_ID,
    collection_epoch: COLLECTION_EPOCH,
    run_count: bundles.length,
    root_run_id: bundles[0].runId,
    head_run_id: head.runId,
    observed_record_count: observedRecords,
    retained_record_count: head.ledger.records.length,
    final_control_evidence: Object.freeze({ ...head.controlEvidence }),
    run_evidence: Object.freeze(runEvidence),
    lineage_proof_fingerprint: chainFingerprint,
    raw_values_retained: false,
    source_values_retained: false,
    interpretation: Object.freeze({
      schedule_only_lineage_verified_by_harness: true,
      ledger_continuity_verified_by_harness: true,
      control_counter_continuity_verified_by_harness: true,
      evaluation_in_lineage_scope: false,
      raw_validator_values_in_lineage_fingerprint: false,
      behavior_equivalence_verified_by_harness: false,
      sequentiality_verified_by_harness: false,
      gate_b_admission_authorized: false,
      optimizer_authorized: false
    })
  });
}

async function readBundleDirectory(directory) {
  const read = async (name) => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
  return {
    benchmark: await read('standards-shadow-benchmark.json'),
    summary: await read('standards-shadow-summary.json'),
    evaluation: await read('standards-shadow-evaluation.json'),
    state: await read('standards-shadow-state.json'),
    ledger: await read('standards-shadow-ledger.json')
  };
}

async function main() {
  const directories = process.argv.slice(2);
  if (!directories.length) throw new Error('usage: node scripts/verify-standards-shadow-lineage-v1.mjs <root-artifact-dir> [next-artifact-dir ...]');
  const bundles = [];
  for (const directory of directories) bundles.push(await readBundleDirectory(directory));
  console.log(JSON.stringify(verifyStandardsShadowNaturalLineage(bundles), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
