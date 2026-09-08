import { neon } from '@neondatabase/serverless';

export interface ReadinessAdmission { allowed: boolean; retry_after_seconds: number; }

export function resolveReadinessDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const isolated = env.READINESS_DATABASE_URL?.trim();
  if (isolated) return isolated;

  // A readiness-only deployment must never fall back into the SeenRelay core database.
  if (env.SEENRELAY_DEPLOYMENT_ROLE === 'readiness') {
    throw new Error('READINESS_DATABASE_URL is not configured for the readiness deployment');
  }

  // Compatibility bridge for the existing combined deployment during migration.
  const legacy = env.DATABASE_URL?.trim();
  if (legacy) return legacy;
  throw new Error('READINESS_DATABASE_URL is not configured');
}

function sql() {
  return neon(resolveReadinessDatabaseUrl());
}

export async function consumeReadinessNetworkBudget(
  budgetKey: string,
  nowIso: string,
  maxPerMinute: number
): Promise<ReadinessAdmission> {
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
    [budgetKey, nowIso, maxPerMinute]) as ReadinessAdmission[];
  return rows[0] || { allowed: false, retry_after_seconds: 60 };
}

export async function consumeReadinessMonthlyBudget(
  budgetKey: string,
  nowIso: string,
  maxPerMonth: number
): Promise<ReadinessAdmission> {
  const rows = await sql().query(`WITH bucket AS (
      SELECT date_trunc('month', $2::timestamptz) AS window_start
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
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((SELECT window_start FROM bucket) + interval '1 month' - $2::timestamptz))))::int AS retry_after_seconds`,
    [budgetKey, nowIso, maxPerMonth]) as ReadinessAdmission[];
  return rows[0] || { allowed: false, retry_after_seconds: 2_678_400 };
}
