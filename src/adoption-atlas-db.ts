import { neon } from '@neondatabase/serverless';

export interface AdoptionAtlasDimensions {
  seenrelay_version: string;
  integration_class: 'cli' | 'sdk' | 'mcp' | 'agent-skill' | 'framework-adapter' | 'rest-openapi' | 'other';
  deployment_class: 'local' | 'hosted' | 'private-l1';
  mode: 'shadow' | 'active';
  decision: 'USE' | 'DO_NOT_USE' | 'INSUFFICIENT';
  workload_class: 'web-research' | 'browser-automation' | 'extraction' | 'api-validation' | 'mcp-tools' | 'agent-tools' | 'monitoring' | 'other';
}

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

export async function recordAdoptionAtlasReport(input: AdoptionAtlasDimensions, nowIso = new Date().toISOString()): Promise<void> {
  await sql().query(`
    INSERT INTO adoption_atlas_daily (
      day, seenrelay_version, integration_class, deployment_class, mode, decision, workload_class, reports, updated_at
    ) VALUES (
      $1::timestamptz::date, $2, $3, $4, $5, $6, $7, 1, $1::timestamptz
    )
    ON CONFLICT (day, seenrelay_version, integration_class, deployment_class, mode, decision, workload_class)
    DO UPDATE SET
      reports = adoption_atlas_daily.reports + 1,
      updated_at = EXCLUDED.updated_at
  `, [
    nowIso,
    input.seenrelay_version,
    input.integration_class,
    input.deployment_class,
    input.mode,
    input.decision,
    input.workload_class
  ]);
}

export async function getAdoptionAtlasSnapshot(days = 30) {
  const boundedDays = Math.max(1, Math.min(365, Math.trunc(days)));
  const q = sql();
  const [summary, cells] = await Promise.all([
    q.query(`
      SELECT
        COALESCE(SUM(reports),0)::int AS reports_total,
        COALESCE(SUM(reports) FILTER (WHERE day >= current_date-6),0)::int AS reports_7d,
        COALESCE(SUM(reports) FILTER (WHERE mode='active'),0)::int AS active_reports,
        COALESCE(SUM(reports) FILTER (WHERE mode='shadow'),0)::int AS shadow_reports,
        COALESCE(SUM(reports) FILTER (WHERE decision='USE'),0)::int AS use_reports,
        COALESCE(SUM(reports) FILTER (WHERE decision='DO_NOT_USE'),0)::int AS do_not_use_reports,
        COALESCE(SUM(reports) FILTER (WHERE decision='INSUFFICIENT'),0)::int AS insufficient_reports,
        MAX(updated_at)::text AS last_report_at
      FROM adoption_atlas_daily
      WHERE day >= current_date-($1::int-1)
    `, [boundedDays]),
    q.query(`
      SELECT day::text, seenrelay_version, integration_class, deployment_class, mode, decision, workload_class, reports::int
      FROM adoption_atlas_daily
      WHERE day >= current_date-($1::int-1)
      ORDER BY day DESC, reports DESC, seenrelay_version DESC, integration_class, deployment_class, mode, decision, workload_class
      LIMIT 500
    `, [boundedDays])
  ]);
  return {
    status: 'ok' as const,
    classification: 'voluntary-unverified-aggregate-adoption-signal',
    semantics: {
      reports_are_unique_actors: false,
      deduplicated: false,
      identity_stored: false,
      ip_as_identity_stored: false,
      user_agent_stored: false,
      client_only_usage_visible_without_opt_in: false,
      suitable_for_triangulation: true
    },
    window_days: boundedDays,
    summary: (summary as any[])[0] || {},
    cells
  };
}
