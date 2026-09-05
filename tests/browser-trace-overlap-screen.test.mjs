import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizePrompt,
  canonicalizeUrl,
  classifyOverlap,
  parseTraceText,
  screenBrowserOverlap
} from '../scripts/screen-browser-trace-overlap.mjs';

function assistantEvent(timestamp, content) {
  return JSON.stringify({ type: 'assistant', timestamp, message: { role: 'assistant', content } });
}
function webFetch(url, prompt, id = 'toolu_x') {
  return { type: 'tool_use', id, name: 'WebFetch', input: { url, prompt } };
}

test('canonicalization is conservative and removes only URL fragments', () => {
  assert.equal(canonicalizePrompt('  Verify X\r\nLine 2  '), 'Verify X\nLine 2');
  assert.equal(canonicalizeUrl('HTTPS://Example.COM:443/path?q=2#section').value, 'https://example.com/path?q=2');
  assert.deepEqual(canonicalizeUrl('ftp://example.com/a'), { ok: false, reason: 'non_http_url' });
});

test('screen counts cross-session exact overlap without treating same-session repeats as independent', () => {
  const a = parseTraceText([
    assistantEvent('2026-01-01T00:00:00Z', [webFetch('HTTPS://Example.COM:443/path#one', ' verify x\r\n', 'a1')]),
    assistantEvent('2026-01-01T00:01:00Z', [webFetch('https://example.com/path#two', 'verify x', 'a2')]),
  ].join('\n'), { session: 'a.jsonl' });
  const b = parseTraceText([
    assistantEvent('2026-01-01T00:02:00Z', [webFetch('https://example.com/path', 'verify x', 'b1')]),
    assistantEvent('2026-01-01T00:03:00Z', [webFetch('https://example.com/path', 'verify y', 'b2')])
  ].join('\n'), { session: 'b.jsonl' });
  const report = screenBrowserOverlap([a, b], { sourceRevision: 'abc123' });
  assert.equal(report.eligible_http_webfetch_calls, 4);
  assert.equal(report.unique_exact_operation_keys, 2);
  assert.equal(report.cross_session_exact_reuse_opportunities, 1);
  assert.equal(report.cross_session_exact_reuse_percent, 25);
  assert.equal(report.cross_session_url_reuse_opportunities, 2);
  assert.equal(report.classification, 'INSUFFICIENT_EXTERNAL_SAMPLE');
  assert.equal(report.interpretation.observer_independence_proven, false);
  assert.equal(report.interpretation.natural_workload_class_pass_authorized, false);
});

test('classification thresholds are frozen at 100 calls, 5 percent and 20 percent', () => {
  assert.equal(classifyOverlap({ eligibleCalls: 99, crossSessionExactReusePercent: 99 }), 'INSUFFICIENT_EXTERNAL_SAMPLE');
  assert.equal(classifyOverlap({ eligibleCalls: 100, crossSessionExactReusePercent: 4.999 }), 'LOW_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap({ eligibleCalls: 100, crossSessionExactReusePercent: 5 }), 'WEAK_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap({ eligibleCalls: 100, crossSessionExactReusePercent: 19.999 }), 'WEAK_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap({ eligibleCalls: 100, crossSessionExactReusePercent: 20 }), 'STRONG_EXACT_OVERLAP_SIGNAL');
});
