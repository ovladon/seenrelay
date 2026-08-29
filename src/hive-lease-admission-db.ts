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

const columns = `lease_id, client_key, issued_at::text, expires_at::text, last_seen_at::text, last_refill_at::text,
  check_tokens::float8, check_count::int, observe_count::int, useful_reuse_generated::int,
  useful_reuse_consumed::int, contribution_score::float8, last_fact_key, last_operation, last_outcome,
  independence_key`;

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
