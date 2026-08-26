import { neon } from '@neondatabase/serverless';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

/**
 * Awards reuse only when contributor and consumer belong to different conservative independence
 * buckets. client_key is intentionally NOT sufficient: callers control x-seenrelay-client and must
 * not be able to farm rewards by changing a self-declared header. independence_key is a
 * privacy-salted network bucket and is a frictionless anti-farming signal, not proof of unique
 * real-world actors and never a truth-confidence signal.
 */
export async function creditUsefulReuseGuarded(
  factKey: string,
  valueHash: string,
  cutoffIso: string,
  consumerLeaseId: string,
  nowIso: string,
  utilityUnits: number,
  dailyAwardCap: number
): Promise<number> {
  const rows = await sql().query(`WITH consumer AS (
      SELECT lease_id, independence_key FROM hive_leases WHERE lease_id=$4
    ), contributors AS (
      SELECT DISTINCT o.lease_id AS contributor_lease_id
      FROM observations_recent o
      JOIN hive_leases c ON c.lease_id=o.lease_id
      CROSS JOIN consumer u
      WHERE o.fact_key=$1 AND o.value_hash=$2 AND o.observed_at >= $3::timestamptz
        AND o.lease_id IS NOT NULL AND o.lease_id <> $4
        AND c.independence_key IS NOT NULL
        AND u.independence_key IS NOT NULL
        AND c.independence_key <> u.independence_key
        AND (SELECT COUNT(*) FROM useful_reuse_events e WHERE e.contributor_lease_id=c.lease_id AND e.created_at >= date_trunc('day',$5::timestamptz)) < $7
    ), ins AS (
      INSERT INTO useful_reuse_events (fact_key,value_hash,contributor_lease_id,consumer_lease_id,created_at,utility_units)
      SELECT $1,$2,contributor_lease_id,$4,$5::timestamptz,$6::float8 FROM contributors
      ON CONFLICT (fact_key,value_hash,contributor_lease_id,consumer_lease_id) DO NOTHING
      RETURNING contributor_lease_id, utility_units
    ), bumped AS (
      UPDATE hive_leases h SET contribution_score=h.contribution_score+i.utility_units, useful_reuse_generated=h.useful_reuse_generated+1
      FROM ins i WHERE h.lease_id=i.contributor_lease_id RETURNING h.lease_id
    ), consumed AS (
      UPDATE hive_leases SET useful_reuse_consumed=useful_reuse_consumed+CASE WHEN EXISTS(SELECT 1 FROM ins) THEN 1 ELSE 0 END
      WHERE lease_id=$4 RETURNING lease_id
    ) SELECT COUNT(*)::int AS awarded FROM ins`, [factKey,valueHash,cutoffIso,consumerLeaseId,nowIso,utilityUnits,dailyAwardCap]) as Array<{awarded:number}>;
  return rows[0]?.awarded || 0;
}

export interface HousekeepingResult {
  observations_deleted: number;
  observer_states_deleted: number;
  reuse_deleted: number;
  leases_deleted: number;
  admission_windows_deleted: number;
}

/**
 * Global retention sweep. Fact summaries deliberately survive observation-row expiry so CHECK can still
 * answer STALE with the last observed state; pseudonymous observer state does not need to survive the
 * observation retention horizon and is removed with it.
 */
export async function runHiveHousekeeping(
  leaseRetentionSeconds: number,
  reuseRetentionSeconds: number,
  observationRetentionSeconds = 604800
): Promise<HousekeepingResult> {
  const q = sql();
  const observations = await q.query(`WITH d AS (DELETE FROM observations_recent WHERE received_at < now()-($1::text||' seconds')::interval RETURNING 1) SELECT COUNT(*)::int AS n FROM d`, [String(observationRetentionSeconds)]) as Array<{n:number}>;
  const observerStates = await q.query(`WITH d AS (DELETE FROM observer_fact_state WHERE last_received_at < now()-($1::text||' seconds')::interval RETURNING 1) SELECT COUNT(*)::int AS n FROM d`, [String(observationRetentionSeconds)]) as Array<{n:number}>;
  const reuse = await q.query(`WITH d AS (DELETE FROM useful_reuse_events WHERE created_at < now()-($1::text||' seconds')::interval RETURNING 1) SELECT COUNT(*)::int AS n FROM d`, [String(reuseRetentionSeconds)]) as Array<{n:number}>;
  const leases = await q.query(`WITH d AS (DELETE FROM hive_leases WHERE expires_at < now()-($1::text||' seconds')::interval RETURNING 1) SELECT COUNT(*)::int AS n FROM d`, [String(leaseRetentionSeconds)]) as Array<{n:number}>;
  const admissionWindows = await q.query(`WITH d AS (DELETE FROM hive_admission_windows WHERE updated_at < now()-($1::text||' seconds')::interval RETURNING 1) SELECT COUNT(*)::int AS n FROM d`, ['86400']) as Array<{n:number}>;
  return {
    observations_deleted: observations[0]?.n || 0,
    observer_states_deleted: observerStates[0]?.n || 0,
    reuse_deleted: reuse[0]?.n || 0,
    leases_deleted: leases[0]?.n || 0,
    admission_windows_deleted: admissionWindows[0]?.n || 0
  };
}
