import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { boundedPinnedGet, isGlobalPublicIp, normalizeAuditTarget } from '../src/readiness-network.js';
import { readinessV2ProbePlan } from '../src/readiness-v2.js';

test('shared readiness target normalization keeps public HTTPS origin only', () => {
  assert.equal(normalizeAuditTarget('Example.COM').href, 'https://example.com/');
  assert.throws(() => normalizeAuditTarget('http://example.com'), /Only HTTPS/);
  assert.throws(() => normalizeAuditTarget('https://example.com/path'), /origin only/);
  assert.throws(() => normalizeAuditTarget('https://user:pass@example.com'), /Credentials/);
  assert.throws(() => normalizeAuditTarget('https://127.0.0.1'), /public DNS hostname/);
  assert.equal(isGlobalPublicIp('127.0.0.1'), false);
  assert.equal(isGlobalPublicIp('10.0.0.1'), false);
  assert.equal(isGlobalPublicIp('203.0.113.10'), false);
});

test('readiness v2 plan is fixed, bounded, unauthenticated and contains no user-controlled path', () => {
  const plan = readinessV2ProbePlan('https://example.com');
  assert.equal(plan.probeCount, 6);
  assert.equal(plan.totalMaxBytes, 786432);
  assert.equal(plan.invariants.httpsOnly, true);
  assert.equal(plan.invariants.sameOriginOnly, true);
  assert.equal(plan.invariants.userSuppliedPaths, false);
  assert.equal(plan.invariants.authentication, false);
  assert.equal(plan.invariants.crawl, false);
  assert.equal(plan.invariants.mutation, false);
  assert.equal(plan.invariants.retries, 0);
  assert.deepEqual(plan.probes.map((probe) => probe.path), [
    '/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/.well-known/agent-card.json', '/openapi.json'
  ]);
});

test('bounded pinned GET enforces an absolute deadline even while bytes keep arriving', { timeout: 1500 }, async (t) => {
  const intervals: NodeJS.Timeout[] = [];
  t.after(() => intervals.forEach((timer) => clearInterval(timer)));

  t.mock.method(https as any, 'request', ((_: unknown, callback: (response: any) => void) => {
    const request = new EventEmitter() as any;
    request.setTimeout = () => request;
    request.destroy = (error?: Error) => queueMicrotask(() => request.emit('error', error || new Error('request destroyed')));
    request.end = () => {
      const response = new EventEmitter() as any;
      response.statusCode = 200;
      response.headers = {};
      response.destroy = () => response.emit('close');
      queueMicrotask(() => {
        callback(response);
        const interval = setInterval(() => response.emit('data', Buffer.from('x')), 50);
        intervals.push(interval);
      });
    };
    return request;
  }) as any);

  const started = Date.now();
  await assert.rejects(
    boundedPinnedGet(new URL('https://example.com/'), { address: '8.8.8.8', family: 4 }, {
      path: '/',
      maxBytes: 1024,
      timeoutMs: 250,
      userAgent: 'SeenRelayDeadlineTest/1.0'
    }),
    /audit timeout/
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 800, `absolute deadline took ${elapsed}ms`);
});
