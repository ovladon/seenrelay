import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, stableJson } from '../src/canonical.js';
import {
  isKeyedValueFingerprint,
  keyedValueFingerprintFromLegacyHash,
  normalizeStoredValueFingerprint,
  valueFingerprint
} from '../src/value-fingerprint.js';

const ORIGINAL_SALT = process.env.PRIVACY_SALT;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

function restoreEnv() {
  if (ORIGINAL_SALT === undefined) delete process.env.PRIVACY_SALT;
  else process.env.PRIVACY_SALT = ORIGINAL_SALT;
  if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
}

test.afterEach(restoreEnv);

test('low-entropy values use a server-keyed fingerprint rather than public SHA-256', async () => {
  process.env.PRIVACY_SALT = 'test-privacy-salt-0123456789abcdef0123456789abcdef';
  delete process.env.VERCEL_ENV;

  const value = true;
  const legacy = await sha256Hex(stableJson(value));
  const fingerprint = await valueFingerprint(value);

  assert.equal(fingerprint.legacyValueHash, legacy);
  assert.notEqual(fingerprint.valueHash, legacy);
  assert.equal(isKeyedValueFingerprint(fingerprint.valueHash), true);
  assert.match(fingerprint.valueHash, /^h1:[0-9a-f]{64}$/);
});

test('legacy fingerprints re-key to the same identity as new observations', async () => {
  process.env.PRIVACY_SALT = 'test-privacy-salt-0123456789abcdef0123456789abcdef';
  delete process.env.VERCEL_ENV;

  const fingerprint = await valueFingerprint({ status: 'ready', count: 2 });
  assert.equal(
    await keyedValueFingerprintFromLegacyHash(fingerprint.legacyValueHash),
    fingerprint.valueHash
  );
  assert.equal(
    await normalizeStoredValueFingerprint(fingerprint.legacyValueHash),
    fingerprint.valueHash
  );
  assert.equal(
    await normalizeStoredValueFingerprint(fingerprint.valueHash),
    fingerprint.valueHash
  );
});

test('Vercel environments require a configured privacy secret', async () => {
  delete process.env.PRIVACY_SALT;
  process.env.VERCEL_ENV = 'preview';
  await assert.rejects(() => valueFingerprint('x'), /PRIVACY_SALT must be configured/);
});
