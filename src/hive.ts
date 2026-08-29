import { config } from './config.js';
import {
  consumeHiveCheck, createHiveLease,
  recordHiveMetric, recordHiveOperation, touchHiveObserve
} from './db.js';
import { runtimePolicy } from './controls.js';
import { consumeHiveNetworkBudget, consumeHiveNewLeaseAdmission } from './hive-admission-db.js';
import { bindHiveIndependenceKey } from './hive-independence-db.js';
import { getActiveHiveAdmissionLeaseByClientKey, getHiveAdmissionLeaseById } from './hive-lease-admission-db.js';
import { deriveAdmissionNetworkKey, deriveClientKey, deriveOperationNetworkKey, deriveReuseIndependenceKey, privacyScopedHash } from './identity.js';
import { creditUsefulReuseGuarded } from './reuse.js';
import type { CheckStatus, HiveClass, HiveLeaseRow, HivePublicState } from './types.js';

interface LeaseTokenPayload { v: 1; lease_id: string; issued_at: string; expires_at: string; }
type LeaseVerification = { payload: LeaseTokenPayload; key: 'current' | 'previous' };
export interface HiveAdmission {
  allowed: boolean;
  reason?: 'rate_limited' | 'admission_limited' | 'runtime_disabled';
  leaseId: string;
  token: string;
  state: HivePublicState;
  rewardsEnabled: boolean;
}

function textBytes(value: string): Uint8Array<ArrayBuffer> { return new TextEncoder().encode(value); }
function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64urlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try { const raw = atob(padded); return Uint8Array.from(raw, (ch) => ch.charCodeAt(0)); } catch { return null; }
}

function configuredSigningSecrets(): { current: string | null; previous: string | null } {
  const current = process.env.HIVE_SIGNING_SECRET?.trim() || null;
  const previous = process.env.HIVE_SIGNING_SECRET_PREVIOUS?.trim() || null;
  if (current && current.length < 32) throw new Error('HIVE_SIGNING_SECRET must contain at least 32 characters when configured.');
  if (previous && previous.length < 32) throw new Error('HIVE_SIGNING_SECRET_PREVIOUS must contain at least 32 characters when configured.');
  if (previous && !current) throw new Error('HIVE_SIGNING_SECRET_PREVIOUS cannot be configured without HIVE_SIGNING_SECRET.');
  if (previous && current === previous) throw new Error('HIVE_SIGNING_SECRET_PREVIOUS must differ from HIVE_SIGNING_SECRET.');
  return { current, previous };
}
async function fallbackSigningMaterial(): Promise<string> {
  return privacyScopedHash('hive-lease-hmac', 'seenrelay-hive-lease-v1');
}
async function importHmac(material: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', textBytes(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function currentHmacKey(): Promise<CryptoKey> {
  const { current } = configuredSigningSecrets();
  return importHmac(current || await fallbackSigningMaterial());
}
async function verificationKeys(): Promise<Array<{ key: 'current' | 'previous'; cryptoKey: CryptoKey }>> {
  const { current, previous } = configuredSigningSecrets();
  const keys: Array<{ key: 'current' | 'previous'; cryptoKey: CryptoKey }> = [
    { key: 'current', cryptoKey: await importHmac(current || await fallbackSigningMaterial()) }
  ];
  if (previous) keys.push({ key: 'previous', cryptoKey: await importHmac(previous) });
  return keys;
}

async function signLease(payload: LeaseTokenPayload): Promise<string> {
  const encoded = base64urlEncode(textBytes(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await currentHmacKey(), textBytes(encoded));
  return `${encoded}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function verifyLease(token: string | null, nowMs: number): Promise<LeaseVerification | null> {
  if (!token || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signatureText] = parts;
  if (!encoded || !signatureText) return null;
  const signature = base64urlDecode(signatureText);
  const payloadBytes = base64urlDecode(encoded);
  if (!signature || !payloadBytes) return null;
  let matched: 'current' | 'previous' | null = null;
  for (const candidate of await verificationKeys()) {
    if (await crypto.subtle.verify('HMAC', candidate.cryptoKey, signature, textBytes(encoded))) { matched = candidate.key; break; }
  }
  if (!matched) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(payloadBytes)); } catch { return null; }
  const p = parsed as Partial<LeaseTokenPayload>;
  if (p.v !== 1 || typeof p.lease_id !== 'string' || typeof p.issued_at !== 'string' || typeof p.expires_at !== 'string') return null;
  const expiry = Date.parse(p.expires_at); const issued = Date.parse(p.issued_at);
  if (!Number.isFinite(expiry) || !Number.isFinite(issued) || expiry <= nowMs || issued > nowMs + 300_000) return null;
  return { payload: p as LeaseTokenPayload, key: matched };
}

export function hiveSigningRotationState(): { dedicated: boolean; previousVerificationKeyActive: boolean } {
  const { current, previous } = configuredSigningSecrets();
  return { dedicated: Boolean(current), previousVerificationKeyActive: Boolean(previous) };
}

export function hiveClass(row: Pick<HiveLeaseRow, 'useful_reuse_generated' | 'contribution_score'>): HiveClass {
  if (row.useful_reuse_generated <= 0) return 'new';
  if (row.contribution_score < 10) return 'established';
  return 'contributor';
}
function publicState(row: HiveLeaseRow, token: string, retryAfterSeconds?: number): HivePublicState {
  return {
    lease: token, class: hiveClass(row), check_tokens_remaining: Math.max(0, Math.round(row.check_tokens * 1000) / 1000),
    contribution_score: Math.round(row.contribution_score * 1000) / 1000,
    useful_reuse_generated: row.useful_reuse_generated, useful_reuse_consumed: row.useful_reuse_consumed,
    free_bootstrap: true, ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {})
  };
}
function emptyState(retryAfterSeconds: number): HivePublicState {
  return {
    lease: '', class: 'new', check_tokens_remaining: 0, contribution_score: 0,
    useful_reuse_generated: 0, useful_reuse_consumed: 0, free_bootstrap: true,
    retry_after_seconds: retryAfterSeconds
  };
}
function disabledState(): HivePublicState { return emptyState(60); }
async function operationalClientKey(request: Request | undefined): Promise<string> {
  if (request) return deriveClientKey(request);
  return `transportless:${await privacyScopedHash('transportless-hive', crypto.randomUUID())}`;
}
async function bindIndependence(request: Request | undefined, leaseId: string): Promise<void> {
  if (!request) return;
  await bindHiveIndependenceKey(leaseId, await deriveReuseIndependenceKey(request));
}
async function newLeaseAdmissionKey(request: Request | undefined): Promise<string> {
  if (request) return deriveAdmissionNetworkKey(request);
  // Do not invent a transportless actor identity. All such calls share one conservative bucket.
  return `admission-transportless:${await privacyScopedHash('lease-admission', 'transportless')}`;
}
async function operationAdmissionKey(request: Request | undefined, operation: 'check' | 'observe'): Promise<string> {
  if (request) return deriveOperationNetworkKey(request, operation);
  // Transportless callers have no network evidence, so they share one conservative operation bucket.
  return `operation-network:${operation}:${await privacyScopedHash(`operation-admission-${operation}`, 'transportless')}`;
}
type EnsureLeaseResult =
  | { allowed: true; row: HiveLeaseRow; token: string }
  | { allowed: false; retryAfterSeconds: number };

async function ensureLease(request: Request | undefined, nowMs: number): Promise<EnsureLeaseResult> {
  const cfg = config(); const nowIso = new Date(nowMs).toISOString();
  const supplied = request?.headers.get('x-seenrelay-lease') || null;
  const verified = await verifyLease(supplied, nowMs);
  if (verified) {
    const row = await getHiveAdmissionLeaseById(verified.payload.lease_id, nowIso);
    if (row) {
      if (row.independence_key === null) await bindIndependence(request, row.lease_id);
      // A token accepted with the previous key is immediately re-issued under the current key.
      const token = verified.key === 'current' ? supplied! : await signLease({ v: 1, lease_id: row.lease_id, issued_at: row.issued_at, expires_at: row.expires_at });
      return { allowed: true, row, token };
    }
  }
  const clientKey = await operationalClientKey(request);
  const existing = await getActiveHiveAdmissionLeaseByClientKey(clientKey, nowIso);
  if (existing) {
    if (existing.independence_key === null) await bindIndependence(request, existing.lease_id);
    return { allowed: true, row: existing, token: await signLease({ v: 1, lease_id: existing.lease_id, issued_at: existing.issued_at, expires_at: existing.expires_at }) };
  }
  const [admissionKey, independenceKey] = await Promise.all([
    newLeaseAdmissionKey(request),
    request ? deriveReuseIndependenceKey(request) : Promise.resolve(null)
  ]);
  const admission = await consumeHiveNewLeaseAdmission(admissionKey, nowIso, cfg.hiveMaxNewLeasesPerNetworkPerMinute);
  if (!admission.allowed) return { allowed: false, retryAfterSeconds: admission.retry_after_seconds };

  const leaseId = crypto.randomUUID();
  const expiresIso = new Date(nowMs + cfg.hiveLeaseTtlSeconds * 1000).toISOString();
  const row = await createHiveLease(leaseId, clientKey, nowIso, expiresIso, cfg.hiveCheckCapacity);
  if (independenceKey) await bindHiveIndependenceKey(row.lease_id, independenceKey);
  const token = await signLease({ v: 1, lease_id: row.lease_id, issued_at: row.issued_at, expires_at: row.expires_at });
  await recordHiveMetric('NEW_LEASE', 1, nowIso);
  return { allowed: true, row, token };
}
function retryAfter(row: HiveLeaseRow, refillPerMinute: number): number {
  if (refillPerMinute <= 0) return 60;
  return Math.max(1, Math.ceil(((1 - Math.max(0, row.check_tokens)) / refillPerMinute) * 60));
}

export async function admitHive(request: Request | undefined, operation: 'check' | 'observe'): Promise<HiveAdmission> {
  const cfg = config();
  const policy = await runtimePolicy(operation);
  // Critical financial circuit-breaker invariant: a disabled operation returns before lease lookup,
  // creation, token-bucket mutation, telemetry, or any other stateful Hive work.
  if (!policy.allowed) {
    return { allowed: false, reason: 'runtime_disabled', leaseId: '', token: '', state: disabledState(), rewardsEnabled: false };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const operationLimit = operation === 'check'
    ? cfg.hiveMaxChecksPerNetworkPerMinute
    : cfg.hiveMaxObservesPerNetworkPerMinute;
  const operationAdmission = await consumeHiveNetworkBudget(
    await operationAdmissionKey(request, operation), nowIso, operationLimit
  );
  if (!operationAdmission.allowed) {
    return {
      allowed: false, reason: 'admission_limited', leaseId: '', token: '',
      state: emptyState(operationAdmission.retry_after_seconds), rewardsEnabled: policy.rewardsEnabled
    };
  }

  // The aggregate network ceiling is deliberately consumed before lease lookup/creation. Changing a
  // caller-controlled client hint can create a separate continuity lease, but cannot bypass this budget.
  const ensured = await ensureLease(request, nowMs);
  if (!ensured.allowed) {
    return { allowed: false, reason: 'admission_limited', leaseId: '', token: '', state: emptyState(ensured.retryAfterSeconds), rewardsEnabled: policy.rewardsEnabled };
  }
  if (operation === 'observe') {
    const touched = await touchHiveObserve(ensured.row.lease_id, nowIso) || ensured.row;
    return { allowed: true, leaseId: touched.lease_id, token: ensured.token, state: publicState(touched, ensured.token), rewardsEnabled: policy.rewardsEnabled };
  }
  const mCap = policy.capacityMultiplier; const mRefill = policy.refillMultiplier;
  const baseRefill = cfg.hiveCheckRefillPerMinute * mRefill;
  const consumed = await consumeHiveCheck(
    ensured.row.lease_id, nowIso,
    cfg.hiveCheckCapacity * mCap,
    cfg.hiveCapacityBonusPerScore * mCap,
    cfg.hiveMaxCapacityBonus * mCap,
    baseRefill,
    cfg.hiveRefillBonusPerScorePerMinute * mRefill,
    cfg.hiveMaxRefillBonusPerMinute * mRefill
  );
  if (!consumed) {
    return { allowed: false, reason: 'rate_limited', leaseId: ensured.row.lease_id, token: ensured.token, state: publicState(ensured.row, ensured.token, 1), rewardsEnabled: policy.rewardsEnabled };
  }
  if (!consumed.allowed) {
    const refill = baseRefill + Math.min(cfg.hiveMaxRefillBonusPerMinute * mRefill, consumed.contribution_score * cfg.hiveRefillBonusPerScorePerMinute * mRefill);
    return { allowed: false, reason: 'rate_limited', leaseId: consumed.lease_id, token: ensured.token, state: publicState(consumed, ensured.token, retryAfter(consumed, refill)), rewardsEnabled: policy.rewardsEnabled };
  }
  return { allowed: true, leaseId: consumed.lease_id, token: ensured.token, state: publicState(consumed, ensured.token), rewardsEnabled: policy.rewardsEnabled };
}

export async function finishHiveCheck(admission: HiveAdmission, result: { status: CheckStatus; fact_key: string; latest_value_hash?: string; max_age_seconds: number; }): Promise<{state: HivePublicState; usefulReuseAwards: number}> {
  const nowIso = new Date().toISOString();
  await Promise.all([recordHiveOperation(admission.leaseId, result.fact_key, 'CHECK', result.status, nowIso), recordHiveMetric(result.status, 1, nowIso)]);
  let awards = 0;
  if (admission.rewardsEnabled && (result.status === 'SAME_OBSERVED' || result.status === 'CHANGED_OBSERVED') && result.latest_value_hash) {
    const cfg = config(); const cutoffIso = new Date(Date.now() - result.max_age_seconds * 1000).toISOString();
    awards = await creditUsefulReuseGuarded(result.fact_key, result.latest_value_hash, cutoffIso, admission.leaseId, nowIso, cfg.usefulReuseScoreUnits, cfg.usefulReuseDailyAwardCap);
    // Public utility telemetry is CHECK-level, not contributor-award-level. One CHECK that reuses
    // one or many qualifying observations counts as exactly one useful-reuse CHECK.
    if (awards > 0) await recordHiveMetric('USEFUL_REUSE', 1, nowIso);
  }
  // recordHiveOperation/recordHiveMetric do not change any public state field. A successful guarded
  // reuse award changes only the consumer's useful_reuse_consumed counter, so reflect that known
  // mutation locally instead of paying another database round-trip to read back the lease.
  const state = awards > 0
    ? { ...admission.state, useful_reuse_consumed: admission.state.useful_reuse_consumed + 1 }
    : admission.state;
  return { state, usefulReuseAwards: awards };
}

export async function finishHiveObserve(admission: HiveAdmission, factKey: string, outcome: 'accepted' | 'deduplicated'): Promise<HivePublicState> {
  const nowIso = new Date().toISOString();
  await Promise.all([recordHiveOperation(admission.leaseId, factKey, 'OBSERVE', outcome, nowIso), recordHiveMetric('OBSERVE', 1, nowIso)]);
  // Admission already touched the lease. Finalization only records hidden operational metadata and
  // aggregate telemetry, so the public state remains exactly the admission snapshot.
  return admission.state;
}

export async function verifyHiveLeaseTokenForTest(token: string, nowMs = Date.now()): Promise<{ leaseId: string; key: 'current'|'previous' } | null> {
  const verified = await verifyLease(token, nowMs);
  return verified ? { leaseId: verified.payload.lease_id, key: verified.key } : null;
}
