import { neon } from '@neondatabase/serverless';

export interface AdoptionDistributionSnapshot {
  [key: string]: unknown;
  collected_at: string;
  checked_surfaces: number;
  healthy_surfaces: number;
  npm_downloads_7d: number | null;
  github_stars: number | null;
  github_forks: number | null;
  mcpfield_installs: number | null;
  signals: Record<string, unknown>;
}

const AUTOMATION_SNAPSHOT_URL =
  'https://raw.githubusercontent.com/ovladon/seenrelay/automation/adoption-atlas-distribution/public/adoption-distribution-latest.json';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

function finiteInteger(value: unknown): number | null {
  const n=Number(value);
  return Number.isInteger(n)&&n>=0?n:null;
}

function parsePublicSnapshot(value: unknown): AdoptionDistributionSnapshot | null {
  if(!value||typeof value!=='object'||Array.isArray(value)) return null;
  const x=value as Record<string,unknown>;
  if(x.schema_version!=='seenrelay-adoption-distribution-public-v1') return null;
  if(typeof x.collected_at!=='string'||!Number.isFinite(Date.parse(x.collected_at))) return null;
  const checked=finiteInteger(x.checked_surfaces);
  const healthy=finiteInteger(x.healthy_surfaces);
  if(checked===null||healthy===null||healthy>checked) return null;
  if(!x.signals||typeof x.signals!=='object'||Array.isArray(x.signals)) return null;
  return {
    collected_at:x.collected_at,
    checked_surfaces:checked,
    healthy_surfaces:healthy,
    npm_downloads_7d:finiteInteger(x.npm_downloads_7d),
    github_stars:finiteInteger(x.github_stars),
    github_forks:finiteInteger(x.github_forks),
    mcpfield_installs:finiteInteger(x.mcpfield_installs),
    signals:x.signals as Record<string,unknown>
  };
}

async function fetchAutomationSnapshot(fetchImpl: typeof fetch): Promise<AdoptionDistributionSnapshot | null> {
  try {
    const response=await fetchImpl(AUTOMATION_SNAPSHOT_URL,{
      headers:{accept:'application/json','user-agent':'SeenRelay-Adoption-Atlas/1.1'},
      signal:AbortSignal.timeout(5_000)
    });
    if(!response.ok) return null;
    return parsePublicSnapshot(await response.json());
  } catch {
    return null;
  }
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

function dbSnapshot(row:any): AdoptionDistributionSnapshot & {day:string} {
  return {
    day:row.day,
    collected_at:row.collected_at,
    checked_surfaces:Number(row.checked_surfaces||0),
    healthy_surfaces:Number(row.healthy_surfaces||0),
    npm_downloads_7d:row.npm_downloads_7d===null?null:Number(row.npm_downloads_7d),
    github_stars:row.github_stars===null?null:Number(row.github_stars),
    github_forks:row.github_forks===null?null:Number(row.github_forks),
    mcpfield_installs:row.mcpfield_installs===null?null:Number(row.mcpfield_installs),
    signals:row.signals_json||{}
  };
}

export async function getLatestAdoptionDistributionSnapshot(fetchImpl: typeof fetch = globalThis.fetch) {
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
  const db=rows[0]?dbSnapshot(rows[0]):null;
  const automated=await fetchAutomationSnapshot(fetchImpl);
  const dbTime=db?Date.parse(db.collected_at):Number.NEGATIVE_INFINITY;
  const autoTime=automated?Date.parse(automated.collected_at):Number.NEGATIVE_INFINITY;

  if(automated&&autoTime>dbTime){
    try { await recordAdoptionDistributionSnapshot(automated); } catch (error) {
      console.error(JSON.stringify({event:'adoption_distribution_backfill_error',error:error instanceof Error?error.message:'unknown'}));
    }
    return {
      status:'ok' as const,
      classification:'public-distribution-context-not-adoption',
      source:'github-automation-snapshot' as const,
      snapshot:{day:automated.collected_at.slice(0,10),...automated}
    };
  }

  if(db){
    return {
      status:'ok' as const,
      classification:'public-distribution-context-not-adoption',
      source:'neon-aggregate' as const,
      snapshot:db
    };
  }

  return {
    status:'empty' as const,
    classification:'public-distribution-context-not-adoption',
    source:'none' as const,
    snapshot:null
  };
}
