import { neon } from '@neondatabase/serverless';
import type { AggregateRow, JsonValue } from './types.js';

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

/**
 * CHECK evidence plus the validator attached to the newest observation in each value group.
 * The validator is observer-supplied metadata. Returning it does not verify it or make it identity-bearing.
 */
export async function getRecentValueGroupsWithValidators(factKey: string, cutoffIso: string): Promise<CheckEvidenceRow[]> {
  const rows = await sql().query(`SELECT
      o.value_hash,
      o.value_json,
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
    GROUP BY o.fact_key, o.value_hash, o.value_json
    ORDER BY MAX(o.observed_at) DESC
    LIMIT 4`, [factKey, cutoffIso]) as Array<AggregateRow & { source_validator: JsonValue | null }>;

  return rows.map((row) => ({
    ...row,
    source_validator: parseSourceValidator(row.source_validator)
  }));
}
