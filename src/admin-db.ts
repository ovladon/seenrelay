import { neon } from '@neondatabase/serverless';
import { privacyScopedHash } from './identity.js';
import { getMcpDiscoverySnapshot } from './discovery.js';

export type RuntimeMode = 'NORMAL' | 'SHIELD' | 'READ_ONLY' | 'FREEZE';
export interface RuntimeControls {
  control_id: 'global';
  mode: RuntimeMode;
  checks_enabled: boolean;
  observes_enabled: boolean;
  rewards_enabled: boolean;
  capacity_multiplier: number;
  refill_multiplier: number;
  updated_at: string;
  updated_by: string;
}

const REFERENCE_OBSERVER_ID = 'seenrelay-reference-observer-v1';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

async function referenceObserverKey(): Promise<string> {
  return `self:${await privacyScopedHash('observer-self', REFERENCE_OBSERVER_ID)}`;
}

export async function getRuntimeControls(): Promise<RuntimeControls> {
  const rows = await sql().query(`SELECT control_id, mode, checks_enabled, observes_enabled, rewards_enabled, capacity_multiplier::float8, refill_multiplier::float8, updated_at::text, updated_by FROM runtime_controls WHERE control_id='global'`) as RuntimeControls[];
  if (!rows[0]) throw new Error('runtime_controls global row is missing');
  return rows[0];
}

export async function setRuntimeControls(input: Partial<Pick<RuntimeControls, 'mode'|'checks_enabled'|'observes_enabled'|'rewards_enabled'|'capacity_multiplier'|'refill_multiplier'>>, actor = 'admin'): Promise<RuntimeControls> {
  const current = await getRuntimeControls();
  const next = {
    mode: input.mode ?? current.mode,
    checks_enabled: input.checks_enabled ?? current.checks_enabled,
    observes_enabled: input.observes_enabled ?? current.observes_enabled,
    rewards_enabled: input.rewards_enabled ?? current.rewards_enabled,
    capacity_multiplier: input.capacity_multiplier ?? current.capacity_multiplier,
    refill_multiplier: input.refill_multiplier ?? current.refill_multiplier
  };
  const rows = await sql().query(`UPDATE runtime_controls SET mode=$1, checks_enabled=$2, observes_enabled=$3, rewards_enabled=$4, capacity_multiplier=$5, refill_multiplier=$6, updated_at=now(), updated_by=$7 WHERE control_id='global' RETURNING control_id, mode, checks_enabled, observes_enabled, rewards_enabled, capacity_multiplier::float8, refill_multiplier::float8, updated_at::text, updated_by`, [next.mode,next.checks_enabled,next.observes_enabled,next.rewards_enabled,next.capacity_multiplier,next.refill_multiplier,actor]) as RuntimeControls[];
  if (!rows[0]) throw new Error('Unable to update runtime controls');
  return rows[0];
}

export async function recordAdminAudit(action: string, detail: unknown): Promise<void> {
  await sql().query(`INSERT INTO admin_audit_events (audit_id, action, detail_json) VALUES ($1,$2,$3::jsonb)`, [crypto.randomUUID(), action, JSON.stringify(detail ?? {})]);
}

/**
 * Operational snapshot. Keep this independent from adoption classification so the Control Room
 * remains available even if optional external-vs-first-party telemetry cannot be classified.
 */
export async function getAdminSnapshotData() {
  const q = sql();
  const [summary, active, metrics, reuse, top, audit] = await Promise.all([
    q.query(`SELECT
      (SELECT COUNT(*)::int FROM facts) AS facts,
      (SELECT COUNT(*)::int FROM observations_recent) AS observations,
      (SELECT COUNT(*)::int FROM hive_leases) AS leases_total,
      (SELECT COUNT(*)::int FROM hive_leases WHERE last_seen_at >= now()-interval '60 seconds') AS leases_active_60s,
      (SELECT COUNT(*)::int FROM hive_leases WHERE last_seen_at >= now()-interval '5 minutes') AS leases_active_5m,
      (SELECT COUNT(*)::int FROM useful_reuse_events) AS useful_reuse_total,
      (SELECT COALESCE(SUM(checks),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS checks_month,
      (SELECT COALESCE(SUM(observes),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS observes_month,
      (SELECT COALESCE(SUM(unknown),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS unknown_month,
      (SELECT COALESCE(SUM(useful_reuse),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS reuse_month,
      pg_database_size(current_database())::bigint AS database_bytes`),
    q.query(`SELECT substring(replace(lease_id,'-',''),1,12) AS lease_ref, issued_at::text, last_seen_at::text, expires_at::text, check_count::int, observe_count::int, useful_reuse_generated::int, useful_reuse_consumed::int, contribution_score::float8, last_operation, last_outcome FROM hive_leases WHERE last_seen_at >= now()-interval '5 minutes' ORDER BY last_seen_at DESC LIMIT 300`),
    q.query(`SELECT day::text, checks::int, observes::int, unknown::int, stale::int, same_observed::int, changed_observed::int, contested::int, useful_reuse::int, new_leases::int FROM hive_metrics_daily WHERE day >= current_date-29 ORDER BY day ASC`),
    q.query(`SELECT substring(replace(contributor_lease_id,'-',''),1,12) AS contributor, substring(replace(consumer_lease_id,'-',''),1,12) AS consumer, created_at::text, utility_units::float8 FROM useful_reuse_events ORDER BY created_at DESC LIMIT 40`),
    q.query(`SELECT substring(replace(lease_id,'-',''),1,12) AS lease_ref, contribution_score::float8, useful_reuse_generated::int, check_count::int, observe_count::int, last_seen_at::text FROM hive_leases ORDER BY contribution_score DESC, useful_reuse_generated DESC LIMIT 20`),
    q.query(`SELECT occurred_at::text, action, detail_json FROM admin_audit_events ORDER BY occurred_at DESC LIMIT 50`)
  ]);
  let discovery;
  try {
    discovery = await getMcpDiscoverySnapshot();
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_discovery_snapshot_error', error: error instanceof Error ? error.message : 'unknown' }));
    discovery = { status: 'unavailable' as const, classification: 'aggregate-protocol-interest-not-adoption', summary: {} };
  }
  return {
    summary: (summary as any[])[0] || {},
    active_leases: active,
    metrics_daily: metrics,
    recent_reuse: reuse,
    top_contributors: top,
    audit,
    discovery
  };
}

/**
 * Adoption snapshot. First-party bootstrap and controlled Production benchmarks are excluded.
 * The raw operational snapshot still retains them so no test traffic is erased or hidden.
 */
export async function getAdminAdoptionData() {
  const q = sql();
  const firstPartyObserverKey = await referenceObserverKey();
  const internalBenchmarkFact = `(f.source_url ~ '[?&]seenrelay_(json_)?benchmark=' OR f.source_url ~ '[?&]seenrelay_internal_benchmark=')`;
  const verifiedInternalLease = `h.client_key LIKE 'internal:%'`;
  const firstPartyLease = `(${verifiedInternalLease} OR EXISTS (
    SELECT 1 FROM observations_recent fp WHERE fp.lease_id = h.lease_id AND fp.observer_key = $1
  ))`;
  const internalBenchmarkLease = `(
    EXISTS (SELECT 1 FROM observations_recent ibo JOIN facts f ON f.fact_key=ibo.fact_key WHERE ibo.lease_id=h.lease_id AND ${internalBenchmarkFact})
    OR EXISTS (SELECT 1 FROM facts f WHERE f.fact_key=h.last_fact_key AND ${internalBenchmarkFact})
  )`;
  const externalLease = `NOT (${firstPartyLease}) AND NOT (${internalBenchmarkLease})`;
  const meaningfulExternalLease = `(${externalLease}) AND (h.check_count > 0 OR EXISTS (
    SELECT 1 FROM observations_recent ext JOIN facts f ON f.fact_key=ext.fact_key
    WHERE ext.lease_id=h.lease_id AND ext.observer_key <> $1 AND NOT (${internalBenchmarkFact})
  ))`;
  const firstPartyObservation = `(observer_key = $1 OR EXISTS (
    SELECT 1 FROM hive_leases ih WHERE ih.lease_id=observations_recent.lease_id AND ih.client_key LIKE 'internal:%'
  ))`;
  const externalObservation = `NOT (${firstPartyObservation}) AND NOT EXISTS (
    SELECT 1 FROM facts f WHERE f.fact_key=observations_recent.fact_key AND ${internalBenchmarkFact}
  )`;
  const internalBenchmarkObservation = `EXISTS (
    SELECT 1 FROM facts f WHERE f.fact_key=observations_recent.fact_key AND ${internalBenchmarkFact}
  )`;

  const [summary, recentExternalReuse, topExternal] = await Promise.all([
    q.query(`SELECT
      (SELECT COUNT(*)::int FROM observations_recent) AS observations_total,
      (SELECT COUNT(*)::int FROM observations_recent WHERE ${firstPartyObservation}) AS observations_first_party,
      (SELECT COUNT(*)::int FROM observations_recent WHERE ${internalBenchmarkObservation}) AS observations_internal_benchmark,
      (SELECT COUNT(*)::int FROM observations_recent WHERE ${externalObservation}) AS observations_external,
      (SELECT COUNT(*)::int FROM facts) AS facts_total,
      (SELECT COUNT(DISTINCT fact_key)::int FROM observations_recent WHERE ${firstPartyObservation}) AS facts_first_party,
      (SELECT COUNT(DISTINCT fact_key)::int FROM observations_recent WHERE ${internalBenchmarkObservation}) AS facts_internal_benchmark,
      (SELECT COUNT(DISTINCT fact_key)::int FROM observations_recent WHERE ${externalObservation}) AS facts_external,
      (SELECT COUNT(DISTINCT observer_key)::int FROM observations_recent WHERE ${externalObservation}) AS external_observer_keys,
      (SELECT COUNT(*)::int FROM hive_leases) AS leases_total,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE ${firstPartyLease}) AS leases_first_party,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE ${internalBenchmarkLease}) AS leases_internal_benchmark,
      (SELECT COALESCE(SUM(h.check_count),0)::int FROM hive_leases h WHERE ${internalBenchmarkLease}) AS checks_internal_benchmark,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE ${meaningfulExternalLease}) AS leases_external,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE ${meaningfulExternalLease} AND (h.check_count + h.observe_count) >= 2) AS leases_external_repeat,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE ${meaningfulExternalLease} AND h.check_count > 0 AND h.observe_count > 0) AS leases_external_bidirectional,
      (SELECT COUNT(DISTINCT e.consumer_lease_id)::int FROM useful_reuse_events e WHERE EXISTS (SELECT 1 FROM hive_leases h WHERE h.lease_id=e.consumer_lease_id AND ${meaningfulExternalLease})) AS leases_external_reuse_consumers,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE last_seen_at >= now()-interval '60 seconds' AND ${firstPartyLease}) AS active_first_party_60s,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE last_seen_at >= now()-interval '5 minutes' AND ${firstPartyLease}) AS active_first_party_5m,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE last_seen_at >= now()-interval '60 seconds' AND ${meaningfulExternalLease}) AS active_external_60s,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE last_seen_at >= now()-interval '5 minutes' AND ${meaningfulExternalLease}) AS active_external_5m,
      (SELECT COALESCE(SUM(h.check_count),0)::int FROM hive_leases h WHERE ${meaningfulExternalLease}) AS checks_external_retained,
      (SELECT COALESCE(SUM(h.observe_count),0)::int FROM hive_leases h WHERE ${meaningfulExternalLease}) AS observe_attempts_external_retained,
      (SELECT COUNT(*)::int FROM useful_reuse_events e WHERE EXISTS (SELECT 1 FROM hive_leases h WHERE h.lease_id=e.consumer_lease_id AND ${meaningfulExternalLease})) AS reuse_external_total,
      (SELECT MIN(h.issued_at)::text FROM hive_leases h WHERE ${meaningfulExternalLease}) AS first_external_activity_at,
      (SELECT MAX(h.last_seen_at)::text FROM hive_leases h WHERE ${meaningfulExternalLease}) AS last_external_activity_at,
      (SELECT MAX(received_at)::text FROM observations_recent WHERE ${firstPartyObservation}) AS first_party_last_seen_at`, [firstPartyObserverKey]),
    q.query(`SELECT substring(replace(e.contributor_lease_id,'-',''),1,12) AS contributor, substring(replace(e.consumer_lease_id,'-',''),1,12) AS consumer, e.created_at::text, e.utility_units::float8 FROM useful_reuse_events e WHERE EXISTS (SELECT 1 FROM hive_leases h WHERE h.lease_id=e.consumer_lease_id AND ${meaningfulExternalLease}) ORDER BY e.created_at DESC LIMIT 40`, [firstPartyObserverKey]),
    q.query(`SELECT substring(replace(h.lease_id,'-',''),1,12) AS lease_ref, h.contribution_score::float8, h.useful_reuse_generated::int, h.check_count::int, h.observe_count::int, h.last_seen_at::text FROM hive_leases h WHERE ${meaningfulExternalLease} ORDER BY h.contribution_score DESC, h.useful_reuse_generated DESC, h.last_seen_at DESC LIMIT 20`, [firstPartyObserverKey])
  ]);

  return {
    status: 'ok' as const,
    classification: 'server-verified-first-party-reference-observer-and-controlled-benchmarks-excluded',
    semantics: {
      external_protocol_activity: 'successful/admitted hosted protocol activity not classified as first-party or controlled benchmark',
      external_repeat_lease: 'retained external lease with at least two admitted CHECK/OBSERVE operations',
      external_bidirectional_lease: 'retained external lease with both CHECK and OBSERVE activity',
      external_reuse_consumer: 'retained external lease that consumed at least one qualified reuse event',
      unique_actor_claim: false,
      client_only_usage_visible: false
    },
    summary: (summary as any[])[0] || {},
    recent_external_reuse: recentExternalReuse,
    top_external_leases: topExternal
  };
}