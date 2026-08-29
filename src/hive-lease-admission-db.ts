import { neon } from '@neondatabase/serverless';
import type { HiveLeaseRow } from './types.js';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

export interface HiveAdmissionLeaseRow extends HiveLeaseRow {
  independence_key: string | null;
}

export interface HiveAdmissionConsumeResult extends HiveAdmissionLeaseRow {
  allowed: boolean;
}

const columns = `lease_id, client_key, issued_at::text, expires_at::text, last_seen_at::text, last_refill_at::text,
  check_tokens::float8, check_count::int, observe_count::int, useful_reuse_generated::int,
  useful_reuse_consumed::int, contribution_score::float8, last_fact_key, last_operation, last_outcome,
  independence_key`;
const columnsFromH = `h.lease_id, h.client_key, h.issued_at::text AS issued_at, h.expires_at::text AS expires_at,
  h.last_seen_at::text AS last_seen_at, h.last_refill_at::text AS last_refill_at,
  h.check_tokens::float8 AS check_tokens, h.check_count::int AS check_count, h.observe_count::int AS observe_count,
  h.useful_reuse_generated::int AS useful_reuse_generated, h.useful_reuse_consumed::int AS useful_reuse_consumed,
  h.contribution_score::float8 AS contribution_score, h.last_fact_key, h.last_operation, h.last_outcome,
  h.independence_key`;

/**
 * Admission-specific lease reads include the immutable independence binding so an already-bound
 * lease does not pay a redundant conditional UPDATE on every CHECK/OBSERVE.
 */
export async function getHiveAdmissionLeaseById(leaseId: string, nowIso: string): Promise<HiveAdmissionLeaseRow | null> {
  const rows = await sql().query(
    `SELECT ${columns} FROM hive_leases WHERE lease_id = $1 AND expires_at > $2::timestamptz`,
    [leaseId, nowIso]
  ) as HiveAdmissionLeaseRow[];
  return rows[0] || null;
}

export async function getActiveHiveAdmissionLeaseByClientKey(clientKey: string, nowIso: string): Promise<HiveAdmissionLeaseRow | null> {
  const rows = await sql().query(
    `SELECT ${columns} FROM hive_leases WHERE client_key = $1 AND expires_at > $2::timestamptz ORDER BY last_seen_at DESC LIMIT 1`,
    [clientKey, nowIso]
  ) as HiveAdmissionLeaseRow[];
  return rows[0] || null;
}

/**
 * Fast path for an already cryptographically verified lease token. The same atomic UPDATE both
 * preserves/initializes the immutable independence binding and consumes the CHECK token bucket.
 * A pre-existing independence key is never replaced.
 */
export async function consumeVerifiedHiveCheckLease(
  leaseId: string,
  nowIso: string,
  independenceKey: string | null,
  baseCapacity: number,
  capacityBonusPerScore: number,
  maxCapacityBonus: number,
  baseRefillPerMinute: number,
  refillBonusPerScorePerMinute: number,
  maxRefillBonusPerMinute: number
): Promise<HiveAdmissionConsumeResult | null> {
  const rows = await sql().query(`WITH calc AS (
    SELECT lease_id,
      LEAST(
        $4::float8 + LEAST($6::float8, contribution_score * $5::float8),
        check_tokens + GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - last_refill_at))) * (($7::float8 + LEAST($9::float8, contribution_score * $8::float8)) / 60.0)
      ) AS replenished
    FROM hive_leases
    WHERE lease_id = $1 AND expires_at > $2::timestamptz
  )
  UPDATE hive_leases h SET
    independence_key = COALESCE(h.independence_key, $3::text),
    check_tokens = CASE WHEN calc.replenished >= 1 THEN calc.replenished - 1 ELSE calc.replenished END,
    last_refill_at = $2::timestamptz,
    last_seen_at = $2::timestamptz,
    check_count = h.check_count + CASE WHEN calc.replenished >= 1 THEN 1 ELSE 0 END
  FROM calc
  WHERE h.lease_id = calc.lease_id
  RETURNING ${columnsFromH}, (calc.replenished >= 1) AS allowed`, [
    leaseId,
    nowIso,
    independenceKey,
    baseCapacity,
    capacityBonusPerScore,
    maxCapacityBonus,
    baseRefillPerMinute,
    refillBonusPerScorePerMinute,
    maxRefillBonusPerMinute
  ]) as HiveAdmissionConsumeResult[];
  return rows[0] || null;
}
