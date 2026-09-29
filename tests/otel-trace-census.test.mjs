import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeOtelFleetTrace } from '../clients/typescript/scripts/otel-trace-census-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'clients', 'typescript', 'scripts', 'seenrelay-cli.mjs');
const HASH = 'sha256:' + 'a'.repeat(64);

const kv = (key, value) => {
  let wrapped;
  if (typeof value === 'boolean') wrapped = { boolValue: value };
  else if (typeof value === 'number') wrapped = { doubleValue: value };
  else wrapped = { stringValue: String(value) };
  return { key, value: wrapped };
};

function span({ id, startMs, endMs, worker, includePolicy = true, coordinate = HASH, rawSecret = null }) {
  const attrs = [
    kv('gen_ai.operation.name', 'execute_tool'),
    kv('gen_ai.tool.name', 'browser_eval'),
    kv('seenrelay.worker_id', worker)
  ];
  if (coordinate !== null) attrs.push(kv('seenrelay.coordinate_hash', coordinate));
  if (includePolicy) {
    attrs.push(
      kv('seenrelay.side_effect_class', 'read_only'),
      kv('seenrelay.exact_single_answer_shareable', true),
      kv('seenrelay.independent_samples_required', false),
      kv('seenrelay.native_exact_cache_zero_cost', false),
      kv('seenrelay.outcome', 'success'),
      kv('seenrelay.provider_units', 1),
      kv('seenrelay.provider_unit_label', 'credit'),
      kv('seenrelay.cost_provenance', 'provider_reported')
    );
  }
  if (rawSecret) {
    attrs.push({
      key: 'gen_ai.tool.call.arguments',
      value: {
        kvlistValue: {
          values: [kv('url', rawSecret), kv('token', 'super-secret')]
        }
      }
    });
  }
  return {
    spanId: id,
    startTimeUnixNano: String(BigInt(startMs) * 1_000_000n),
    endTimeUnixNano: String(BigInt(endMs) * 1_000_000n),
    attributes: attrs,
    status: { code: 'STATUS_CODE_UNSET' }
  };
}

function document(spans) {
  return {
    resourceSpans: [{
      resource: {
        attributes: [
          kv('service.name', 'agent-runtime'),
          kv('service.instance.id', 'runtime-a')
        ]
      },
      scopeSpans: [{ scope: { name: 'test' }, spans }]
    }]
  };
}

test('OTLP adapter maps explicit safe policy into the existing exact-overlap census', () => {
  const report = analyzeOtelFleetTrace(document([
    span({ id: 'a1', startMs: 1000, endMs: 2000, worker: 'w1' }),
    span({ id: 'b2', startMs: 1100, endMs: 1900, worker: 'w2' })
  ]));

  assert.equal(report.input_format, 'otlp-json');
  assert.equal(report.otel_adapter.input_spans, 2);
  assert.equal(report.otel_adapter.spans_admitted_to_census, 2);
  assert.equal(report.eligible_events, 2);
  assert.equal(report.observed_exact_overlap_starts, 1);
  assert.equal(report.cross_worker_overlap_starts, 1);
  assert.equal(report.successful_leader_overlap_opportunities, 1);
  assert.equal(report.potential_avoided_provider_units_by_label.credit, 1);
  assert.equal(report.actual_avoided_executions, null);
});

test('OTel semantics alone never imply SeenRelay eligibility', () => {
  const report = analyzeOtelFleetTrace(document([
    span({ id: 'a1', startMs: 1000, endMs: 2000, worker: 'w1', includePolicy: false }),
    span({ id: 'b2', startMs: 1100, endMs: 1900, worker: 'w2', coordinate: null })
  ]));

  assert.equal(report.otel_adapter.input_spans, 2);
  assert.equal(report.otel_adapter.spans_admitted_to_census, 0);
  assert.equal(report.otel_adapter.spans_skipped_missing_policy, 1);
  assert.equal(report.otel_adapter.spans_skipped_missing_coordinate, 1);
  assert.equal(report.eligible_events, 0);
});

test('raw OTel tool arguments are neither required nor copied into the census report', () => {
  const secret = 'https://private.example/account?id=42';
  const report = analyzeOtelFleetTrace(document([
    span({ id: 'a1', startMs: 1000, endMs: 2000, worker: 'w1', rawSecret: secret })
  ]));
  const encoded = JSON.stringify(report);

  assert.equal(report.eligible_events, 1);
  assert.doesNotMatch(encoded, /private\.example/);
  assert.doesNotMatch(encoded, /super-secret/);
  assert.doesNotMatch(encoded, /browser_eval/);
  assert.match(report.otel_adapter.privacy_boundary, /Raw GenAI arguments\/results/);
});

test('OTLP adapter does not call an unset span success without explicit SeenRelay outcome', () => {
  const doc = document([span({ id: 'a1', startMs: 1000, endMs: 2000, worker: 'w1' })]);
  doc.resourceSpans[0].scopeSpans[0].spans[0].attributes =
    doc.resourceSpans[0].scopeSpans[0].spans[0].attributes.filter(
      (item) => item.key !== 'seenrelay.outcome'
    );
  const report = analyzeOtelFleetTrace(doc);
  assert.equal(report.otel_adapter.spans_without_explicit_success, 1);
  assert.equal(report.successful_leader_overlap_opportunities, 0);
});

test('otel-trace-census CLI emits local machine-readable report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seenrelay-otel-census-'));
  const file = path.join(dir, 'otlp.json');
  try {
    fs.writeFileSync(file, JSON.stringify(document([
      span({ id: 'a1', startMs: 1000, endMs: 2000, worker: 'w1' }),
      span({ id: 'b2', startMs: 1100, endMs: 1900, worker: 'w2' })
    ])));
    const stdout = execFileSync(process.execPath, [cli, 'otel-trace-census', file, '--json'], {
      encoding: 'utf8'
    });
    const report = JSON.parse(stdout);
    assert.equal(report.input_format, 'otlp-json');
    assert.equal(report.observed_exact_overlap_starts, 1);
    assert.equal(report.actual_net_savings_usd, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
