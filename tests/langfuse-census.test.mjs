import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeLangfuseObservations } from '../clients/typescript/scripts/langfuse-census-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'clients', 'typescript', 'scripts', 'seenrelay-cli.mjs');

function tool({
  id,
  traceId,
  name = 'browser.read',
  input,
  start,
  end,
  totalCost = null
}) {
  const row = {
    id,
    traceId,
    type: 'TOOL',
    name,
    input,
    startTime: start,
    endTime: end
  };
  if (totalCost !== null) row.totalCost = totalCost;
  return row;
}

test('Langfuse census finds exact cross-trace repeats and in-flight overlap without authorizing reuse', () => {
  const report = analyzeLangfuseObservations([
    tool({
      id: 'a',
      traceId: 'trace-a',
      input: { url: 'https://example.com', mode: 'rendered' },
      start: '2026-09-29T10:00:00.000Z',
      end: '2026-09-29T10:00:10.000Z',
      totalCost: 0.30
    }),
    tool({
      id: 'b',
      traceId: 'trace-b',
      input: { mode: 'rendered', url: 'https://example.com' },
      start: '2026-09-29T10:00:01.000Z',
      end: '2026-09-29T10:00:09.000Z',
      totalCost: 0.30
    })
  ]);

  assert.equal(report.input_format, 'langfuse-observations-export');
  assert.equal(report.tool_observations, 2);
  assert.equal(report.admitted_tool_observations, 2);
  assert.equal(report.unique_exact_tool_coordinates, 1);
  assert.equal(report.exact_repeat_starts, 1);
  assert.equal(report.exact_inflight_overlap_starts, 1);
  assert.equal(report.coordinates_seen_across_multiple_traces, 1);
  assert.equal(report.recorded_cost_on_exact_repeat_starts_usd, 0.30);
  assert.equal(report.recorded_cost_on_inflight_repeat_starts_usd, 0.30);
  assert.equal(report.candidate_status, 'NEEDS_POLICY_REVIEW');
  assert.equal(report.policy_review_required, true);
  assert.equal(report.result_compatibility_proven, false);
  assert.equal(report.actual_avoided_executions, null);
  assert.equal(report.actual_net_savings_usd, null);
});

test('Langfuse census canonicalizes JSON object key order but not different values', () => {
  const report = analyzeLangfuseObservations([
    tool({
      id: 'a',
      traceId: 't1',
      input: '{"query":"seenrelay","limit":10}',
      start: '2026-09-29T10:00:00Z',
      end: '2026-09-29T10:00:01Z'
    }),
    tool({
      id: 'b',
      traceId: 't2',
      input: '{"limit":10,"query":"seenrelay"}',
      start: '2026-09-29T10:00:02Z',
      end: '2026-09-29T10:00:03Z'
    }),
    tool({
      id: 'c',
      traceId: 't3',
      input: '{"limit":20,"query":"seenrelay"}',
      start: '2026-09-29T10:00:04Z',
      end: '2026-09-29T10:00:05Z'
    })
  ]);

  assert.equal(report.unique_exact_tool_coordinates, 2);
  assert.equal(report.coordinates_with_exact_repeats, 1);
  assert.equal(report.exact_repeat_starts, 1);
});

test('Langfuse census ignores non-tool rows and counts malformed tool rows conservatively', () => {
  const report = analyzeLangfuseObservations([
    { id: 'gen', type: 'GENERATION', name: 'model', startTime: '2026-09-29T10:00:00Z' },
    { id: 'no-input', type: 'TOOL', name: 'search', startTime: '2026-09-29T10:00:00Z' },
    { id: 'no-name', type: 'TOOL', input: { q: 'x' }, startTime: '2026-09-29T10:00:00Z' },
    { id: 'bad-time', type: 'TOOL', name: 'search', input: { q: 'x' }, startTime: 'not-a-date' }
  ]);

  assert.equal(report.input_rows, 4);
  assert.equal(report.tool_observations, 3);
  assert.equal(report.admitted_tool_observations, 0);
  assert.equal(report.skipped_missing_input, 1);
  assert.equal(report.skipped_missing_tool_name, 1);
  assert.equal(report.skipped_missing_or_invalid_start_time, 1);
  assert.equal(report.candidate_status, 'NO_EXACT_REPEAT_CANDIDATES');
});

test('Langfuse census never copies raw tool inputs or outputs into the report', () => {
  const secret = 'customer-secret-token-123';
  const report = analyzeLangfuseObservations([
    tool({
      id: 'a',
      traceId: 't1',
      name: 'private.lookup',
      input: { token: secret, account: 'acct-private-42' },
      start: '2026-09-29T10:00:00Z',
      end: '2026-09-29T10:00:01Z'
    }),
    tool({
      id: 'b',
      traceId: 't2',
      name: 'private.lookup',
      input: { account: 'acct-private-42', token: secret },
      start: '2026-09-29T10:00:02Z',
      end: '2026-09-29T10:00:03Z'
    })
  ]);

  const encoded = JSON.stringify(report);
  assert.doesNotMatch(encoded, /customer-secret-token-123/);
  assert.doesNotMatch(encoded, /acct-private-42/);
  assert.match(report.privacy_boundary, /hashed locally/i);
});

test('Langfuse cost field is recorded spend, not automatically labeled avoidable savings', () => {
  const report = analyzeLangfuseObservations([
    tool({
      id: 'a',
      traceId: 't1',
      input: { q: 'x' },
      start: '2026-09-29T10:00:00Z',
      end: '2026-09-29T10:00:01Z',
      totalCost: 1.25
    }),
    tool({
      id: 'b',
      traceId: 't2',
      input: { q: 'x' },
      start: '2026-09-29T10:00:02Z',
      end: '2026-09-29T10:00:03Z',
      totalCost: 1.25
    })
  ]);

  assert.equal(report.recorded_tool_cost_usd, 2.5);
  assert.equal(report.recorded_cost_on_exact_repeat_starts_usd, 1.25);
  assert.match(report.cost_boundary, /not proven avoidable spend/i);
  assert.equal(report.actual_net_savings_usd, null);
});

test('langfuse-census CLI accepts Langfuse v2 data envelope and emits JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seenrelay-langfuse-census-'));
  const file = path.join(dir, 'observations.json');
  try {
    fs.writeFileSync(file, JSON.stringify({
      data: [
        tool({
          id: 'a',
          traceId: 't1',
          input: { q: 'same' },
          start: '2026-09-29T10:00:00Z',
          end: '2026-09-29T10:00:02Z'
        }),
        tool({
          id: 'b',
          traceId: 't2',
          input: { q: 'same' },
          start: '2026-09-29T10:00:01Z',
          end: '2026-09-29T10:00:03Z'
        })
      ]
    }));
    const stdout = execFileSync(process.execPath, [cli, 'langfuse-census', file, '--json'], {
      encoding: 'utf8'
    });
    const report = JSON.parse(stdout);
    assert.equal(report.exact_repeat_starts, 1);
    assert.equal(report.exact_inflight_overlap_starts, 1);
    assert.equal(report.actual_avoided_executions, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
