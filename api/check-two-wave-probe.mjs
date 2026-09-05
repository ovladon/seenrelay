import process from 'node:process';
import { neon } from '@neondatabase/serverless';

const CONSUMER_LEASE_ID = '84d73b84-4d2e-4b6b-90cb-cf6b84400184';
const FACT_KEY = 'lab-check-hotpath-v1';
const INDEPENDENCE_KEY = 'lab-hotpath-consumer-bucket-v1';
const ADMISSION_KEY = 'lab:check-hotpath-wave1-v1';

function envNum(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
function elapsedMs(start) { return performance.now() - start; }
function cpuMs(start) { const d = process.cpuUsage(start); return (d.user + d.system) / 1000; }

export default async function handler(request, response) {
  if (process.env.VERCEL_ENV === 'production') {
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'NOT_FOUND' }));
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    response.statusCode = 500;
    response.end(JSON.stringify({ error: 'DATABASE_URL_NOT_CONFIGURED' }));
    return;
  }

  const sql = neon(databaseUrl);
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - 3600_000).toISOString();

  const wave1Wall = performance.now();
  const wave1Cpu = process.cpuUsage();
  const wave1Rows = await sql.query(`WITH policy_raw AS (
      SELECT mode, checks_enabled, rewards_enabled, capacity_multiplier::float8, refill_multiplier::float8
      FROM runtime_controls WHERE control_id='global'
    ), policy AS (
      SELECT
        (checks_enabled AND mode <> 'FREEZE') AS allowed,
        CASE WHEN mode IN ('SHIELD','READ_ONLY','FREEZE') THEN false ELSE rewards_enabled END AS rewards_enabled,
        CASE WHEN mode='SHIELD' THEN LEAST(capacity_multiplier,0.25) WHEN mode='FREEZE' THEN 0 ELSE capacity_multiplier END AS capacity_multiplier,
        CASE WHEN mode='SHIELD' THEN LEAST(refill_multiplier,0.25) WHEN mode='FREEZE' THEN 0 ELSE refill_multiplier END AS refill_multiplier
      FROM policy_raw
    ), bucket AS (
      SELECT date_trunc('minute',$2::timestamptz) AS window_start
    ), admitted AS (
      INSERT INTO hive_admission_windows (admission_key,window_start,admissions,updated_at)
      SELECT $1,b.window_start,1,$2::timestamptz FROM bucket b CROSS JOIN policy p WHERE p.allowed
      ON CONFLICT (admission_key,window_start) DO UPDATE SET
        admissions=hive_admission_windows.admissions+1,
        updated_at=EXCLUDED.updated_at
      WHERE hive_admission_windows.admissions < $3::int
      RETURNING admissions
    ), calc AS (
      SELECT h.lease_id,
        LEAST(
          $5::float8*p.capacity_multiplier + LEAST($7::float8*p.capacity_multiplier,h.contribution_score*$6::float8*p.capacity_multiplier),
          h.check_tokens + GREATEST(0,EXTRACT(EPOCH FROM ($2::timestamptz-h.last_refill_at))) *
            (($8::float8*p.refill_multiplier + LEAST($10::float8*p.refill_multiplier,h.contribution_score*$9::float8*p.refill_multiplier))/60.0)
        ) AS replenished
      FROM hive_leases h CROSS JOIN policy p
      WHERE h.lease_id=$4 AND h.expires_at>$2::timestamptz
        AND h.client_key NOT LIKE 'internal:%'
        AND EXISTS(SELECT 1 FROM admitted)
    ), consumed AS (
      UPDATE hive_leases h SET
        independence_key=COALESCE(h.independence_key,$11::text),
        check_tokens=CASE WHEN calc.replenished>=1 THEN calc.replenished-1 ELSE calc.replenished END,
        last_refill_at=$2::timestamptz,
        last_seen_at=$2::timestamptz,
        check_count=h.check_count+CASE WHEN calc.replenished>=1 THEN 1 ELSE 0 END
      FROM calc WHERE h.lease_id=calc.lease_id
      RETURNING h.lease_id,h.check_tokens::float8,h.useful_reuse_generated::int,h.useful_reuse_consumed::int,
        h.contribution_score::float8,(calc.replenished>=1) AS allowed
    ), groups AS (
      SELECT
        o.value_hash,
        MAX(o.observed_at)::text AS last_seen,
        MIN(o.observed_at)::text AS first_seen,
        COUNT(*)::int AS observations,
        COUNT(DISTINCT o.observer_key)::int AS observers,
        COUNT(DISTINCT CASE WHEN o.observer_key LIKE 'ed25519:%' THEN o.observer_key END)::int AS cryptographic_observers,
        COUNT(DISTINCT CASE WHEN o.observer_key NOT LIKE 'ed25519:%' THEN o.observer_key END)::int AS unverified_observers,
        COUNT(DISTINCT CASE WHEN h.independence_key IS NOT NULL THEN h.independence_key END)::int AS reuse_independence_buckets,
        (SELECT o2.source_validator_json FROM observations_recent o2
         WHERE o2.fact_key=o.fact_key AND o2.value_hash=o.value_hash AND o2.observed_at >= $13::timestamptz
         ORDER BY o2.observed_at DESC,o2.received_at DESC LIMIT 1) AS source_validator
      FROM observations_recent o LEFT JOIN hive_leases h ON h.lease_id=o.lease_id
      WHERE o.fact_key=$12 AND o.observed_at >= $13::timestamptz
        AND EXISTS(SELECT 1 FROM consumed c WHERE c.allowed)
      GROUP BY o.fact_key,o.value_hash
      ORDER BY MAX(o.observed_at) DESC LIMIT 8
    )
    SELECT
      p.allowed AS runtime_allowed,
      p.rewards_enabled,
      EXISTS(SELECT 1 FROM admitted) AS network_admitted,
      COALESCE(c.allowed,false) AS lease_allowed,
      COALESCE(c.check_tokens,0)::float8 AS check_tokens,
      (SELECT COUNT(*)::int FROM groups) AS group_count,
      (SELECT value_hash FROM groups ORDER BY last_seen DESC LIMIT 1) AS latest_value_hash,
      (SELECT observations FROM groups ORDER BY last_seen DESC LIMIT 1) AS latest_observations,
      (SELECT observers FROM groups ORDER BY last_seen DESC LIMIT 1) AS latest_observers,
      (SELECT cryptographic_observers FROM groups ORDER BY last_seen DESC LIMIT 1) AS latest_cryptographic_observers,
      (SELECT reuse_independence_buckets FROM groups ORDER BY last_seen DESC LIMIT 1) AS latest_independence_buckets
    FROM policy p LEFT JOIN consumed c ON true`, [
      ADMISSION_KEY,
      nowIso,
      Math.max(1, envNum('HIVE_MAX_CHECKS_PER_NETWORK_PER_MINUTE',3000)),
      CONSUMER_LEASE_ID,
      envNum('HIVE_CHECK_CAPACITY',100),
      envNum('HIVE_CAPACITY_BONUS_PER_SCORE',10),
      envNum('HIVE_MAX_CAPACITY_BONUS',900),
      envNum('HIVE_CHECK_REFILL_PER_MINUTE',60),
      envNum('HIVE_REFILL_BONUS_PER_SCORE_PER_MINUTE',0.2),
      envNum('HIVE_MAX_REFILL_BONUS_PER_MINUTE',120),
      INDEPENDENCE_KEY,
      FACT_KEY,
      cutoffIso
    ]);
  const wave1 = { elapsed_ms: elapsedMs(wave1Wall), cpu_ms: cpuMs(wave1Cpu) };
  const w1 = wave1Rows[0] || {};
  if (!w1.runtime_allowed || !w1.network_admitted || !w1.lease_allowed || Number(w1.group_count) !== 1 || Number(w1.latest_observations) !== 2 || Number(w1.latest_observers) !== 2) {
    response.statusCode = 409;
    response.setHeader('content-type','application/json; charset=utf-8');
    response.end(JSON.stringify({ schema:'seenrelay-check-two-wave-probe-v1', valid:false, wave1, raw_database_url_emitted:false }));
    return;
  }

  const wave2Wall = performance.now();
  const wave2Cpu = process.cpuUsage();
  const wave2Rows = await sql.query(`WITH consumer AS (
      SELECT lease_id,independence_key FROM hive_leases WHERE lease_id=$4
    ), contributors AS (
      SELECT DISTINCT o.lease_id AS contributor_lease_id
      FROM observations_recent o
      JOIN hive_leases c ON c.lease_id=o.lease_id
      CROSS JOIN consumer u
      WHERE o.fact_key=$1 AND o.value_hash=$2 AND o.observed_at >= $3::timestamptz
        AND o.lease_id IS NOT NULL AND o.lease_id<>$4
        AND c.independence_key IS NOT NULL AND u.independence_key IS NOT NULL
        AND c.independence_key<>u.independence_key
        AND (SELECT COUNT(*) FROM useful_reuse_events e
             WHERE e.contributor_lease_id=c.lease_id
               AND e.created_at >= date_trunc('day',$5::timestamptz)) < $7::int
    ), ins AS (
      INSERT INTO useful_reuse_events (fact_key,value_hash,contributor_lease_id,consumer_lease_id,created_at,utility_units)
      SELECT $1,$2,contributor_lease_id,$4,$5::timestamptz,$6::float8 FROM contributors
      ON CONFLICT (fact_key,value_hash,contributor_lease_id,consumer_lease_id) DO NOTHING
      RETURNING contributor_lease_id,utility_units
    ), bumped AS (
      UPDATE hive_leases h SET
        contribution_score=h.contribution_score+i.utility_units,
        useful_reuse_generated=h.useful_reuse_generated+1
      FROM ins i WHERE h.lease_id=i.contributor_lease_id RETURNING h.lease_id
    ), consumer_update AS (
      UPDATE hive_leases SET
        useful_reuse_consumed=useful_reuse_consumed+CASE WHEN EXISTS(SELECT 1 FROM ins) THEN 1 ELSE 0 END,
        last_seen_at=$5::timestamptz,
        last_fact_key=$1,
        last_operation='CHECK',
        last_outcome='SAME_OBSERVED'
      WHERE lease_id=$4 RETURNING lease_id
    ), metric_shape AS (
      SELECT 1::int AS checks,1::int AS same_observed,
        CASE WHEN EXISTS(SELECT 1 FROM ins) THEN 1 ELSE 0 END::int AS useful_reuse
    )
    SELECT
      (SELECT COUNT(*)::int FROM ins) AS awarded,
      EXISTS(SELECT 1 FROM consumer_update) AS consumer_updated,
      (SELECT checks FROM metric_shape) AS metric_checks,
      (SELECT same_observed FROM metric_shape) AS metric_same_observed,
      (SELECT useful_reuse FROM metric_shape) AS metric_useful_reuse`, [
      FACT_KEY,
      w1.latest_value_hash,
      cutoffIso,
      CONSUMER_LEASE_ID,
      nowIso,
      envNum('USEFUL_REUSE_SCORE_UNITS',1),
      Math.max(1,envNum('USEFUL_REUSE_DAILY_AWARD_CAP',1000))
    ]);
  const wave2 = { elapsed_ms: elapsedMs(wave2Wall), cpu_ms: cpuMs(wave2Cpu) };
  const w2 = wave2Rows[0] || {};

  response.statusCode = 200;
  response.setHeader('content-type','application/json; charset=utf-8');
  response.setHeader('cache-control','no-store');
  response.end(JSON.stringify({
    schema:'seenrelay-check-two-wave-probe-v1',
    valid:Boolean(w2.consumer_updated),
    environment:process.env.VERCEL_ENV || 'unknown',
    vercel_region:process.env.VERCEL_REGION || 'unknown',
    wave1,
    wave2,
    total_elapsed_ms:wave1.elapsed_ms+wave2.elapsed_ms,
    total_cpu_ms:wave1.cpu_ms+wave2.cpu_ms,
    evidence:{groups:Number(w1.group_count),observations:Number(w1.latest_observations),observers:Number(w1.latest_observers),cryptographic_observers:Number(w1.latest_cryptographic_observers),independence_buckets:Number(w1.latest_independence_buckets)},
    reward_awards:Number(w2.awarded || 0),
    telemetry_shape_preserved:Number(w2.metric_checks)===1 && Number(w2.metric_same_observed)===1,
    actual_public_metric_write_performed:false,
    raw_database_url_emitted:false
  }));
}
