import { neon } from '@neondatabase/serverless';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

export interface HiveNetworkAdmission { allowed: boolean; retry_after_seconds: number; }

/**
 * Atomically consumes one slot from a coarse fixed-minute network budget. The caller supplies a
 * domain-separated, privacy-scoped key (new lease, CHECK, or OBSERVE). This is an abuse ceiling,
 * not actor identity, observer provenance, reward independence, or a truth-confidence signal.
 */
export async function consumeHiveNetworkBudget(
  budgetKey: string,
  nowIso: string,
  maxPerMinute: number
): Promise<HiveNetworkAdmission> {
  const rows = await sql().query(`WITH bucket AS (
      SELECT date_trunc('minute', $2::timestamptz) AS window_start
    ), admitted AS (
      INSERT INTO hive_admission_windows (admission_key, window_start, admissions, updated_at)
      SELECT $1, window_start, 1, $2::timestamptz FROM bucket
      ON CONFLICT (admission_key, window_start) DO UPDATE SET
        admissions = hive_admission_windows.admissions + 1,
        updated_at = EXCLUDED.updated_at
      WHERE hive_admission_windows.admissions < $3::int
      RETURNING admissions
    )
    SELECT
      EXISTS(SELECT 1 FROM admitted) AS allowed,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((SELECT window_start FROM bucket) + interval '1 minute' - $2::timestamptz))))::int AS retry_after_seconds`,
    [budgetKey, nowIso, maxPerMinute]) as HiveNetworkAdmission[];
  return rows[0] || { allowed: false, retry_after_seconds: 60 };
}

/**
 * Separate flood brake for creation of NEW leases. Existing leases do not call this wrapper.
 */
export async function consumeHiveNewLeaseAdmission(
  admissionKey: string,
  nowIso: string,
  maxAdmissionsPerMinute: number
): Promise<HiveNetworkAdmission> {
  return consumeHiveNetworkBudget(admissionKey, nowIso, maxAdmissionsPerMinute);
}
