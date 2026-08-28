import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFactKey } from '../src/canonical.js';
import type { FactDescriptor } from '../src/types.js';

type OverlapClass = 'same_process' | 'same_fleet_cross_process' | 'cross_fleet';

export interface OverlapTraceEvent {
  timestamp: string;
  fact: FactDescriptor;
  process_id: string;
  fleet_id: string;
  max_age_seconds?: number;
  validator_ms?: number;
  validator_cost?: number;
}

interface NormalizedEvent {
  timestampMs: number;
  factKey: string;
  processId: string;
  fleetId: string;
  maxAgeSeconds: number;
  validatorMs?: number;
  validatorCost?: number;
  index: number;
}

interface FactOverlapState {
  latest: { timestampMs: number; fleetId: string } | null;
  lastByProcess: Map<string, number>;
  lastByFleet: Map<string, number>;
}

const FORBIDDEN_RAW_FIELDS = new Set([
  'value', 'known_value', 'result', 'payload', 'response', 'output', 'content'
]);

function nonEmptyText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function nonNegativeFinite(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative finite number`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function rejectRawPayloadFields(event: Record<string, unknown>): void {
  for (const key of Object.keys(event)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) {
      throw new TypeError(`overlap traces must not contain raw field ${key}`);
    }
  }
}

async function normalizeEvent(
  input: unknown,
  index: number,
  defaultMaxAgeSeconds: number
): Promise<NormalizedEvent> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`event[${index}] must be an object`);
  }
  const event = input as Record<string, unknown>;
  rejectRawPayloadFields(event);

  const timestamp = nonEmptyText(event.timestamp, `event[${index}].timestamp`);
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) throw new TypeError(`event[${index}].timestamp must be ISO-8601 compatible`);

  const processId = nonEmptyText(event.process_id, `event[${index}].process_id`);
  const fleetId = nonEmptyText(event.fleet_id, `event[${index}].fleet_id`);
  const maxAgeSeconds = event.max_age_seconds === undefined
    ? defaultMaxAgeSeconds
    : positiveInteger(event.max_age_seconds, `event[${index}].max_age_seconds`);

  const fact = event.fact as FactDescriptor;
  const canonical = await canonicalFactKey(fact);

  return {
    timestampMs,
    factKey: canonical.factKey,
    processId,
    fleetId,
    maxAgeSeconds,
    validatorMs: nonNegativeFinite(event.validator_ms, `event[${index}].validator_ms`),
    validatorCost: nonNegativeFinite(event.validator_cost, `event[${index}].validator_cost`),
    index
  };
}

function processKey(event: Pick<NormalizedEvent, 'fleetId' | 'processId'>): string {
  return JSON.stringify([event.fleetId, event.processId]);
}

function emptyFactState(): FactOverlapState {
  return { latest: null, lastByProcess: new Map(), lastByFleet: new Map() };
}

function classifyOverlap(event: NormalizedEvent, state: FactOverlapState): OverlapClass | null {
  const cutoffMs = event.timestampMs - event.maxAgeSeconds * 1000;

  const sameProcessAt = state.lastByProcess.get(processKey(event));
  if (sameProcessAt !== undefined && sameProcessAt >= cutoffMs) return 'same_process';

  const sameFleetAt = state.lastByFleet.get(event.fleetId);
  if (sameFleetAt !== undefined && sameFleetAt >= cutoffMs) return 'same_fleet_cross_process';

  const latest = state.latest;
  if (latest && latest.fleetId !== event.fleetId && latest.timestampMs >= cutoffMs) return 'cross_fleet';

  return null;
}

function rememberEvent(event: NormalizedEvent, state: FactOverlapState): void {
  state.lastByProcess.set(processKey(event), event.timestampMs);
  state.lastByFleet.set(event.fleetId, event.timestampMs);
  state.latest = { timestampMs: event.timestampMs, fleetId: event.fleetId };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export async function analyzeOverlapEvents(
  inputs: unknown[],
  options: { defaultMaxAgeSeconds?: number } = {}
) {
  const defaultMaxAgeSeconds = positiveInteger(options.defaultMaxAgeSeconds ?? 3600, 'defaultMaxAgeSeconds');
  const events = await Promise.all(inputs.map((event, index) => normalizeEvent(event, index, defaultMaxAgeSeconds)));
  events.sort((a, b) => a.timestampMs - b.timestampMs || a.index - b.index);

  const stateByFact = new Map<string, FactOverlapState>();
  const counts: Record<OverlapClass, number> = {
    same_process: 0,
    same_fleet_cross_process: 0,
    cross_fleet: 0
  };
  const validatorMsExposed: Record<OverlapClass, number> = {
    same_process: 0,
    same_fleet_cross_process: 0,
    cross_fleet: 0
  };
  const validatorCostExposed: Record<OverlapClass, number> = {
    same_process: 0,
    same_fleet_cross_process: 0,
    cross_fleet: 0
  };
  let noOverlapWithinWindow = 0;
  let eventsWithValidatorMs = 0;
  let eventsWithValidatorCost = 0;

  for (const event of events) {
    const state = stateByFact.get(event.factKey) ?? emptyFactState();
    const overlap = classifyOverlap(event, state);
    if (overlap) {
      counts[overlap] += 1;
      if (event.validatorMs !== undefined) validatorMsExposed[overlap] += event.validatorMs;
      if (event.validatorCost !== undefined) validatorCostExposed[overlap] += event.validatorCost;
    } else {
      noOverlapWithinWindow += 1;
    }
    if (event.validatorMs !== undefined) eventsWithValidatorMs += 1;
    if (event.validatorCost !== undefined) eventsWithValidatorCost += 1;
    rememberEvent(event, state);
    stateByFact.set(event.factKey, state);
  }

  const totalEvents = events.length;
  const totalOverlap = counts.same_process + counts.same_fleet_cross_process + counts.cross_fleet;

  return Object.freeze({
    mode: 'overlap-proof',
    classification: 'opportunity-only-not-safe-reuse',
    input_events: totalEvents,
    unique_fact_keys: stateByFact.size,
    default_max_age_seconds: defaultMaxAgeSeconds,
    overlap_events: totalOverlap,
    no_overlap_within_window: noOverlapWithinWindow,
    overlap_rate: ratio(totalOverlap, totalEvents),
    incremental_overlap: Object.freeze({
      same_process: Object.freeze({ events: counts.same_process, rate: ratio(counts.same_process, totalEvents) }),
      same_fleet_cross_process: Object.freeze({ events: counts.same_fleet_cross_process, rate: ratio(counts.same_fleet_cross_process, totalEvents) }),
      cross_fleet: Object.freeze({ events: counts.cross_fleet, rate: ratio(counts.cross_fleet, totalEvents) })
    }),
    validator_work_exposed_to_overlap: Object.freeze({
      events_with_validator_ms: eventsWithValidatorMs,
      milliseconds: Object.freeze({ ...validatorMsExposed }),
      events_with_validator_cost: eventsWithValidatorCost,
      cost_units: Object.freeze({ ...validatorCostExposed }),
      caveat: 'Exposure is not a savings claim; value/state equality and reuse policy are intentionally not measured here.'
    }),
    privacy: Object.freeze({
      network_calls: 0,
      raw_values_accepted: false,
      source_urls_emitted: false,
      fact_keys_emitted: false,
      process_ids_emitted: false,
      fleet_ids_emitted: false
    })
  });
}

function parseJsonLines(text: string): unknown[] {
  const events: unknown[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); }
    catch { throw new TypeError(`invalid JSON on line ${index + 1}`); }
  }
  return events;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('usage: npx tsx scripts/overlap-proof.ts TRACE.jsonl [default_max_age_seconds]');
  }
  const defaultMaxAgeSeconds = process.argv[3] === undefined
    ? 3600
    : positiveInteger(Number(process.argv[3]), 'default_max_age_seconds');
  const text = await readFile(inputPath, 'utf8');
  const report = await analyzeOverlapEvents(parseJsonLines(text), { defaultMaxAgeSeconds });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
