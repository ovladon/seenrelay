import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRootAudit, isGlobalPublicIp, normalizeAuditTarget, readinessPage } from '../src/readiness.js';

function raw(status: number, headers: Record<string, string> = {}) {
  return {
    status,
    headers,
    body: Buffer.from('<html><body>ok</body></html>'),
    truncated: false,
    elapsedMs: 123.4
  };
}

test('readiness target normalization is HTTPS-origin-only', () => {
  assert.equal(normalizeAuditTarget('example.com').href, 'https://example.com/');
  assert.equal(normalizeAuditTarget('https://EXAMPLE.com/').href, 'https://example.com/');
  for (const invalid of [
    'http://example.com',
    'https://example.com/path',
    'https://example.com/?q=1',
    'https://user:pass@example.com',
    'https://example.com:8443',
    'https://127.0.0.1',
    'https://localhost',
    'https://service.internal'
  ]) {
    assert.throws(() => normalizeAuditTarget(invalid), undefined, invalid);
  }
});

test('readiness scanner rejects private, documentation and special-purpose addresses', () => {
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1',
    '172.16.0.1', '192.168.1.1', '192.0.2.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '::', '::1', 'fc00::1', 'fd00::1', 'fe80::1',
    'ff02::1', '2001:db8::1'
  ]) assert.equal(isGlobalPublicIp(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isGlobalPublicIp(address), true, address);
  }
});

test('positive native freshness is NATIVE_READY and never a SeenRelay candidate', () => {
  const report = classifyRootAudit('https://example.com', raw(200, {
    'cache-control': 'public, max-age=300',
    'content-type': 'text/html; charset=utf-8'
  }));
  assert.equal(report.verdict, 'NATIVE_READY');
  assert.equal(report.seenrelay_candidate, false);
  assert.equal(report.seenrelay_recommendation, 'NOT_DETERMINED_BY_SURFACE_SCAN');
  assert.match(report.next_steps.join('\n'), /Honor the existing native freshness contract/i);
});

test('ETag or Last-Modified alone requires conditional workload evidence', () => {
  const etag = classifyRootAudit('https://example.com', raw(200, { etag: '"abc"' }));
  assert.equal(etag.verdict, 'NEEDS_WORKLOAD_EVIDENCE');
  assert.match(etag.headline, /conditional validator is advertised/i);
  assert.match(etag.next_steps.join('\n'), /presence alone is not proof/i);
  const modified = classifyRootAudit('https://example.com', raw(200, { 'last-modified': 'Mon, 07 Sep 2026 10:00:00 GMT' }));
  assert.equal(modified.verdict, 'NEEDS_WORKLOAD_EVIDENCE');
});

test('successful root without native freshness gets native fix recommendation, not product recommendation', () => {
  const report = classifyRootAudit('https://example.com', raw(200, { 'content-type': 'text/html' }));
  assert.equal(report.verdict, 'NATIVE_FIX_RECOMMENDED');
  assert.equal(report.seenrelay_candidate, false);
  assert.match(report.next_steps.join('\n'), /source-native fix first/i);
});

test('redirect remains evidence-limited because quick audit follows no redirect', () => {
  const report = classifyRootAudit('https://example.com', raw(301, { location: 'https://www.example.com/' }));
  assert.equal(report.verdict, 'NEEDS_WORKLOAD_EVIDENCE');
  assert.equal(report.evidence.redirect_location, 'https://www.example.com/');
  assert.equal(report.seenrelay_candidate, false);
});

test('public page states single-request scope and no forced fit', () => {
  const html = readinessPage('https://seenrelay.com');
  assert.match(html, /exactly one read-only HTTPS GET/i);
  assert.match(html, /never labels a site a SeenRelay candidate/i);
  assert.match(html, /presence alone is not treated as proof/i);
  assert.match(html, /A negative audit is useful/i);
  assert.match(html, /robots\.txt/i);
});
