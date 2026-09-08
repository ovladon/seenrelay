import test from 'node:test';
import assert from 'node:assert/strict';
import { openApi } from '../src/openapi.js';

test('OpenAPI exposes readiness v2 as activation-gated and keeps v1 separate', () => {
  const spec = openApi('https://seenrelay.test') as any;
  const v1 = spec.paths?.['/readiness/audit']?.post;
  const v2 = spec.paths?.['/readiness/audit/v2']?.post;
  assert.equal(v1?.operationId, 'auditAiVisitReadiness');
  assert.equal(v2?.operationId, 'auditAiSiteReadinessV2');
  assert.equal(v2?.['x-seenrelay-availability'], 'activation-gated');
  assert.deepEqual(v2?.requestBody?.content?.['application/json']?.schema, { $ref: '#/components/schemas/ReadinessAuditRequest' });
  assert.deepEqual(v2?.responses?.['200']?.content?.['application/json']?.schema, { $ref: '#/components/schemas/ReadinessV2Audit' });
  assert.ok(v2?.responses?.['503']);
  assert.match(spec.info.description, /CHECK and OBSERVE remain the only domain operations/);
});

test('readiness v2 machine contract hard-codes bounded execution and no workload-fit claim', () => {
  const schemas = (openApi('https://seenrelay.test') as any).components.schemas;
  assert.equal(schemas.ReadinessV2Audit.properties.requestCount.const, 6);
  assert.equal(schemas.ReadinessV2Audit.properties.retries.const, 0);
  assert.equal(schemas.ReadinessV2Audit.properties.totalMaxBytes.const, 786432);
  assert.equal(schemas.ReadinessV2Report.properties.seenrelayCandidate.const, false);
  assert.equal(schemas.ReadinessV2Report.properties.seenrelayRecommendation.const, 'REQUIRES_OWNER_WORKLOAD_EVIDENCE');
  assert.equal(schemas.ReadinessV2ProbeEvidence.additionalProperties, false);
  assert.equal(schemas.ReadinessV2Dimensions.additionalProperties, false);
});
