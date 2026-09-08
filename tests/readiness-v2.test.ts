import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReadinessV2 } from '../src/readiness-v2.js';

test('readiness v2 accepts a structurally valid A2A well-known card as explicit machine discovery', () => {
  const card = {
    name: 'Example Agent', description: 'Example', version: '1.0.0',
    supportedInterfaces: [{ url: 'https://example.com/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['application/json'], defaultOutputModes: ['application/json'],
    skills: [{ id: 'example.echo', name: 'Echo', description: 'Echo JSON', tags: ['example'] }]
  };
  const report = classifyReadinessV2('https://example.com', {
    root: { id: 'root', status: 200, headers: { 'cache-control': 'public, max-age=60' }, body: Buffer.from('ok'), truncated: false },
    a2aAgentCard: { id: 'a2aAgentCard', status: 200, headers: {}, body: Buffer.from(JSON.stringify(card)), truncated: false }
  } as any);
  assert.equal(report.verdict, 'MACHINE_READY');
  assert.deepEqual(report.verifiedMachineSurfaces, ['A2A']);
  assert.equal(report.seenrelayCandidate, false);
  assert.equal(report.seenrelayRecommendation, 'REQUIRES_OWNER_WORKLOAD_EVIDENCE');
});

test('readiness v2 does not treat an unlinked common OpenAPI path as sufficient explicit discovery', () => {
  const spec = { openapi: '3.1.0', paths: { '/thing': { get: { responses: { '200': { description: 'ok' } } } } } };
  const report = classifyReadinessV2('https://example.com', {
    root: { id: 'root', status: 200, headers: {}, body: Buffer.from('ok'), truncated: false },
    openapi: { id: 'openapi', status: 200, headers: {}, body: Buffer.from(JSON.stringify(spec)), truncated: false }
  } as any);
  assert.equal(report.verdict, 'PARTIAL_MACHINE_READY');
  assert.deepEqual(report.verifiedMachineSurfaces, ['OPENAPI']);
  assert.equal(report.dimensions.machineDiscovery.status, 'FIX');
});

test('readiness v2 never turns surface evidence into SeenRelay workload fit', () => {
  const report = classifyReadinessV2('https://example.com', {
    root: { id: 'root', status: 200, headers: { link: '<https://example.com/openapi.json>; rel="service"', etag: '"v1"' }, body: Buffer.from('ok'), truncated: false },
    openapi: { id: 'openapi', status: 200, headers: {}, body: Buffer.from(JSON.stringify({ openapi: '3.1.0', paths: { '/x': { post: {} } } })), truncated: false },
    robots: { id: 'robots', status: 200, headers: {}, body: Buffer.from('User-agent: *'), truncated: false },
    sitemap: { id: 'sitemap', status: 200, headers: {}, body: Buffer.from('<urlset/>'), truncated: false },
    llmsTxt: { id: 'llmsTxt', status: 200, headers: {}, body: Buffer.from('# Agent docs'), truncated: false }
  } as any);
  assert.equal(report.verdict, 'MACHINE_READY');
  assert.equal(report.seenrelayCandidate, false);
  assert.match(report.limitations.join(' '), /cannot establish repeated validation/i);
});
