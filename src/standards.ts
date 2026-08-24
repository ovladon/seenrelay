export const standardsPosture = {
  reviewed_at: '2026-08-24',
  maintenance_model: 'continuous_watch_isolated_candidate_verified_release',
  mcp: {
    implemented: '2026-07-28',
    sdk: '@modelcontextprotocol/server@2.0.0',
    status: 'implemented_e2e_verified',
    transport: 'stateless_http',
    discovery: 'server/discover',
    watch: 'modelcontextprotocol/modelcontextprotocol'
  },
  a2a: {
    tracked: '1.0.0',
    status: 'monitored_not_exposed',
    reason: 'SeenRelay is currently a tool/infrastructure service, not a task-oriented autonomous agent. Publishing an Agent Card without a genuine A2A task interface would be misleading.',
    watch: 'a2aproject/A2A'
  },
  observability: {
    opentelemetry_semconv_tracked: '1.44.0',
    status: 'tracked_for_adoption',
    principle: 'Adopt standard telemetry semantics when they improve interoperability without leaking fact, source, identity, or customer-sensitive payloads.'
  },
  security: {
    oauth_bcp: 'RFC9700',
    dpop: 'RFC9449',
    mcp_direction: ['workload_identity_federation', 'proof_of_possession', 'delegated_authority', 'enterprise_managed_authorization'],
    posture: 'track_before_need_adopt_before_enterprise_auth'
  }
} as const;

export type StandardsPosture = typeof standardsPosture;
