import { sha256Hex, stableJson, ValidationError } from './canonical.js';
import type { ObserveRequest, ObserverProof } from './types.js';

export type ObserverIdentityKind = 'cryptographic_key' | 'self_asserted' | 'anonymous_network_hint';
export type ObserverAssurance = 'proof_of_possession' | 'unverified';

export interface ObserverIdentity {
  key: string;
  kind: ObserverIdentityKind;
  assurance: ObserverAssurance;
  proofFingerprint?: string;
}

function privacySalt(): string {
  const salt = process.env.PRIVACY_SALT?.trim();
  if (salt && salt.length >= 32) return salt;
  if (process.env.VERCEL_ENV) throw new Error('PRIVACY_SALT must be configured with at least 32 characters in Vercel environments.');
  return 'seenrelay-local-development-salt-not-for-production';
}

export async function privacyScopedHash(scope: string, value: string): Promise<string> {
  return sha256Hex(`${privacySalt()}|${scope}|${value}`);
}

function base64urlDecode(value: string, field: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new ValidationError(`${field} must be unpadded base64url`);
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  let raw: string;
  try { raw = atob(padded); } catch { throw new ValidationError(`${field} is not valid base64url`); }
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

function bytesHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function proofEnvelope(body: ObserveRequest, proof: ObserverProof): string {
  const unsigned = { ...body } as Record<string, unknown>;
  delete unsigned.observer_proof;
  return stableJson({
    domain: 'seenrelay-observe-proof-v1', operation: 'OBSERVE', payload: unsigned,
    proof: { scheme: proof.scheme, public_key: proof.public_key, timestamp: proof.timestamp, nonce: proof.nonce }
  });
}

export function observerProofSigningPayload(body: ObserveRequest, proof: Omit<ObserverProof, 'signature'>): string {
  return proofEnvelope(body, { ...proof, signature: 'placeholder' });
}

async function verifyObserverProof(body: ObserveRequest, nowMs: number, maxSkewSeconds: number): Promise<ObserverIdentity> {
  const proof = body.observer_proof;
  if (!proof || typeof proof !== 'object') throw new ValidationError('observer_proof is required');
  if (proof.scheme !== 'ed25519-v1') throw new ValidationError('observer_proof.scheme must be ed25519-v1');
  const proofMs = Date.parse(proof.timestamp);
  if (!Number.isFinite(proofMs)) throw new ValidationError('observer_proof.timestamp must be an ISO-8601 timestamp');
  if (Math.abs(nowMs - proofMs) > maxSkewSeconds * 1000) throw new ValidationError(`observer_proof.timestamp must be within ${maxSkewSeconds}s of server time`);

  const publicKey = base64urlDecode(proof.public_key, 'observer_proof.public_key');
  const signature = base64urlDecode(proof.signature, 'observer_proof.signature');
  const nonce = base64urlDecode(proof.nonce, 'observer_proof.nonce');
  if (publicKey.length !== 32) throw new ValidationError('observer_proof.public_key must decode to 32 bytes');
  if (signature.length !== 64) throw new ValidationError('observer_proof.signature must decode to 64 bytes');
  if (nonce.length < 16 || nonce.length > 64) throw new ValidationError('observer_proof.nonce must decode to 16..64 bytes');

  let key: CryptoKey;
  try { key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']); }
  catch { throw new ValidationError('observer_proof.public_key is not a valid Ed25519 public key'); }
  const payload: Uint8Array<ArrayBuffer> = new TextEncoder().encode(proofEnvelope(body, proof));
  let valid = false;
  try { valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, payload); } catch { valid = false; }
  if (!valid) throw new ValidationError('observer_proof.signature is invalid');

  const publicKeyHex = bytesHex(publicKey);
  const signatureHex = bytesHex(signature);
  const keyHash = await privacyScopedHash('ed25519-v1', publicKeyHex);
  const proofFingerprint = await sha256Hex(`seenrelay-proof-v1|${publicKeyHex}|${signatureHex}`);
  return { key: `ed25519:${keyHash}`, kind: 'cryptographic_key', assurance: 'proof_of_possession', proofFingerprint };
}

function forwardedNetworkHint(request: Request): string {
  // Vercel documents x-forwarded-for as overwritten by the platform, preventing direct client spoofing.
  // A Preview-only override exists solely so CI can simulate distinct network buckets from one runner.
  if (process.env.VERCEL_ENV === 'preview') {
    const testHint = request.headers.get('x-seenrelay-test-network')?.trim();
    if (testHint && /^[A-Za-z0-9._:-]{1,128}$/.test(testHint)) return `preview-test:${testHint}`;
  }
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

/**
 * Lease-continuity fingerprint. It intentionally includes the optional client hint so multiple agents
 * behind the same egress can keep separate frictionless Hive slots. It is NOT used by itself to prove
 * independence for contributor rewards.
 */
export async function deriveClientKey(request: Request): Promise<string> {
  const networkHint = forwardedNetworkHint(request);
  const ua = request.headers.get('user-agent') || 'unknown';
  const clientHint = request.headers.get('x-seenrelay-client')?.trim() || '';
  return `client:${await privacyScopedHash('client', `${networkHint}|${ua}|${clientHint}`)}`;
}

/**
 * Conservative anti-farming bucket used for reward independence. User-controlled client/UA hints are
 * deliberately excluded. This is a frictionless Sybil-resistance signal, not proof of a unique actor.
 */
export async function deriveReuseIndependenceKey(request: Request): Promise<string> {
  const networkHint = forwardedNetworkHint(request);
  return `network:${await privacyScopedHash('reuse-independence', networkHint)}`;
}

export async function deriveObserverIdentity(
  request: Request | undefined,
  body: ObserveRequest,
  nowMs: number,
  maxProofSkewSeconds: number
): Promise<ObserverIdentity> {
  if (body.observer_proof) return verifyObserverProof(body, nowMs, maxProofSkewSeconds);
  const assertedId = body.observer_id;
  if (assertedId) {
    const clean = assertedId.normalize('NFKC').trim();
    if (!clean || clean.length > 128) throw new ValidationError('observer_id must be 1..128 characters');
    return { key: `self:${await privacyScopedHash('observer-self', clean)}`, kind: 'self_asserted', assurance: 'unverified' };
  }
  if (!request) throw new ValidationError('observer_proof or observer_id is required when transport metadata is unavailable');
  return { key: (await deriveClientKey(request)).replace(/^client:/, 'anon:'), kind: 'anonymous_network_hint', assurance: 'unverified' };
}
