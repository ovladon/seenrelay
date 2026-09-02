import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { runStandardsShadowBenchmark } from './standards-shadow-benchmark.mjs';

export const STANDARDS_SHADOW_COLLECTION_EPOCH = 'schedule-only-v3';
export const STANDARDS_SHADOW_NATURAL_SAMPLE = 'natural_workload';
export const STANDARDS_SHADOW_COMMISSIONING_SAMPLE = 'commissioning';

const WORKLOAD_ID = 'standards-watch-daily-v1';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function safeId(value, name, { allowEmpty = false } = {}) {
  if (allowEmpty && (value === '' || value === null || value === undefined)) return '';
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new TypeError(`${name} must be a bounded opaque id`);
  return value;
}

export function standardsShadowSamplingProvenance({ runEvent = 'local', runId = 'local', parentRunId = '' } = {}) {
  const event = safeId(runEvent, 'runEvent');
  const id = safeId(runId, 'runId');
  const parent = safeId(parentRunId, 'parentRunId', { allowEmpty: true });
  const sampleType = event === 'schedule' ? STANDARDS_SHADOW_NATURAL_SAMPLE : STANDARDS_SHADOW_COMMISSIONING_SAMPLE;
  if (sampleType !== STANDARDS_SHADOW_NATURAL_SAMPLE && parent) {
    throw new TypeError('commissioning runs cannot inherit a natural parent');
  }
  return Object.freeze({ sampleType, runEvent: event, runId: id, parentRunId: parent });
}

function assertNaturalParentDocument(document, kind, provenance) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError(`previous ${kind} must be an object`);
  }
  if (document.provenance_schema_version !== 2 || document.collection_epoch !== STANDARDS_SHADOW_COLLECTION_EPOCH) {
    throw new TypeError(`previous ${kind} belongs to another collection epoch`);
  }
  if (document.workload_id !== WORKLOAD_ID || document.sample_type !== STANDARDS_SHADOW_NATURAL_SAMPLE || document.run_event !== 'schedule') {
    throw new TypeError(`previous ${kind} is not schedule-only natural evidence for this workload`);
  }
  if (document.run_id !== provenance.parentRunId) {
    throw new TypeError(`previous ${kind} run_id does not match parentRunId`);
  }
}

export function validateStandardsShadowLineage({ previousState = null, previousLedger = null, provenance }) {
  if (!provenance || typeof provenance !== 'object') throw new TypeError('provenance is required');
  const hasState = previousState !== null && previousState !== undefined;
  const hasLedger = previousLedger !== null && previousLedger !== undefined;

  if (provenance.sampleType !== STANDARDS_SHADOW_NATURAL_SAMPLE) {
    if (hasState || hasLedger || provenance.parentRunId) {
      throw new TypeError('commissioning runs must start without inherited natural evidence');
    }
    return true;
  }

  if (!provenance.parentRunId) {
    if (hasState || hasLedger) throw new TypeError('natural run without parentRunId cannot inherit previous evidence');
    return true;
  }

  if (!hasState || !hasLedger) throw new TypeError('natural parent requires both previous state and previous ledger');
  assertNaturalParentDocument(previousState, 'state', provenance);
  assertNaturalParentDocument(previousLedger, 'ledger', provenance);
  if (previousLedger.natural_schedule !== 'daily') throw new TypeError('previous ledger is not daily natural evidence');
  return true;
}

function withProvenance(document, provenance, extra = {}) {
  return Object.freeze({
    ...document,
    provenance_schema_version: 2,
    collection_epoch: STANDARDS_SHADOW_COLLECTION_EPOCH,
    sample_type: provenance.sampleType,
    run_event: provenance.runEvent,
    run_id: provenance.runId,
    parent_run_id: provenance.parentRunId || null,
    ...extra
  });
}

export function annotateStandardsShadowResult(result, provenance) {
  if (!result || typeof result !== 'object') throw new TypeError('benchmark result is required');
  const natural = provenance.sampleType === STANDARDS_SHADOW_NATURAL_SAMPLE;
  const input = withProvenance(result.input, provenance);
  const state = withProvenance(result.state, provenance);
  const ledger = withProvenance(result.ledger, provenance, { natural_schedule: natural ? 'daily' : null });
  const summary = withProvenance(result.summary, provenance, {
    preliminary_sample_floor_met: natural && result.summary?.preliminary_sample_floor_met === true,
    ...(natural ? {} : { evaluation_state: 'commissioning', evaluation_reason: 'not_natural_workload' })
  });
  return Object.freeze({
    input,
    summary,
    evaluation: natural ? result.evaluation : null,
    state,
    ledger
  });
}

export async function runStandardsShadowCollectorV2({
  previousState = null,
  previousLedger = null,
  runEvent = 'local',
  runId = 'local',
  parentRunId = '',
  writeFiles = false,
  runBenchmark = runStandardsShadowBenchmark,
  ...benchmarkOptions
} = {}) {
  const provenance = standardsShadowSamplingProvenance({ runEvent, runId, parentRunId });
  validateStandardsShadowLineage({ previousState, previousLedger, provenance });
  const raw = await runBenchmark({
    ...benchmarkOptions,
    previousState,
    previousLedger,
    writeFiles: false
  });
  const result = annotateStandardsShadowResult(raw, provenance);

  if (writeFiles) {
    await fs.writeFile('standards-shadow-benchmark.json', `${JSON.stringify(result.input, null, 2)}\n`);
    await fs.writeFile('standards-shadow-summary.json', `${JSON.stringify(result.summary, null, 2)}\n`);
    await fs.writeFile('standards-shadow-evaluation.json', `${JSON.stringify(result.evaluation, null, 2)}\n`);
    await fs.writeFile('standards-shadow-state.json', `${JSON.stringify(result.state, null, 2)}\n`);
    await fs.writeFile('standards-shadow-ledger.json', `${JSON.stringify(result.ledger, null, 2)}\n`);
  }

  return result;
}

async function readJsonFile(path) {
  if (!path) return null;
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.all([
    readJsonFile(process.env.STANDARDS_SHADOW_PREVIOUS_STATE),
    readJsonFile(process.env.STANDARDS_SHADOW_PREVIOUS_LEDGER)
  ])
    .then(([previousState, previousLedger]) => runStandardsShadowCollectorV2({
      previousState,
      previousLedger,
      runEvent: process.env.STANDARDS_SHADOW_RUN_EVENT || process.env.GITHUB_EVENT_NAME || 'local',
      runId: process.env.STANDARDS_SHADOW_RUN_ID || process.env.GITHUB_RUN_ID || 'local',
      parentRunId: process.env.STANDARDS_SHADOW_PARENT_RUN_ID || '',
      writeFiles: true
    }))
    .then(({ summary, evaluation }) => {
      console.log(JSON.stringify({ event: 'standards_shadow_summary', ...summary }));
      if (evaluation) console.log(JSON.stringify({ event: 'standards_shadow_evaluation', decision: evaluation.decision, safety: evaluation.safety }));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
