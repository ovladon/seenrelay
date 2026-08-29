import { neon } from '@neondatabase/serverless';
import type { HiveLeaseRow } from './types.js';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

const leaseColumns = `lease_id, client_key, issued_at::text, expires_at::text, last_seen_at::text, last_refill_at::text, check_tokens::float8, check_count::int, observe_count::int, useful_reuse_generated::int, useful_reuse_consumed::int, contribution_score::float8, last_fact_key, last_operation, last_outcome`;
const leaseColumnsFromH = `h.lease_id, h.client_key, h.issued_at::text AS issued_at, h.expires_at::text AS expires_at, h.last_seen_at::text AS last_seen_at, h.last_refill_at::text AS last_refill_at, h.check_tokens::float8 AS check_tokens, h.check_count::int AS check_count, h.observe_count::int AS observe_count, h.useful_reuse_generated::int AS useful_reuse_generated, h.useful_reuse_consumed::int AS useful_reuse_consumed, h.contribution_score::float8 AS contribution_score, h.last_fact_key, h.last_operation, h.last_outcome`;

/**
 * Resolve an active lease and bind its first conservative independence bucket in one database
 * round trip. Existing immutable bindings are returned without being rewritten.
 */
export async function getHiveLeaseByIdBound(
  leaseId: string,
  nowIso: string,
  independenceKey: string | null
): Promise<HiveLeaseRow | null> {
  const rows = await sql().query(`WITH bound AS (
      UPDATE hive_leases
      SET independence_key = $3
      WHERE lease_id = $1
        AND expires_at > $2::timestamptz
        AND independence_key IS NULL
        AND $3::text IS NOT NULL
      RETURNING ${leaseColumns}
    )
    SELECT * FROM bound
    UNION ALL
    SELECT ${leaseColumns}
    FROM hive_leases
    WHERE lease_id = $1
      AND expires_at > $2::timestamptz
      AND NOT EXISTS (SELECT 1 FROM bound)
    LIMIT 1`, [leaseId, nowIso, independenceKey]) as HiveLeaseRow[];
  return rows[0] || null;
}

/** Resolve the newest active continuity lease and perform the same first-bind operation atomically. */
export async function getActiveHiveLeaseByClientKeyBound(
  clientKey: string,
  nowIso: string,
  independenceKey: string | null
): Promise<HiveLeaseRow | null> {
  const rows = await sql().query(`WITH candidate AS (
      SELECT lease_id
      FROM hive_leases
      WHERE client_key = $1
        AND expires_at > $2::timestamptz
      ORDER BY last_seen_at DESC
      LIMIT 1
    ), bound AS (
      UPDATE hive_leases h
      SET independence_key = $3
      FROM candidate c
      WHERE h.lease_id = c.lease_id
        AND h.independence_key IS NULL
        AND $3::text IS NOT NULL
      RETURNING ${leaseColumnsFromH}
    )
    SELECT * FROM bound
    UNION ALL
    SELECT ${leaseColumnsFromH}
    FROM hive_leases h
    JOIN candidate c ON c.lease_id = h.lease_id
    WHERE NOT EXISTS (SELECT 1 FROM bound)
    LIMIT 1`, [clientKey, nowIso, independenceKey]) as HiveLeaseRow[];
  return rows[0] || null;
}
