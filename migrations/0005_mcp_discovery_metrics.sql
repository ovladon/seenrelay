CREATE TABLE IF NOT EXISTS mcp_discovery_metrics_daily (
  day date PRIMARY KEY,
  initialize_requests integer NOT NULL DEFAULT 0 CHECK (initialize_requests >= 0),
  tools_list_requests integer NOT NULL DEFAULT 0 CHECK (tools_list_requests >= 0),
  initialize_first_at timestamptz,
  initialize_last_at timestamptz,
  tools_list_first_at timestamptz,
  tools_list_last_at timestamptz
);

COMMENT ON TABLE mcp_discovery_metrics_daily IS 'Aggregate MCP protocol-interest counters only, with no request payloads, client identifiers, IPs, user agents, session IDs, or clientInfo persisted.';
