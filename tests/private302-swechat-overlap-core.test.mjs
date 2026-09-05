import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizePrompt,
  canonicalizeUrl,
  classifyOverlap,
  screenCalls,
} from '../scripts/private302-swechat-overlap-core.mjs';

test('WHATWG canonicalization matches frozen PRIVATE293 semantics', () => {
  assert.deepEqual(canonicalizeUrl(' HTTPS://Example.COM:443/a?b=1#frag '), {
    ok: true,
    value: 'https://example.com/a?b=1',
  });
  assert.deepEqual(canonicalizeUrl('http://EXAMPLE.com:8080/x#y'), {
    ok: true,
    value: 'http://example.com:8080/x',
  });
  assert.equal(canonicalizeUrl('ftp://example.com/x').reason, 'non_http_url');
  assert.equal(canonicalizePrompt('  a\r\nb\r  '), 'a\nb');
});

test('classification uses exact integer thresholds', () => {
  assert.equal(classifyOverlap(99, 99), 'INSUFFICIENT_EXTERNAL_SAMPLE');
  assert.equal(classifyOverlap(100, 4), 'LOW_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap(100, 5), 'WEAK_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap(100, 19), 'WEAK_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap(100, 20), 'STRONG_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap(101, 5), 'LOW_EXACT_OVERLAP_SIGNAL');
  assert.equal(classifyOverlap(101, 6), 'WEAK_EXACT_OVERLAP_SIGNAL');
});

test('same-session repeats do not count as cross-session opportunities', () => {
  const calls = [
    { session: 's1', turn_number: 0, turn_id: 's1#0', timestamp: '2026-01-01T00:00:00Z', raw_url: 'https://example.com/x', raw_prompt: 'p' },
    { session: 's1', turn_number: 1, turn_id: 's1#1', timestamp: '2026-01-01T00:00:01Z', raw_url: 'https://example.com/x#f', raw_prompt: 'p' },
    { session: 's2', turn_number: 0, turn_id: 's2#0', timestamp: '2026-01-01T00:00:02Z', raw_url: 'https://EXAMPLE.com:443/x', raw_prompt: ' p ' },
  ];
  const result = screenCalls(calls);
  assert.equal(result.eligible_http_webfetch_calls, 3);
  assert.equal(result.exact_repeat_calls_any_session, 2);
  assert.equal(result.exact_keys_spanning_sessions, 1);
  assert.equal(result.cross_session_exact_reuse_opportunities, 1);
  assert.equal(result.cross_session_url_reuse_opportunities, 1);
});

test('ordering determines whether a later call is a reuse opportunity', () => {
  const calls = [
    { session: 'later', turn_number: 0, turn_id: 'later#0', timestamp: '2026-01-01T00:00:10Z', raw_url: 'https://example.com/x', raw_prompt: 'p' },
    { session: 'early', turn_number: 0, turn_id: 'early#0', timestamp: '2026-01-01T00:00:00Z', raw_url: 'https://example.com/x', raw_prompt: 'p' },
  ];
  const result = screenCalls(calls);
  assert.equal(result.cross_session_exact_reuse_opportunities, 1);
});

test('ineligible calls are rejected without entering keys', () => {
  const calls = [
    { session: 's1', turn_number: 0, turn_id: 's1#0', timestamp: null, raw_url: 'ftp://example.com', raw_prompt: 'p' },
    { session: 's2', turn_number: 0, turn_id: 's2#0', timestamp: null, raw_url: 'https://example.com', raw_prompt: '   ' },
  ];
  const result = screenCalls(calls);
  assert.equal(result.eligible_http_webfetch_calls, 0);
  assert.equal(result.rejected_calls.non_http_url, 1);
  assert.equal(result.rejected_calls.missing_prompt, 1);
  assert.equal(result.unique_exact_operation_keys, 0);
});
