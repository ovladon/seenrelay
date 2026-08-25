import { neon } from '@neondatabase/serverless';

export type McpDiscoveryEvent = 'initialize' | 'tools_list';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

function methodEvent(value: unknown): McpDiscoveryEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const method = (value as { method?: unknown }).method;
  if (method === 'initialize') return 'initialize';
  if (method === 'tools/list') return 'tools_list';
  return null;
}

/**
 * Classify only the JSON-RPC method name needed for aggregate discovery telemetry.
 * No request body, clientInfo, headers, session identifier, IP, or user-agent is returned or stored.
 */
export async function classifyMcpDiscoveryRequest(request: Request): Promise<McpDiscoveryEvent[]> {
  if (request.method !== 'POST') return [];
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return [];
  try {
    const body = await request.clone().json();
    const messages = Array.isArray(body) ? body : [body];
    return messages.map(methodEvent).filter((event): event is McpDiscoveryEvent => event !== null);
  } catch {
    return [];
  }
}

export async function recordMcpDiscoveryEvents(events: McpDiscoveryEvent[]): Promise<void> {
  if (!events.length) return;
  const initialize = events.filter((event) => event === 'initialize').length;
  const toolsList = events.filter((event) => event === 'tools_list').length;
  if (!initialize && !toolsList) return;
  await sql().query(`INSERT INTO mcp_discovery_metrics_daily (
      day, initialize_requests, tools_list_requests,
      initialize_first_at, initialize_last_at, tools_list_first_at, tools_list_last_at
    ) VALUES (
      current_date, $1, $2,
      CASE WHEN $1 > 0 THEN now() END, CASE WHEN $1 > 0 THEN now() END,
      CASE WHEN $2 > 0 THEN now() END, CASE WHEN $2 > 0 THEN now() END
    )
    ON CONFLICT (day) DO UPDATE SET
      initialize_requests = mcp_discovery_metrics_daily.initialize_requests + EXCLUDED.initialize_requests,
      tools_list_requests = mcp_discovery_metrics_daily.tools_list_requests + EXCLUDED.tools_list_requests,
      initialize_first_at = COALESCE(mcp_discovery_metrics_daily.initialize_first_at, EXCLUDED.initialize_first_at),
      initialize_last_at = COALESCE(EXCLUDED.initialize_last_at, mcp_discovery_metrics_daily.initialize_last_at),
      tools_list_first_at = COALESCE(mcp_discovery_metrics_daily.tools_list_first_at, EXCLUDED.tools_list_first_at),
      tools_list_last_at = COALESCE(EXCLUDED.tools_list_last_at, mcp_discovery_metrics_daily.tools_list_last_at)`, [initialize, toolsList]);
}

export async function getMcpDiscoverySnapshot() {
  const rows = await sql().query(`SELECT
    COALESCE(SUM(initialize_requests),0)::int AS initialize_total,
    COALESCE(SUM(tools_list_requests),0)::int AS tools_list_total,
    COALESCE(SUM(initialize_requests) FILTER (WHERE day = current_date),0)::int AS initialize_today,
    COALESCE(SUM(tools_list_requests) FILTER (WHERE day = current_date),0)::int AS tools_list_today,
    COALESCE(SUM(initialize_requests) FILTER (WHERE day >= current_date - 6),0)::int AS initialize_7d,
    COALESCE(SUM(tools_list_requests) FILTER (WHERE day >= current_date - 6),0)::int AS tools_list_7d,
    COALESCE(SUM(initialize_requests) FILTER (WHERE day >= date_trunc('month', current_date)::date),0)::int AS initialize_month,
    COALESCE(SUM(tools_list_requests) FILTER (WHERE day >= date_trunc('month', current_date)::date),0)::int AS tools_list_month,
    MIN(initialize_first_at)::text AS first_initialize_at,
    MAX(initialize_last_at)::text AS last_initialize_at,
    MIN(tools_list_first_at)::text AS first_tools_list_at,
    MAX(tools_list_last_at)::text AS last_tools_list_at
    FROM mcp_discovery_metrics_daily`);
  return {
    status: 'ok' as const,
    classification: 'aggregate-protocol-interest-not-adoption',
    summary: (rows as any[])[0] || {}
  };
}
