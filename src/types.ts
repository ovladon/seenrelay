export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface FactLocator {
  scheme: 'json_pointer' | 'element_id' | 'source_key';
  value: string;
}

export interface FactDescriptor {
  /** Human-readable label. It is intentionally excluded from the canonical fact key. */
  subject: string;
  /** Stable shared machine identifier. Used in the fact key when no source-native locator is supplied. */
  predicate: string;
  qualifiers?: Record<string, JsonValue>;
  source: string;
  /** Stable source-native location of the value when the source exposes one. Preferred identity discriminator. */
  locator?: FactLocator;
}

export interface ObserverProof {
  scheme: 'ed25519-v1';
  /** Raw 32-byte Ed25519 public key encoded as unpadded base64url. */
  public_key: string;
  /** ISO-8601 proof creation timestamp. */
  timestamp: string;
  /** 16..64 random bytes encoded as unpadded base64url. */
  nonce: string;
  /** Raw 64-byte Ed25519 signature encoded as unpadded base64url. */
  signature: string;
}

export interface CheckRequest {
  fact: FactDescriptor;
  known_value: JsonValue;
  max_age_seconds?: number;
}

export interface ObserveRequest {
  fact: FactDescriptor;
  value: JsonValue;
  observed_at?: string;
  observer_id?: string;
  observer_proof?: ObserverProof;
  evidence_fingerprint?: string;
  source_validator?: {
    kind: 'etag' | 'last_modified' | 'content_hash' | 'other';
    value: string;
  };
  idempotency_key?: string;
}

export type CheckStatus =
  | 'SAME_OBSERVED'
  | 'CHANGED_OBSERVED'
  | 'CONTESTED'
  | 'STALE'
  | 'UNKNOWN';

export type HiveClass = 'new' | 'established' | 'contributor';

export interface HivePublicState {
  lease: string;
  class: HiveClass;
  check_tokens_remaining: number;
  contribution_score: number;
  useful_reuse_generated: number;
  useful_reuse_consumed: number;
  free_bootstrap: true;
  retry_after_seconds?: number;
}

export interface FactRow {
  fact_key: string;
  subject: string;
  predicate: string;
  qualifiers_json: JsonValue;
  source_url: string;
  last_observed_at: string | null;
  observation_total: number;
  current_value_hash: string | null;
  current_first_seen_at: string | null;
  current_last_seen_at: string | null;
  previous_value_hash: string | null;
  previous_last_seen_at: string | null;
}

export interface AggregateRow {
  value_hash: string;
  last_seen: string;
  first_seen: string;
  observations: number;
  observers: number;
  cryptographic_observers: number;
  unverified_observers: number;
}

export interface HiveLeaseRow {
  lease_id: string;
  /** Fine-grained pseudonymous continuity fingerprint for recovering an accountless lease. */
  client_key: string;
  issued_at: string;
  expires_at: string;
  last_seen_at: string;
  last_refill_at: string;
  check_tokens: number;
  check_count: number;
  observe_count: number;
  useful_reuse_generated: number;
  useful_reuse_consumed: number;
  contribution_score: number;
  last_fact_key: string | null;
  last_operation: string | null;
  last_outcome: string | null;
}
