import { neon } from '@neondatabase/serverless';
import { privacyScopedHash } from './identity.js';

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

export async function getAdminSnapshotData() {
  const q = sql();
  const firstPartyObserverKey = await referenceObserverKey();
  const externalLeaseFilter = `NOT EXISTS (SELECT 1 FROM observations_recent fp WHERE fp.lease_id = h.lease_id AND fp.observer_key = $1)`;
  const [summary, active, metrics, reuse, top, audit] = await Promise.all([
    q.query(`SELECT
      (SELECT COUNT(DISTINCT fact_key)::int FROM observations_recent WHERE observer_key <> $1) AS facts,
      (SELECT COUNT(*)::int FROM observations_recent WHERE observer_key <> $1) AS observations,
      (SELECT COUNT(*)::int FROM observations_recent WHERE observer_key <> $1) AS observes_month,
      (SELECT COUNT(DISTINCT fact_key)::int FROM observations_recent WHERE observer_key <> $1) AS external_facts,
      (SELECT COUNT(*)::int FROM observations_recent WHERE observer_key <> $1) AS external_observations,
      (SELECT COUNT(DISTINCT observer_key)::int FROM observations_recent WHERE observer_key <> $1) AS external_observer_keys,
      (SELECT COUNT(*)::int FROM hive_leases) AS leases_total,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE last_seen_at >= now()-interval '60 seconds' AND ${externalLeaseFilter}) AS leases_active_60s,
      (SELECT COUNT(*)::int FROM hive_leases h WHERE last_seen_at >= now()-interval '5 minutes' AND ${externalLeaseFilter}) AS leases_active_5m,
      (SELECT COUNT(*)::int FROM useful_reuse_events e WHERE NOT EXISTS (SELECT 1 FROM observations_recent fp WHERE fp.lease_id = e.consumer_lease_id AND fp.observer_key = $1)) AS useful_reuse_total,
      (SELECT COALESCE(SUM(checks),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS checks_month,
      (SELECT COALESCE(SUM(unknown),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS unknown_month,
      (SELECT COUNT(*)::int FROM useful_reuse_events e WHERE e.created_at >= date_trunc('month', current_date) AND NOT EXISTS (SELECT 1 FROM observations_recent fp WHERE fp.lease_id = e.consumer_lease_id AND fp.observer_key = $1)) AS reuse_month,
      pg_database_size(current_database())::bigint AS database_bytes`, [firstPartyObserverKey]),
    q.query(`SELECT substring(replace(h.lease_id,'-',''),1,12) AS radar_id, h.issued_at::text, h.last_seen_at::text, h.expires_at::text, h.check_count::int, h.observe_count::int, h.useful_reuse_generated::int, h.useful_reuse_consumed::int, h.contribution_score::float8, h.last_operation, h.last_outcome FROM hive_leases h WHERE h.last_seen_at >= now()-interval '5 minutes' AND ${externalLeaseFilter} ORDER BY h.last_seen_at DESC LIMIT 300`, [firstPartyObserverKey]),
    q.query(`SELECT day::text, checks::int, observes::int, unknown::int, stale::int, same_observed::int, changed_observed::int, contested::int, useful_reuse::int, new_leases::int FROM hive_metrics_daily WHERE day >= current_date-29 ORDER BY day ASC`),
    q.query(`SELECT substring(replace(e.contributor_lease_id,'-',''),1,12) AS contributor, substring(replace(e.consumer_lease_id,'-',''),1,12) AS consumer, e.created_at::text, e.utility_units::float8 FROM useful_reuse_events e WHERE NOT EXISTS (SELECT 1 FROM observations_recent fp WHERE fp.lease_id = e.consumer_lease_id AND fp.observer_key = $1) ORDER BY e.created_at DESC LIMIT 40`, [firstPartyObserverKey]),
    q.query(`SELECT substring(replace(h.lease_id,'-',''),1,12) AS radar_id, h.contribution_score::float8, h.useful_reuse_generated::int, h.check_count::int, h.observe_count::int, h.last_seen_at::text FROM hive_leases h WHERE ${externalLeaseFilter} ORDER BY h.contribution_score DESC, h.useful_reuse_generated DESC LIMIT 20`, [firstPartyObserverKey]),
    q.query(`SELECT occurred_at::text, action, detail_json FROM admin_audit_events ORDER BY occurred_at DESC LIMIT 50`)
  ]);
  return {
    summary: (summary as any[])[0] || {},
    active_leases: active,
    metrics_daily: metrics,
    recent_reuse: reuse,
    top_contributors: top,
    audit
  };
}
