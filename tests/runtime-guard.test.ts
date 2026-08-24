import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRuntimeFactAllowed, isReservedTestSource } from '../src/runtime-guard.js';
import { ValidationError } from '../src/canonical.js';

const fact = (source: string) => ({ subject: 'test', predicate: 'status.current', source });

test('reserved CI source detection is narrow and deterministic', () => {
  assert.equal(isReservedTestSource('https://example.com/seenrelay-e2e/abc'), true);
  assert.equal(isReservedTestSource('https://example.com/seenrelay-e2e-advanced/abc/reuse'), true);
  assert.equal(isReservedTestSource('https://example.com/seenrelay-mcp-e2e/abc'), true);
  assert.equal(isReservedTestSource('https://example.com/ordinary'), false);
  assert.equal(isReservedTestSource('https://example.org/seenrelay-e2e/abc'), false);
  assert.equal(isReservedTestSource('https://customer.example/seenrelay-e2e/abc'), false);
});

test('production rejects reserved CI facts before stateful admission', () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    assert.throws(
      () => assertRuntimeFactAllowed(fact('https://example.com/seenrelay-e2e/run')),
      (err: unknown) => err instanceof ValidationError && /Reserved SeenRelay test namespace/.test(err.message)
    );
    assert.doesNotThrow(() => assertRuntimeFactAllowed(fact('https://example.com/real-product-status')));
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test('preview accepts reserved CI facts for isolated E2E', () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    assert.doesNotThrow(() => assertRuntimeFactAllowed(fact('https://example.com/seenrelay-e2e/run')));
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
