import { neon } from '@neondatabase/serverless';

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

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
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
    q.query(`SELECT substring(replace(lease_id,'-',''),1,12) AS radar_id, issued_at::text, last_seen_at::text, expires_at::text, check_count::int, observe_count::int, useful_reuse_generated::int, useful_reuse_consumed::int, contribution_score::float8, last_operation, last_outcome FROM hive_leases WHERE last_seen_at >= now()-interval '5 minutes' ORDER BY last_seen_at DESC LIMIT 300`),
    q.query(`SELECT day::text, checks::int, observes::int, unknown::int, stale::int, same_observed::int, changed_observed::int, contested::int, useful_reuse::int, new_leases::int FROM hive_metrics_daily WHERE day >= current_date-29 ORDER BY day ASC`),
    q.query(`SELECT substring(replace(contributor_lease_id,'-',''),1,12) AS contributor, substring(replace(consumer_lease_id,'-',''),1,12) AS consumer, created_at::text, utility_units::float8 FROM useful_reuse_events ORDER BY created_at DESC LIMIT 40`),
    q.query(`SELECT substring(replace(lease_id,'-',''),1,12) AS radar_id, contribution_score::float8, useful_reuse_generated::int, check_count::int, observe_count::int, last_seen_at::text FROM hive_leases ORDER BY contribution_score DESC, useful_reuse_generated DESC LIMIT 20`),
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
