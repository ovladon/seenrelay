import test from 'node:test';
import assert from 'node:assert/strict';
import { openApi } from '../src/openapi.js';
import { classifyRootAudit } from '../src/readiness.js';

test('OpenAPI exposes the existing bounded readiness audit as a diagnostic, not a third domain operation', () => {
  const spec = openApi('https://seenrelay.test') as any;
  const operation = spec.paths?.['/readiness/audit']?.post;

  assert.equal(operation?.operationId, 'auditAiVisitReadiness');
  assert.deepEqual(operation?.requestBody?.content?.['application/json']?.schema, { $ref: '#/components/schemas/ReadinessAuditRequest' });
  assert.deepEqual(operation?.responses?.['200']?.content?.['application/json']?.schema, { $ref: '#/components/schemas/ReadinessReport' });
  assert.match(spec.info.description, /CHECK and OBSERVE remain the only domain operations/);

  const requestSchema = spec.components.schemas.ReadinessAuditRequest;
  assert.deepEqual(requestSchema.required, ['site']);
  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(requestSchema.properties.site.maxLength, 253);
});

test('ReadinessReport OpenAPI schema stays structurally aligned with the runtime report', () => {
  const spec = openApi('https://seenrelay.test') as any;
  const reportSchema = spec.components.schemas.ReadinessReport;
  const evidenceSchema = spec.components.schemas.ReadinessEvidence;

  const report = classifyRootAudit('https://example.com/', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      etag: '"abc"',
      vary: 'Accept'
    },
    body: Buffer.from('<html>ok</html>'),
    truncated: false,
    elapsedMs: 12.5
  });

  assert.deepEqual(Object.keys(report).sort(), [...reportSchema.required].sort());
  assert.deepEqual(Object.keys(report.evidence).sort(), [...evidenceSchema.required].sort());
  assert.equal(report.schema, reportSchema.properties.schema.const);
  assert.equal(report.scope, reportSchema.properties.scope.const);
  assert.ok(reportSchema.properties.verdict.enum.includes(report.verdict));
  assert.equal(report.seenrelay_candidate, false);
  assert.equal(report.seenrelay_recommendation, 'NOT_DETERMINED_BY_SURFACE_SCAN');
});
