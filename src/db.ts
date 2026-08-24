import { neon } from '@neondatabase/serverless';
import type { AggregateRow, FactRow, HiveLeaseRow, JsonValue } from './types.js';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return url;
}

function sql() { return neon(databaseUrl()); }

export async function getFact(factKey: string): Promise<FactRow | null> {
  const rows = await sql().query(`SELECT fact_key, subject, predicate, qualifiers_json, source_url, last_observed_at, observation_total::int, current_value_json, current_value_hash, current_first_seen_at, current_last_seen_at, previous_value_json, previous_value_hash, previous_last_seen_at FROM facts WHERE fact_key = $1`, [factKey]) as FactRow[];
  return rows[0] || null;
}

export async function getRecentValueGroups(factKey: string, cutoffIso: string): Promise<AggregateRow[]> {
  return await sql().query(`SELECT value_hash, value_json, MAX(observed_at)::text AS last_seen, MIN(observed_at)::text AS first_seen, COUNT(*)::int AS observations, COUNT(DISTINCT observer_key)::int AS observers, COUNT(DISTINCT CASE WHEN observer_key LIKE 'ed25519:%' THEN observer_key END)::int AS cryptographic_observers, COUNT(DISTINCT CASE WHEN observer_key NOT LIKE 'ed25519:%' THEN observer_key END)::int AS unverified_observers FROM observations_recent WHERE fact_key = $1 AND observed_at >= $2::timestamptz GROUP BY value_hash, value_json ORDER BY MAX(observed_at) DESC LIMIT 4`, [factKey, cutoffIso]) as AggregateRow[];
}

export async function getObserverState(factKey: string, observerKey: string) {
  const rows = await sql().query(`SELECT last_value_hash, last_observed_at::text, last_received_at::text, accepted_observations::int FROM observer_fact_state WHERE fact_key = $1 AND observer_key = $2`, [factKey, observerKey]) as Array<{last_value_hash: string; last_observed_at: string; last_received_at: string; accepted_observations: number}>;
  return rows[0] || null;
}

export interface AcceptObservationInput {
  observationId: string;
  factKey: string;
  subject: string;
  predicate: string;
  qualifiersJson: string;
  sourceUrl: string;
  valueJson: string;
  valueHash: string;
  observedAtIso: string;
  receivedAtIso: string;
  observerKey: string;
  leaseId: string | null;
  evidenceFingerprint: string | null;
  sourceValidator: JsonValue | null;
}

/**
 * Atomically writes an accepted observation and its materialized fact summary.
 * A newly-created fact is initialized from its first observation directly; an existing fact is
 * updated only when the observation insert succeeds. This avoids sibling-CTE snapshot visibility
 * traps and guarantees that accepted=true cannot leave a fact summary at observation_total=0.
 */
export async function acceptObservation(input: AcceptObservationInput): Promise<boolean> {
  const rows = await sql().query(`
    WITH new_fact AS (
      INSERT INTO facts (
        fact_key, subject, predicate, qualifiers_json, source_url,
        created_at, updated_at, last_observed_at, observation_total,
        current_value_json, current_value_hash, current_first_seen_at, current_last_seen_at
      )
      SELECT
        $1, $2, $3, $4::jsonb, $5,
        $7::timestamptz, $7::timestamptz, $10::timestamptz, 1,
        $8::jsonb, $9, $10::timestamptz, $10::timestamptz
      WHERE NOT EXISTS (
        SELECT 1 FROM observations_recent WHERE observation_id = $6
      )
      ON CONFLICT (fact_key) DO NOTHING
      RETURNING fact_key
    ),
    fact_ref AS (
      SELECT fact_key FROM new_fact
      UNION ALL
      SELECT fact_key FROM facts WHERE fact_key = $1
      LIMIT 1
    ),
    ins AS (
      INSERT INTO observations_recent (
        observation_id, fact_key, value_json, value_hash, observed_at, received_at,
        observer_key, lease_id, evidence_fingerprint, source_validator_json
      )
      SELECT
        $6, fact_key, $8::jsonb, $9, $10::timestamptz, $11::timestamptz,
        $12, $13, $14, $15::jsonb
      FROM fact_ref
      ON CONFLICT (observation_id) DO NOTHING
      RETURNING *
    ),
    observer_upsert AS (
      INSERT INTO observer_fact_state (
        fact_key, observer_key, last_value_hash, last_observed_at, last_received_at, accepted_observations
      )
      SELECT fact_key, observer_key, value_hash, observed_at, received_at, 1
      FROM ins
      ON CONFLICT (fact_key, observer_key) DO UPDATE SET
        last_value_hash = EXCLUDED.last_value_hash,
        last_observed_at = GREATEST(observer_fact_state.last_observed_at, EXCLUDED.last_observed_at),
        last_received_at = EXCLUDED.last_received_at,
        accepted_observations = observer_fact_state.accepted_observations + 1
      RETURNING fact_key
    ),
    updated_existing AS (
      UPDATE facts f SET
        updated_at = $11::timestamptz,
        last_observed_at = GREATEST(COALESCE(f.last_observed_at, $10::timestamptz), $10::timestamptz),
        observation_total = f.observation_total + 1,
        previous_value_json = CASE
          WHEN (f.current_last_seen_at IS NULL OR $10::timestamptz >= f.current_last_seen_at)
            AND f.current_value_hash IS NOT NULL AND f.current_value_hash <> $9
          THEN f.current_value_json ELSE f.previous_value_json END,
        previous_value_hash = CASE
          WHEN (f.current_last_seen_at IS NULL OR $10::timestamptz >= f.current_last_seen_at)
            AND f.current_value_hash IS NOT NULL AND f.current_value_hash <> $9
          THEN f.current_value_hash ELSE f.previous_value_hash END,
        previous_last_seen_at = CASE
          WHEN (f.current_last_seen_at IS NULL OR $10::timestamptz >= f.current_last_seen_at)
            AND f.current_value_hash IS NOT NULL AND f.current_value_hash <> $9
          THEN f.current_last_seen_at ELSE f.previous_last_seen_at END,
        current_value_json = CASE
          WHEN f.current_last_seen_at IS NULL OR $10::timestamptz >= f.current_last_seen_at
          THEN $8::jsonb ELSE f.current_value_json END,
        current_value_hash = CASE
          WHEN f.current_last_seen_at IS NULL OR $10::timestamptz >= f.current_last_seen_at
          THEN $9 ELSE f.current_value_hash END,
        current_first_seen_at = CASE
          WHEN f.current_last_seen_at IS NULL THEN $10::timestamptz
          WHEN $10::timestamptz >= f.current_last_seen_at AND f.current_value_hash <> $9 THEN $10::timestamptz
          ELSE f.current_first_seen_at END,
        current_last_seen_at = CASE
          WHEN f.current_last_seen_at IS NULL THEN $10::timestamptz
          WHEN $10::timestamptz >= f.current_last_seen_at AND f.current_value_hash = $9
            THEN GREATEST(f.current_last_seen_at, $10::timestamptz)
          WHEN $10::timestamptz >= f.current_last_seen_at THEN $10::timestamptz
          ELSE f.current_last_seen_at END
      FROM ins i
      WHERE f.fact_key = i.fact_key
        AND NOT EXISTS (SELECT 1 FROM new_fact nf WHERE nf.fact_key = f.fact_key)
      RETURNING f.fact_key
    )
    SELECT EXISTS(SELECT 1 FROM ins) AS inserted
  `, [
    input.factKey,
    input.subject,
    input.predicate,
    input.qualifiersJson,
    input.sourceUrl,
    input.observationId,
    input.receivedAtIso,
    input.valueJson,
    input.valueHash,
    input.observedAtIso,
    input.receivedAtIso,
    input.observerKey,
    input.leaseId,
    input.evidenceFingerprint,
    input.sourceValidator === null ? null : JSON.stringify(input.sourceValidator)
  ]) as Array<{ inserted: boolean }>;
  return Boolean(rows[0]?.inserted);
}

export async function cleanupTouchedFact(factKey: string, cutoffIso: string): Promise<void> {
  await sql().query(`DELETE FROM observations_recent WHERE observation_id IN (SELECT observation_id FROM observations_recent WHERE fact_key = $1 AND received_at < $2::timestamptz ORDER BY received_at ASC LIMIT 100)`, [factKey, cutoffIso]);
}

const hiveLeaseColumns = `lease_id, client_key, issued_at::text, expires_at::text, last_seen_at::text, last_refill_at::text, check_tokens::float8, check_count::int, observe_count::int, useful_reuse_generated::int, useful_reuse_consumed::int, contribution_score::float8, last_fact_key, last_operation, last_outcome`;
const hiveLeaseColumnsFromH = `h.lease_id, h.client_key, h.issued_at::text AS issued_at, h.expires_at::text AS expires_at, h.last_seen_at::text AS last_seen_at, h.last_refill_at::text AS last_refill_at, h.check_tokens::float8 AS check_tokens, h.check_count::int AS check_count, h.observe_count::int AS observe_count, h.useful_reuse_generated::int AS useful_reuse_generated, h.useful_reuse_consumed::int AS useful_reuse_consumed, h.contribution_score::float8 AS contribution_score, h.last_fact_key, h.last_operation, h.last_outcome`;

export async function getHiveLeaseById(leaseId: string, nowIso: string): Promise<HiveLeaseRow | null> {
  const rows = await sql().query(`SELECT ${hiveLeaseColumns} FROM hive_leases WHERE lease_id = $1 AND expires_at > $2::timestamptz`, [leaseId, nowIso]) as HiveLeaseRow[];
  return rows[0] || null;
}

export async function getActiveHiveLeaseByClientKey(clientKey: string, nowIso: string): Promise<HiveLeaseRow | null> {
  const rows = await sql().query(`SELECT ${hiveLeaseColumns} FROM hive_leases WHERE client_key = $1 AND expires_at > $2::timestamptz ORDER BY last_seen_at DESC LIMIT 1`, [clientKey, nowIso]) as HiveLeaseRow[];
  return rows[0] || null;
}

export async function createHiveLease(leaseId: string, clientKey: string, nowIso: string, expiresIso: string, initialTokens: number): Promise<HiveLeaseRow> {
  const rows = await sql().query(`INSERT INTO hive_leases (lease_id, client_key, issued_at, expires_at, last_seen_at, last_refill_at, check_tokens) VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $3::timestamptz, $3::timestamptz, $5) ON CONFLICT (lease_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at RETURNING ${hiveLeaseColumns}`, [leaseId, clientKey, nowIso, expiresIso, initialTokens]) as HiveLeaseRow[];
  if (!rows[0]) throw new Error('Unable to create Hive Lease');
  return rows[0];
}

export interface HiveConsumeResult extends HiveLeaseRow { allowed: boolean; }

export async function consumeHiveCheck(
  leaseId: string,
  nowIso: string,
  baseCapacity: number,
  capacityBonusPerScore: number,
  maxCapacityBonus: number,
  baseRefillPerMinute: number,
  refillBonusPerScorePerMinute: number,
  maxRefillBonusPerMinute: number
): Promise<HiveConsumeResult | null> {
  const rows = await sql().query(`WITH calc AS (
    SELECT lease_id,
      LEAST(
        $3::float8 + LEAST($5::float8, contribution_score * $4::float8),
        check_tokens + GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - last_refill_at))) * (($6::float8 + LEAST($8::float8, contribution_score * $7::float8)) / 60.0)
      ) AS replenished
    FROM hive_leases
    WHERE lease_id = $1 AND expires_at > $2::timestamptz
  )
  UPDATE hive_leases h SET
    check_tokens = CASE WHEN calc.replenished >= 1 THEN calc.replenished - 1 ELSE calc.replenished END,
    last_refill_at = $2::timestamptz,
    last_seen_at = $2::timestamptz,
    check_count = h.check_count + CASE WHEN calc.replenished >= 1 THEN 1 ELSE 0 END
  FROM calc
  WHERE h.lease_id = calc.lease_id
  RETURNING ${hiveLeaseColumnsFromH}, (calc.replenished >= 1) AS allowed`, [leaseId, nowIso, baseCapacity, capacityBonusPerScore, maxCapacityBonus, baseRefillPerMinute, refillBonusPerScorePerMinute, maxRefillBonusPerMinute]) as HiveConsumeResult[];
  return rows[0] || null;
}

export async function touchHiveObserve(leaseId: string, nowIso: string): Promise<HiveLeaseRow | null> {
  const rows = await sql().query(`UPDATE hive_leases SET last_seen_at = $2::timestamptz, observe_count = observe_count + 1 WHERE lease_id = $1 AND expires_at > $2::timestamptz RETURNING ${hiveLeaseColumns}`, [leaseId, nowIso]) as HiveLeaseRow[];
  return rows[0] || null;
}

export async function recordHiveOperation(leaseId: string, factKey: string, operation: 'CHECK' | 'OBSERVE', outcome: string, nowIso: string): Promise<void> {
  await sql().query(`UPDATE hive_leases SET last_seen_at = $5::timestamptz, last_fact_key = $2, last_operation = $3, last_outcome = $4 WHERE lease_id = $1`, [leaseId, factKey, operation, outcome, nowIso]);
}

export type HiveMetricOutcome = 'UNKNOWN' | 'STALE' | 'SAME_OBSERVED' | 'CHANGED_OBSERVED' | 'CONTESTED' | 'OBSERVE' | 'NEW_LEASE' | 'USEFUL_REUSE';

export async function recordHiveMetric(outcome: HiveMetricOutcome, amount = 1, nowIso = new Date().toISOString()): Promise<void> {
  const counters = {
    checks: outcome === 'UNKNOWN' || outcome === 'STALE' || outcome === 'SAME_OBSERVED' || outcome === 'CHANGED_OBSERVED' || outcome === 'CONTESTED' ? amount : 0,
    observes: outcome === 'OBSERVE' ? amount : 0,
    unknown: outcome === 'UNKNOWN' ? amount : 0,
    stale: outcome === 'STALE' ? amount : 0,
    same_observed: outcome === 'SAME_OBSERVED' ? amount : 0,
    changed_observed: outcome === 'CHANGED_OBSERVED' ? amount : 0,
    contested: outcome === 'CONTESTED' ? amount : 0,
    useful_reuse: outcome === 'USEFUL_REUSE' ? amount : 0,
    new_leases: outcome === 'NEW_LEASE' ? amount : 0
  };
  await sql().query(`INSERT INTO hive_metrics_daily (day, checks, observes, unknown, stale, same_observed, changed_observed, contested, useful_reuse, new_leases) VALUES ($1::timestamptz::date, $2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (day) DO UPDATE SET checks = hive_metrics_daily.checks + EXCLUDED.checks, observes = hive_metrics_daily.observes + EXCLUDED.observes, unknown = hive_metrics_daily.unknown + EXCLUDED.unknown, stale = hive_metrics_daily.stale + EXCLUDED.stale, same_observed = hive_metrics_daily.same_observed + EXCLUDED.same_observed, changed_observed = hive_metrics_daily.changed_observed + EXCLUDED.changed_observed, contested = hive_metrics_daily.contested + EXCLUDED.contested, useful_reuse = hive_metrics_daily.useful_reuse + EXCLUDED.useful_reuse, new_leases = hive_metrics_daily.new_leases + EXCLUDED.new_leases`, [nowIso,counters.checks,counters.observes,counters.unknown,counters.stale,counters.same_observed,counters.changed_observed,counters.contested,counters.useful_reuse,counters.new_leases]);
}

export async function creditUsefulReuse(factKey: string, valueHash: string, cutoffIso: string, consumerLeaseId: string, nowIso: string, utilityUnits: number): Promise<number> {
  const rows = await sql().query(`WITH contributors AS (
      SELECT DISTINCT lease_id AS contributor_lease_id
      FROM observations_recent
      WHERE fact_key = $1 AND value_hash = $2 AND observed_at >= $3::timestamptz AND lease_id IS NOT NULL AND lease_id <> $4
    ), ins AS (
      INSERT INTO useful_reuse_events (fact_key, value_hash, contributor_lease_id, consumer_lease_id, created_at, utility_units)
      SELECT $1, $2, contributor_lease_id, $4, $5::timestamptz, $6::float8 FROM contributors
      ON CONFLICT (fact_key, value_hash, contributor_lease_id, consumer_lease_id) DO NOTHING
      RETURNING contributor_lease_id, utility_units
    ), bumped AS (
      UPDATE hive_leases h SET contribution_score = h.contribution_score + i.utility_units, useful_reuse_generated = h.useful_reuse_generated + 1
      FROM ins i WHERE h.lease_id = i.contributor_lease_id RETURNING h.lease_id
    ), consumed AS (
      UPDATE hive_leases SET useful_reuse_consumed = useful_reuse_consumed + CASE WHEN EXISTS(SELECT 1 FROM ins) THEN 1 ELSE 0 END
      WHERE lease_id = $4 RETURNING lease_id
    )
    SELECT COUNT(*)::int AS awarded FROM ins`, [factKey, valueHash, cutoffIso, consumerLeaseId, nowIso, utilityUnits]) as Array<{awarded: number}>;
  return rows[0]?.awarded || 0;
}
