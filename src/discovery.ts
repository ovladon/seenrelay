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

/**
 * Emit discovery interest to the runtime observability stream instead of PostgreSQL.
 *
 * This function deliberately keeps its historical name because handleMcp already treats it
 * as fail-open telemetry. A database write per MCP initialize/tools-list request kept the
 * scale-to-zero database awake even though these events are protocol interest, not adoption.
 * The structured event retains the useful aggregate signal without touching DATABASE_URL.
 */
export async function recordMcpDiscoveryEvents(events: McpDiscoveryEvent[]): Promise<void> {
  if (!events.length) return;
  const initialize = events.filter((event) => event === 'initialize').length;
  const toolsList = events.filter((event) => event === 'tools_list').length;
  if (!initialize && !toolsList) return;
  console.info(JSON.stringify({
    event: 'mcp_discovery',
    classification: 'aggregate-protocol-interest-not-adoption',
    initialize_requests: initialize,
    tools_list_requests: toolsList
  }));
}

/**
 * Historical persisted discovery snapshot.
 *
 * The table is intentionally retained so pre-cutover evidence is not destroyed. Live MCP
 * discovery interest is emitted as structured runtime telemetry and no longer advances this
 * table. CHECK/OBSERVE/adoption telemetry remains database-backed and unchanged.
 */
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
    persistence: 'historical-db-snapshot' as const,
    live_source: 'runtime-observability' as const,
    summary: (rows as any[])[0] || {}
  };
}
