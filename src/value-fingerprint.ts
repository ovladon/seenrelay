import { sha256Hex, stableJson, ValidationError } from './canonical.js';

const PREFIX = 'h1:';
const DOMAIN = 'seenrelay-value-fingerprint-v1';
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;
const KEYED_H1 = /^h1:[0-9a-f]{64}$/;

function fingerprintSecret(): string {
  const secret = process.env.PRIVACY_SALT?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.VERCEL_ENV) throw new Error('PRIVACY_SALT must be configured with at least 32 characters in Vercel environments.');
  return 'seenrelay-local-development-salt-not-for-production';
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(fingerprintSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return hex(new Uint8Array(signature));
}

export function isKeyedValueFingerprint(value: string): boolean {
  return KEYED_H1.test(value);
}

/**
 * Re-key a pre-L2 SHA-256 value fingerprint without needing the submitted raw value.
 * This lets legacy and new rows converge on the same comparison identity during transition.
 */
export async function keyedValueFingerprintFromLegacyHash(legacyValueHash: string): Promise<string> {
  if (!LEGACY_SHA256.test(legacyValueHash)) throw new ValidationError('stored value fingerprint is invalid');
  return `${PREFIX}${await hmacSha256Hex(`${DOMAIN}|${legacyValueHash}`)}`;
}

export async function normalizeStoredValueFingerprint(storedValueHash: string): Promise<string> {
  if (KEYED_H1.test(storedValueHash)) return storedValueHash;
  return keyedValueFingerprintFromLegacyHash(storedValueHash);
}

/**
 * Server-keyed deterministic value fingerprint.
 *
 * The intermediate legacy SHA-256 exists only in request memory so old database fingerprints can be
 * re-keyed into the same identity. New observations persist only the keyed fingerprint.
 */
export async function valueFingerprint(value: unknown): Promise<{
  valueHash: string;
  legacyValueHash: string;
  version: 'hmac-sha256-v1';
}> {
  const legacyValueHash = await sha256Hex(stableJson(value));
  return {
    valueHash: await keyedValueFingerprintFromLegacyHash(legacyValueHash),
    legacyValueHash,
    version: 'hmac-sha256-v1'
  };
}
