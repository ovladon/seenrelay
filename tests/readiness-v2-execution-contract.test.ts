import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReadinessV2, interpretReadinessV2 } from '../src/readiness-v2.js';

function root(headers: Record<string, string> = {}) {
  return { id: 'root', status: 200, headers, body: Buffer.from('ok'), truncated: false } as any;
}

function openapi() {
  return { id: 'openapi', status: 200, headers: {}, body: Buffer.from(JSON.stringify({ openapi: '3.1.0', paths: { '/x': { get: { responses: { '200': { description: 'ok' } } } } } })), truncated: false } as any;
}

test('classifier and interpreted evidence share exactly one report semantics', () => {
  const results = { root: root({ link: '<https://example.com/openapi.json>; rel="service"' }), openapi: openapi() };
  const report = classifyReadinessV2('https://example.com', results);
  const evidence = interpretReadinessV2('https://example.com', results);
  assert.deepEqual(evidence.report, report);
  assert.equal(report.verdict, 'MACHINE_READY');
  assert.equal(report.seenrelayCandidate, false);
  assert.equal(report.seenrelayRecommendation, 'REQUIRES_OWNER_WORKLOAD_EVIDENCE');
});

test('truncated machine documents are never accepted as verified contracts', () => {
  const results = { root: root(), openapi: { ...openapi(), truncated: true } };
  const report = classifyReadinessV2('https://example.com', results);
  assert.deepEqual(report.verifiedMachineSurfaces, []);
  assert.notEqual(report.verdict, 'MACHINE_READY');
});
