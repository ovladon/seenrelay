import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeOverlapEvents } from '../scripts/overlap-proof.js';

const fact = (source = 'https://example.com/api/item/42?utm_source=agent') => ({
  subject: 'Item price',
  predicate: 'price.current',
  source,
  locator: { scheme: 'json_pointer' as const, value: '/price' }
});

const event = (
  timestamp: string,
  process_id: string,
  fleet_id: string,
  source?: string,
  extra: Record<string, unknown> = {}
) => ({ timestamp, process_id, fleet_id, fact: fact(source), max_age_seconds: 60, ...extra });

test('classifies incremental overlap by nearest locality without emitting identifiers', async () => {
  const report = await analyzeOverlapEvents([
    event('2026-08-28T08:00:00Z', 'p1', 'fleet-a', undefined, { validator_ms: 1000, validator_cost: 2 }),
    event('2026-08-28T08:00:10Z', 'p1', 'fleet-a', undefined, { validator_ms: 900, validator_cost: 2 }),
    event('2026-08-28T08:00:20Z', 'p2', 'fleet-a', undefined, { validator_ms: 800, validator_cost: 2 }),
    event('2026-08-28T08:00:30Z', 'p3', 'fleet-b', undefined, { validator_ms: 700, validator_cost: 2 })
  ]);

  assert.equal(report.input_events, 4);
  assert.equal(report.unique_fact_keys, 1);
  assert.equal(report.overlap_events, 3);
  assert.deepEqual(report.incremental_overlap, {
    same_process: { events: 1, rate: 0.25 },
    same_fleet_cross_process: { events: 1, rate: 0.25 },
    cross_fleet: { events: 1, rate: 0.25 }
  });
  assert.equal(report.validator_work_exposed_to_overlap.milliseconds.same_process, 900);
  assert.equal(report.validator_work_exposed_to_overlap.milliseconds.same_fleet_cross_process, 800);
  assert.equal(report.validator_work_exposed_to_overlap.milliseconds.cross_fleet, 700);
  assert.equal(report.privacy.network_calls, 0);
  assert.equal(report.privacy.source_urls_emitted, false);
  assert.equal(report.privacy.fact_keys_emitted, false);
});

test('tracking URL variants converge through the production fact-v3 canonicalizer', async () => {
  const report = await analyzeOverlapEvents([
    event('2026-08-28T08:00:00Z', 'p1', 'fleet-a', 'https://EXAMPLE.com:443/api/item/42?utm_source=one'),
    event('2026-08-28T08:00:10Z', 'p2', 'fleet-b', 'https://example.com/api/item/42?utm_campaign=two')
  ]);
  assert.equal(report.unique_fact_keys, 1);
  assert.equal(report.incremental_overlap.cross_fleet.events, 1);
});

test('different source coordinates do not manufacture overlap', async () => {
  const report = await analyzeOverlapEvents([
    event('2026-08-28T08:00:00Z', 'p1', 'fleet-a', 'https://example.com/api/item/42'),
    event('2026-08-28T08:00:10Z', 'p2', 'fleet-b', 'https://example.com/api/item/43')
  ]);
  assert.equal(report.unique_fact_keys, 2);
  assert.equal(report.overlap_events, 0);
});

test('expired prior events do not count as overlap', async () => {
  const report = await analyzeOverlapEvents([
    event('2026-08-28T08:00:00Z', 'p1', 'fleet-a'),
    event('2026-08-28T08:02:00Z', 'p2', 'fleet-b')
  ]);
  assert.equal(report.overlap_events, 0);
  assert.equal(report.no_overlap_within_window, 2);
});

test('rejects traces carrying raw values or result payloads', async () => {
  await assert.rejects(
    analyzeOverlapEvents([{ ...event('2026-08-28T08:00:00Z', 'p1', 'fleet-a'), value: 17 }]),
    /must not contain raw field value/
  );
  await assert.rejects(
    analyzeOverlapEvents([{ ...event('2026-08-28T08:00:00Z', 'p1', 'fleet-a'), result: { price: 17 } }]),
    /must not contain raw field result/
  );
});

test('uses each event max-age window and reports exposure rather than savings', async () => {
  const report = await analyzeOverlapEvents([
    { ...event('2026-08-28T08:00:00Z', 'p1', 'fleet-a'), max_age_seconds: 300 },
    { ...event('2026-08-28T08:02:00Z', 'p2', 'fleet-b'), max_age_seconds: 180, validator_cost: 5 }
  ]);
  assert.equal(report.incremental_overlap.cross_fleet.events, 1);
  assert.equal(report.validator_work_exposed_to_overlap.cost_units.cross_fleet, 5);
  assert.match(report.validator_work_exposed_to_overlap.caveat, /not a savings claim/i);
});

test('documented sample reproduces the complete expected aggregate report', async () => {
  const [traceText, expectedText] = await Promise.all([
    readFile(new URL('../docs/OVERLAP_PROOF_SAMPLE.jsonl', import.meta.url), 'utf8'),
    readFile(new URL('../docs/OVERLAP_PROOF_SAMPLE_EXPECTED.json', import.meta.url), 'utf8')
  ]);
  const trace = traceText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const expected = JSON.parse(expectedText);
  const report = await analyzeOverlapEvents(trace, { defaultMaxAgeSeconds: 3600 });
  assert.deepEqual(report, expected);
});
