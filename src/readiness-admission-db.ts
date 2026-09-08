import { neon } from '@neondatabase/serverless';
import { sha256Hex } from './canonical.js';

let isolatedReadinessAdmissionRequired = false;

function trimmed(name: string): string {
  return (process.env[name] || '').trim();
}

export function requireIsolatedReadinessAdmission(): void {
  isolatedReadinessAdmissionRequired = true;
}

function isolationRequired(): boolean {
  return isolatedReadinessAdmissionRequired
    || process.env.SEENRELAY_DEPLOYMENT_ROLE === 'readiness'
    || Boolean(trimmed('READINESS_DATABASE_URL'))
    || Boolean(trimmed('READINESS_PRIVACY_SALT'));
}

export function resolveReadinessDatabaseUrl(): string {
  const isolated = trimmed('READINESS_DATABASE_URL');
  if (isolated) return isolated;
  if (isolationRequired()) {
    throw new Error('READINESS_DATABASE_URL must be configured for isolated readiness admission.');
  }
  const legacy = trimmed('DATABASE_URL');
  if (!legacy) throw new Error('No readiness admission database is configured.');
  return legacy;
}

export function resolveReadinessPrivacySalt(): string {
  const isolated = trimmed('READINESS_PRIVACY_SALT');
  if (isolated) {
    if (isolated.length < 32) throw new Error('READINESS_PRIVACY_SALT must contain at least 32 characters.');
    return isolated;
  }
  if (isolationRequired()) {
    throw new Error('READINESS_PRIVACY_SALT must be configured for isolated readiness admission.');
  }
  const legacy = trimmed('PRIVACY_SALT');
  if (legacy) {
    if (legacy.length < 32) throw new Error('PRIVACY_SALT must contain at least 32 characters.');
    return legacy;
  }
  if (process.env.VERCEL_ENV) {
    throw new Error('READINESS_PRIVACY_SALT or PRIVACY_SALT must be configured in Vercel environments.');
  }
  return 'seenrelay-local-development-salt-not-for-production';
}

export async function readinessPrivacyScopedHash(scope: string, value: string): Promise<string> {
  return sha256Hex(`${resolveReadinessPrivacySalt()}|${scope}|${value}`);
}

function sql() {
  return neon(resolveReadinessDatabaseUrl());
}

export interface ReadinessAdmission { allowed: boolean; retry_after_seconds: number; }

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
