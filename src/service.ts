import { canonicalFactKey, ValidationError } from './canonical.js';
import { config } from './config.js';
import { acceptObservation, cleanupTouchedFact, getFact, getObserverState } from './db.js';
import { getRecentValueGroupsWithValidators } from './check-evidence.js';
import type { SourceValidator } from './check-evidence.js';
import { deriveObserverIdentity } from './identity.js';
import { predicateGuidance } from './predicates.js';
import type { CheckRequest, JsonValue, ObserveRequest } from './types.js';
import { normalizeStoredValueFingerprint, valueFingerprint } from './value-fingerprint.js';

function isoFromMs(ms: number): string { return new Date(ms).toISOString(); }
function epochMs(iso: string): number { return Date.parse(iso); }

function parseObservedAt(iso: string | undefined, nowMs: number, cfg: ReturnType<typeof config>): string {
  if (!iso) return isoFromMs(nowMs);
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new ValidationError('observed_at must be an ISO-8601 timestamp');
  if (ms > nowMs + cfg.maxFutureSkewSeconds * 1000) throw new ValidationError('observed_at is too far in the future');
  if (ms < nowMs - cfg.maxObservationAgeSeconds * 1000) throw new ValidationError('observed_at is too old for the freshness network');
  return isoFromMs(ms);
}

function clampMaxAge(requested: number | undefined, cfg: ReturnType<typeof config>): number {
  if (requested === undefined) return cfg.defaultMaxAgeSeconds;
  if (!Number.isInteger(requested) || requested < 1 || requested > cfg.maxMaxAgeSeconds) {
    throw new ValidationError(`max_age_seconds must be an integer between 1 and ${cfg.maxMaxAgeSeconds}`);
  }
  return requested;
}

function factIdentityMetadata(fact: Awaited<ReturnType<typeof canonicalFactKey>>) {
  const guidance = fact.identityBasis === 'predicate' ? predicateGuidance(fact.predicate) : undefined;
  return {
    fact_identity_version: fact.identityVersion,
    fact_identity_basis: fact.identityBasis,
    ...(guidance ? { predicate_guidance: guidance } : {})
  };
}

function sourceValidatorMetadata(validator: SourceValidator | null) {
  if (!validator) return {};
  const conditionalRequestHint = validator.kind === 'etag'
    ? { request_header: 'If-None-Match', header_value: validator.value }
    : validator.kind === 'last_modified'
      ? { request_header: 'If-Modified-Since', header_value: validator.value }
      : undefined;
  return {
    source_validator: validator,
    source_validator_assurance: 'observer_supplied_unverified' as const,
    ...(conditionalRequestHint ? { conditional_request_hint: conditionalRequestHint } : {}),
    source_validator_caveat: 'Observer-supplied metadata only. SeenRelay did not verify this validator against the source.'
  };
}

export async function checkFact(body: CheckRequest) {
  if (!body || typeof body !== 'object' || !('known_value' in body)) throw new ValidationError('known_value is required');
  const cfg = config();
  const nowMs = Date.now();
  const maxAge = clampMaxAge(body.max_age_seconds, cfg);
  const fact = await canonicalFactKey(body.fact);
  const known = await valueFingerprint(body.known_value);
  const stored = await getFact(fact.factKey);

  if (!stored || !stored.last_observed_at) {
    return {
      status: 'UNKNOWN' as const,
      fact_key: fact.factKey,
      ...factIdentityMetadata(fact),
      max_age_seconds: maxAge,
      next_step: 'VALIDATE_THEN_OBSERVE' as const,
      accepted_observation_can_answer_later_checks: true,
      note: 'No accepted observation exists. Validate normally, then OBSERVE; later CHECKs, including from the same integration or fleet, can benefit.'
    };
  }

  const cutoffIso = isoFromMs(nowMs - maxAge * 1000);
  const groups = await getRecentValueGroupsWithValidators(fact.factKey, cutoffIso);
  if (groups.length === 0) {
    return {
      status: 'STALE' as const,
      fact_key: fact.factKey,
      ...factIdentityMetadata(fact),
      known_value_hash: known.valueHash,
      value_fingerprint_version: known.version,
      last_observed_at: stored.last_observed_at,
      age_seconds: Math.max(0, Math.floor((nowMs - epochMs(stored.last_observed_at)) / 1000)),
      max_age_seconds: maxAge,
      observation_total: stored.observation_total,
      next_step: 'VALIDATE_THEN_OBSERVE' as const,
      accepted_observation_can_answer_later_checks: true
    };
  }

  const latest = groups[0]!;
  const second = groups[1];
  const contested = Boolean(second && Math.abs(epochMs(latest.last_seen) - epochMs(second.last_seen)) <= cfg.conflictWindowSeconds * 1000);
  const evidence = groups.map((g) => ({
    value_hash: g.value_hash,
    first_seen: g.first_seen,
    last_seen: g.last_seen,
    age_seconds: Math.max(0, Math.floor((nowMs - epochMs(g.last_seen)) / 1000)),
    observations: g.observations,
    observer_keys: g.observers,
    cryptographic_observer_keys: g.cryptographic_observers,
    unverified_observer_keys: g.unverified_observers,
    ...(g.source_validator ? {
      source_validator: g.source_validator,
      source_validator_assurance: 'observer_supplied_unverified' as const
    } : {})
  }));

  if (contested) {
    return {
      status: 'CONTESTED' as const,
      fact_key: fact.factKey,
      ...factIdentityMetadata(fact),
      known_value_hash: known.valueHash,
      value_fingerprint_version: known.version,
      max_age_seconds: maxAge,
      conflict_window_seconds: cfg.conflictWindowSeconds,
      evidence,
      caveat: 'Distinct observer keys are signals, not proof of independent real-world actors. Cryptographic keys prove key possession and continuity only.'
    };
  }

  const same = latest.value_hash === known.valueHash;
  return {
    status: same ? ('SAME_OBSERVED' as const) : ('CHANGED_OBSERVED' as const),
    fact_key: fact.factKey,
    ...factIdentityMetadata(fact),
    known_value_hash: known.valueHash,
    latest_value_hash: latest.value_hash,
    value_fingerprint_version: known.version,
    first_seen_latest: latest.first_seen,
    last_seen_latest: latest.last_seen,
    age_seconds: Math.max(0, Math.floor((nowMs - epochMs(latest.last_seen)) / 1000)),
    max_age_seconds: maxAge,
    recent_observations: latest.observations,
    recent_observer_keys: latest.observers,
    recent_cryptographic_observer_keys: latest.cryptographic_observers,
    recent_unverified_observer_keys: latest.unverified_observers,
    ...sourceValidatorMetadata(latest.source_validator),
    evidence,
    caveat: 'SeenRelay reports recent observations; it does not assert universal truth. Cryptographic observer proofs establish key possession, not independent-world identity.'
  };
}

export async function observeFact(request: Request | undefined, body: ObserveRequest, leaseId: string | null = null) {
  if (!body || typeof body !== 'object' || !('value' in body)) throw new ValidationError('value is required');
  const cfg = config();
  const nowMs = Date.now();
  const receivedAtIso = isoFromMs(nowMs);
  const observedAtIso = parseObservedAt(body.observed_at, nowMs, cfg);
  const fact = await canonicalFactKey(body.fact);
  const value = await valueFingerprint(body.value);
  const observer = await deriveObserverIdentity(request, body, nowMs, cfg.observerProofMaxSkewSeconds);

  if (body.evidence_fingerprint && body.evidence_fingerprint.length > 256) throw new ValidationError('evidence_fingerprint is too long');
  let sourceValidator: JsonValue | null = null;
  if (body.source_validator) {
    if (!['etag', 'last_modified', 'content_hash', 'other'].includes(body.source_validator.kind)) throw new ValidationError('source_validator.kind is invalid');
    if (!body.source_validator.value || body.source_validator.value.length > 512) throw new ValidationError('source_validator.value must be 1..512 characters');
    if (/[\r\n]/.test(body.source_validator.value)) throw new ValidationError('source_validator.value must not contain CR or LF');
    sourceValidator = body.source_validator as unknown as JsonValue;
  }

  const prior = await getObserverState(fact.factKey, observer.key);
  const priorValueHash = prior ? await normalizeStoredValueFingerprint(prior.last_value_hash) : null;
  if (prior && priorValueHash === value.valueHash && nowMs - epochMs(prior.last_received_at) < cfg.dedupWindowSeconds * 1000) {
    return {
      accepted: false,
      deduplicated: true,
      fact_key: fact.factKey,
      ...factIdentityMetadata(fact),
      value_hash: value.valueHash,
      value_fingerprint_version: value.version,
      observer_identity: observer.kind,
      observer_assurance: observer.assurance,
      future_check_eligible: true,
      reason: `same observer/value seen within ${cfg.dedupWindowSeconds}s`
    };
  }

  const idempotency = body.idempotency_key?.trim();
  if (idempotency && idempotency.length > 128) throw new ValidationError('idempotency_key is too long');
  const observationId = idempotency
    ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`idem|${fact.factKey}|${observer.key}|${idempotency}`))
        .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''))
    : observer.proofFingerprint
      ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`proof|${fact.factKey}|${observer.key}|${observer.proofFingerprint}`))
          .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''))
      : crypto.randomUUID();

  const inserted = await acceptObservation({
    observationId,
    factKey: fact.factKey,
    subject: fact.subject,
    predicate: fact.predicate,
    qualifiersJson: fact.qualifiersJson,
    sourceUrl: fact.sourceUrl,
    valueHash: value.valueHash,
    observedAtIso,
    receivedAtIso,
    observerKey: observer.key,
    leaseId,
    evidenceFingerprint: body.evidence_fingerprint || null,
    sourceValidator
  });

  if (!inserted) {
    return {
      accepted: false,
      deduplicated: true,
      fact_key: fact.factKey,
      ...factIdentityMetadata(fact),
      value_hash: value.valueHash,
      value_fingerprint_version: value.version,
      observer_identity: observer.kind,
      observer_assurance: observer.assurance,
      future_check_eligible: true,
      reason: 'idempotent or cryptographic-proof replay'
    };
  }

  const retentionCutoffIso = isoFromMs(nowMs - cfg.retentionSeconds * 1000);
  await cleanupTouchedFact(fact.factKey, retentionCutoffIso);

  return {
    accepted: true,
    deduplicated: false,
    observation_id: observationId,
    fact_key: fact.factKey,
    ...factIdentityMetadata(fact),
    value_hash: value.valueHash,
    value_fingerprint_version: value.version,
    observed_at: observedAtIso,
    received_at: receivedAtIso,
    observer_identity: observer.kind,
    observer_assurance: observer.assurance,
    future_check_eligible: true,
    source_validator_recorded: sourceValidator !== null,
    caveat: observer.assurance === 'proof_of_possession'
      ? 'Observation is bound to a verified Ed25519 key. This proves key possession and continuity, not that the actor is independent or the value is true.'
      : 'Observation accepted as unverified provenance-bearing evidence, not certified truth.'
  };
}
