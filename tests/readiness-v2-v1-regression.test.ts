import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRootAudit } from '../src/readiness.js';

test('readiness v1 public report remains unchanged in shape and semantics', () => {
  const report = classifyRootAudit('https://example.com/', {
    status: 200,
    headers: { 'cache-control': 'public, max-age=60', etag: '"v1"', 'content-type': 'text/html' },
    body: Buffer.from('ok'),
    truncated: false,
    elapsedMs: 10
  });
  assert.equal(report.schema, 'seenrelay-ai-visit-efficiency-quick-audit-v1');
  assert.equal(report.scope, 'single-root-response');
  assert.equal(report.verdict, 'NATIVE_READY');
  assert.equal(report.seenrelay_candidate, false);
  assert.equal(report.seenrelay_recommendation, 'NOT_DETERMINED_BY_SURFACE_SCAN');
  assert.equal(report.evidence.body_bytes_read, 2);
});
