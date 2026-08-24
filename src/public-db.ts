import { neon } from '@neondatabase/serverless';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

export interface PublicStats {
  generated_at: string;
  facts: number;
  recent_observations: number;
  active_hive_leases_5m: number;
  checks_month: number;
  observes_month: number;
  useful_reuse_month: number;
  useful_reuse_total: number;
  unknown_month: number;
  qualified_reuse_rate: number;
  unknown_rate: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  const rows = await sql().query(`SELECT
    (SELECT COUNT(*)::int FROM facts) AS facts,
    (SELECT COUNT(*)::int FROM observations_recent) AS recent_observations,
    (SELECT COUNT(*)::int FROM hive_leases WHERE last_seen_at >= now()-interval '5 minutes') AS active_hive_leases_5m,
    (SELECT COALESCE(SUM(checks),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS checks_month,
    (SELECT COALESCE(SUM(observes),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS observes_month,
    (SELECT COALESCE(SUM(useful_reuse),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS useful_reuse_month,
    (SELECT COUNT(*)::int FROM useful_reuse_events) AS useful_reuse_total,
    (SELECT COALESCE(SUM(unknown),0)::int FROM hive_metrics_daily WHERE day >= date_trunc('month', current_date)::date) AS unknown_month`) as Array<Record<string, unknown>>;
  const row = rows[0] || {};
  const checks = Number(row.checks_month || 0);
  const reuseChecks = Number(row.useful_reuse_month || 0);
  const unknown = Number(row.unknown_month || 0);
  return {
    generated_at: new Date().toISOString(),
    facts: Number(row.facts || 0),
    recent_observations: Number(row.recent_observations || 0),
    active_hive_leases_5m: Number(row.active_hive_leases_5m || 0),
    checks_month: checks,
    observes_month: Number(row.observes_month || 0),
    useful_reuse_month: reuseChecks,
    useful_reuse_total: Number(row.useful_reuse_total || 0),
    unknown_month: unknown,
    qualified_reuse_rate: checks ? reuseChecks / checks : 0,
    unknown_rate: checks ? unknown / checks : 0
  };
}
