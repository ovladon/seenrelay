import { SERVICE_RELEASE } from './version.js';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function optionalNum(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function config() {
  return {
    brandName: process.env.BRAND_NAME || 'SeenRelay',
    version: SERVICE_RELEASE,
    paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true',
    paymentProvider: process.env.PAYMENT_PROVIDER || 'none',
    defaultMaxAgeSeconds: int('DEFAULT_MAX_AGE_SECONDS', 3600),
    maxMaxAgeSeconds: int('MAX_MAX_AGE_SECONDS', 604800),
    retentionSeconds: int('OBSERVATION_RETENTION_SECONDS', 604800),
    dedupWindowSeconds: int('DEDUP_WINDOW_SECONDS', 60),
    conflictWindowSeconds: int('CONFLICT_WINDOW_SECONDS', 120),
    maxObservationAgeSeconds: int('MAX_OBSERVATION_AGE_SECONDS', 604800),
    maxFutureSkewSeconds: int('MAX_FUTURE_SKEW_SECONDS', 300),
    observerProofMaxSkewSeconds: int('OBSERVER_PROOF_MAX_SKEW_SECONDS', 300),
    maxBodyBytes: int('MAX_BODY_BYTES', 16384),
    hiveLeaseTtlSeconds: int('HIVE_LEASE_TTL_SECONDS', 86400),
    hiveCheckCapacity: num('HIVE_CHECK_CAPACITY', 100),
    hiveCheckRefillPerMinute: num('HIVE_CHECK_REFILL_PER_MINUTE', 60),
    hiveCapacityBonusPerScore: num('HIVE_CAPACITY_BONUS_PER_SCORE', 10),
    hiveMaxCapacityBonus: num('HIVE_MAX_CAPACITY_BONUS', 900),
    hiveRefillBonusPerScorePerMinute: num('HIVE_REFILL_BONUS_PER_SCORE_PER_MINUTE', 0.2),
    hiveMaxRefillBonusPerMinute: num('HIVE_MAX_REFILL_BONUS_PER_MINUTE', 120),
    usefulReuseScoreUnits: num('USEFUL_REUSE_SCORE_UNITS', 1),
    usefulReuseDailyAwardCap: int('USEFUL_REUSE_DAILY_AWARD_CAP', 1000),
    hiveLeaseRetentionSeconds: int('HIVE_LEASE_RETENTION_SECONDS', 2592000),
    hiveReuseRetentionSeconds: int('HIVE_REUSE_RETENTION_SECONDS', 7776000),
    adminSessionTtlSeconds: int('ADMIN_SESSION_TTL_SECONDS', 14400),
    declaredVercelHardSpendCapUsd: optionalNum('VERCEL_HARD_SPEND_CAP_USD')
  };
}
