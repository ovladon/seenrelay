import { neon } from '@neondatabase/serverless';
import type { AggregateRow, JsonValue } from './types.js';
import { normalizeStoredValueFingerprint } from './value-fingerprint.js';

export type SourceValidatorKind = 'etag' | 'last_modified' | 'content_hash' | 'other';

export interface SourceValidator {
  kind: SourceValidatorKind;
  value: string;
}

export interface CheckEvidenceRow extends AggregateRow {
  source_validator: SourceValidator | null;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return url;
}

function sql() { return neon(databaseUrl()); }

function parseSourceValidator(value: JsonValue | null): SourceValidator | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, JsonValue>;
  const kind = record.kind;
  const raw = record.value;
  if (!['etag', 'last_modified', 'content_hash', 'other'].includes(String(kind))) return null;
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 512 || /[\r\n]/.test(raw)) return null;
  return { kind: kind as SourceValidatorKind, value: raw };
}

function earlier(a: string, b: string): string { return Date.parse(a) <= Date.parse(b) ? a : b; }
function later(a: string, b: string): string { return Date.parse(a) >= Date.parse(b) ? a : b; }

/**
 * CHECK evidence plus the validator attached to the newest observation in each value group.
 * Stored pre-L2 SHA-256 fingerprints are re-keyed in application memory and conservatively merged
 * with hmac-sha256-v1 rows. Raw submitted values are not read.
 */
export async function getRecentValueGroupsWithValidators(factKey: string, cutoffIso: string): Promise<CheckEvidenceRow[]> {
  const rows = await sql().query(`SELECT
      o.value_hash,
      MAX(o.observed_at)::text AS last_seen,
      MIN(o.observed_at)::text AS first_seen,
      COUNT(*)::int AS observations,
      COUNT(DISTINCT o.observer_key)::int AS observers,
      COUNT(DISTINCT CASE WHEN o.observer_key LIKE 'ed25519:%' THEN o.observer_key END)::int AS cryptographic_observers,
      COUNT(DISTINCT CASE WHEN o.observer_key NOT LIKE 'ed25519:%' THEN o.observer_key END)::int AS unverified_observers,
      (
        SELECT o2.source_validator_json
        FROM observations_recent o2
        WHERE o2.fact_key = o.fact_key
          AND o2.value_hash = o.value_hash
          AND o2.observed_at >= $2::timestamptz
        ORDER BY o2.observed_at DESC, o2.received_at DESC
        LIMIT 1
      ) AS source_validator
    FROM observations_recent o
    WHERE o.fact_key = $1 AND o.observed_at >= $2::timestamptz
    GROUP BY o.fact_key, o.value_hash
    ORDER BY MAX(o.observed_at) DESC
    LIMIT 8`, [factKey, cutoffIso]) as Array<AggregateRow & { source_validator: JsonValue | null }>;

  const merged = new Map<string, CheckEvidenceRow>();
  for (const row of rows) {
    const valueHash = await normalizeStoredValueFingerprint(row.value_hash);
    const validator = parseSourceValidator(row.source_validator);
    const existing = merged.get(valueHash);
    if (!existing) {
      merged.set(valueHash, { ...row, value_hash: valueHash, source_validator: validator });
      continue;
    }

    const rowIsNewer = Date.parse(row.last_seen) > Date.parse(existing.last_seen);
    merged.set(valueHash, {
      value_hash: valueHash,
      first_seen: earlier(existing.first_seen, row.first_seen),
      last_seen: later(existing.last_seen, row.last_seen),
      observations: existing.observations + row.observations,
      // Alias groups can contain the same observer on both sides of the transition. Max is a
      // conservative lower bound that avoids falsely inflating independence evidence.
      observers: Math.max(existing.observers, row.observers),
      cryptographic_observers: Math.max(existing.cryptographic_observers, row.cryptographic_observers),
      unverified_observers: Math.max(existing.unverified_observers, row.unverified_observers),
      source_validator: rowIsNewer ? validator : existing.source_validator
    });
  }

  return [...merged.values()]
    .sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen))
    .slice(0, 4);
}
