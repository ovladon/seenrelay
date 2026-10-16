import { neon } from '@neondatabase/serverless';

export interface AdoptionDistributionSnapshot {
  collected_at: string;
  checked_surfaces: number;
  healthy_surfaces: number;
  npm_downloads_7d: number | null;
  github_stars: number | null;
  github_forks: number | null;
  mcpfield_installs: number | null;
  signals: Record<string, unknown>;
}

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

export async function recordAdoptionDistributionSnapshot(snapshot: AdoptionDistributionSnapshot): Promise<void> {
  await sql().query(`
    INSERT INTO adoption_atlas_distribution_daily (
      day, collected_at, checked_surfaces, healthy_surfaces,
      npm_downloads_7d, github_stars, github_forks, mcpfield_installs, signals_json
    ) VALUES (
      $1::timestamptz::date, $1::timestamptz, $2, $3, $4, $5, $6, $7, $8::jsonb
    )
    ON CONFLICT (day) DO UPDATE SET
      collected_at = EXCLUDED.collected_at,
      checked_surfaces = EXCLUDED.checked_surfaces,
      healthy_surfaces = EXCLUDED.healthy_surfaces,
      npm_downloads_7d = EXCLUDED.npm_downloads_7d,
      github_stars = EXCLUDED.github_stars,
      github_forks = EXCLUDED.github_forks,
      mcpfield_installs = EXCLUDED.mcpfield_installs,
      signals_json = EXCLUDED.signals_json
  `, [
    snapshot.collected_at,
    snapshot.checked_surfaces,
    snapshot.healthy_surfaces,
    snapshot.npm_downloads_7d,
    snapshot.github_stars,
    snapshot.github_forks,
    snapshot.mcpfield_installs,
    JSON.stringify(snapshot.signals)
  ]);
}

export async function getLatestAdoptionDistributionSnapshot() {
  const rows = await sql().query(`
    SELECT
      day::text,
      collected_at::text,
      checked_surfaces::int,
      healthy_surfaces::int,
      npm_downloads_7d::int,
      github_stars::int,
      github_forks::int,
      mcpfield_installs::int,
      signals_json
    FROM adoption_atlas_distribution_daily
    ORDER BY day DESC
    LIMIT 1
  `) as any[];
  const row = rows[0];
  if (!row) {
    return {
      status: 'empty' as const,
      classification: 'public-distribution-context-not-adoption',
      snapshot: null
    };
  }
  return {
    status: 'ok' as const,
    classification: 'public-distribution-context-not-adoption',
    snapshot: {
      day: row.day,
      collected_at: row.collected_at,
      checked_surfaces: Number(row.checked_surfaces || 0),
      healthy_surfaces: Number(row.healthy_surfaces || 0),
      npm_downloads_7d: row.npm_downloads_7d === null ? null : Number(row.npm_downloads_7d),
      github_stars: row.github_stars === null ? null : Number(row.github_stars),
      github_forks: row.github_forks === null ? null : Number(row.github_forks),
      mcpfield_installs: row.mcpfield_installs === null ? null : Number(row.mcpfield_installs),
      signals: row.signals_json || {}
    }
  };
}
