import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdmissionDatabaseUrl } from '../src/hive-admission-db.js';

test('readiness role selects only READINESS_DATABASE_URL even when a core URL exists', () => {
  const selected = resolveAdmissionDatabaseUrl({
    SEENRELAY_DEPLOYMENT_ROLE: 'readiness',
    READINESS_DATABASE_URL: 'postgresql://readiness.example/db',
    DATABASE_URL: 'postgresql://core.example/db'
  } as NodeJS.ProcessEnv);
  assert.equal(selected, 'postgresql://readiness.example/db');
});

test('readiness role fails closed instead of falling back to DATABASE_URL', () => {
  assert.throws(
    () => resolveAdmissionDatabaseUrl({
      SEENRELAY_DEPLOYMENT_ROLE: 'readiness',
      DATABASE_URL: 'postgresql://core.example/db'
    } as NodeJS.ProcessEnv),
    /READINESS_DATABASE_URL is not configured for the readiness deployment/
  );
});

test('core deployment preserves the existing DATABASE_URL contract', () => {
  const selected = resolveAdmissionDatabaseUrl({
    DATABASE_URL: 'postgresql://core.example/db',
    READINESS_DATABASE_URL: 'postgresql://unused-readiness.example/db'
  } as NodeJS.ProcessEnv);
  assert.equal(selected, 'postgresql://core.example/db');
});
