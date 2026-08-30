import { config } from './config.js';

function days(seconds: number): number { return Math.round((seconds / 86400) * 100) / 100; }

export function dataPracticesDescriptor(origin: string) {
  const cfg = config();
  return {
    title: 'SeenRelay Technical Data Practices',
    status: 'technical_transparency_not_legal_privacy_notice',
    scope: 'Application-level behavior. Infrastructure providers may maintain their own security/operational logs under their terms and configuration.',
    purpose: 'Operate a freshness network for source-backed facts while minimizing identity material.',
    application_collects: {
      fact_descriptor: ['subject', 'predicate', 'qualifiers', 'canonicalized source URL', 'optional source-native locator'],
      observation_request_processing: ['value in request memory for deterministic fingerprinting', 'timestamps', 'optional evidence fingerprint', 'optional source validator'],
      provenance: ['privacy-salted observer identifier', 'assurance class', 'optional proof fingerprint'],
      hive: ['privacy-salted operational client fingerprint', 'optional server-verified first-party classification derived from a short-lived signed marker', 'privacy-salted conservative reuse-independence bucket', 'lease state', 'aggregate contribution/reuse counters'],
      aggregate_metrics: ['CHECK/OBSERVE outcomes', 'useful reuse', 'lease counts', 'MCP initialize/tools/list aggregate request counters']
    },
    application_persists: {
      observation_evidence: ['deterministic value fingerprint', 'timestamps', 'pseudonymous provenance', 'optional evidence fingerprint', 'optional source validator'],
      fact_state: ['fact identity metadata', 'current/previous value fingerprints', 'freshness timestamps', 'observation counters']
    },
    legacy_storage: 'Active Production raw-value columns have been purged, and database constraints prevent raw submitted values from being persisted there. Historical database branches or provider recovery snapshots may retain earlier state until removed under backup or retention controls.',
    shared_response_boundary: 'CHECK returns comparison status, value fingerprints and bounded evidence metadata; it does not return another observer\'s submitted raw value.',
    application_does_not_store_as_database_identity: [
      'raw transport IP address',
      'raw user-agent string',
      'raw Ed25519 public key',
      'raw self-asserted observer_id'
    ],
    discovery_telemetry: {
      stores: 'Daily aggregate counts of MCP initialize and tools/list request events only.',
      does_not_store: ['MCP request payloads', 'clientInfo', 'raw IP address', 'raw user-agent', 'MCP session identifier'],
      interpretation: 'Protocol-interest telemetry is not a unique-client count and is never classified as adoption; automated directory probes and operator diagnostics may be included.'
    },
    identity_processing: {
      client_fingerprint: 'Transport IP hint + user-agent + optional x-seenrelay-client are privacy-salted and hashed for frictionless lease continuity. When configured, a short-lived server-verified marker can classify first-party operational probes without storing the marker or signing secret.',
      reuse_independence: 'Useful-reuse rewards require a different conservative privacy-salted network bucket; x-seenrelay-client and user-agent do not establish reward independence.',
      observer_key: 'Self-asserted IDs and Ed25519 public keys are privacy-salted before application persistence.',
      caveat: 'Pseudonymization reduces exposure; it does not make data anonymous in every legal or contextual sense. Network separation is an anti-farming signal, not proof of unique real-world actors.'
    },
    retention: {
      observation_rows_days: days(cfg.retentionSeconds),
      observer_fact_state_days: days(cfg.retentionSeconds),
      hive_lease_operational_retention_days: days(cfg.hiveLeaseRetentionSeconds),
      useful_reuse_event_retention_days: days(cfg.hiveReuseRetentionSeconds),
      fact_summary: 'Retained to support STALE/latest-observed semantics until an explicit deletion/retention policy removes it.',
      aggregate_daily_metrics: 'Retained as operational network measurements unless separately removed.'
    },
    submission_boundary: {
      intended: 'Public or legitimately accessible source-backed operational facts needed by agent workflows.',
      do_not_submit: ['passwords', 'API keys', 'access tokens', 'private cryptographic keys', 'unnecessary sensitive personal data'],
      source_url_hygiene: 'Embedded URL credentials and authentication/signature query parameters are rejected. Known tracking parameters and fragments are removed during deterministic canonicalization.',
      semantic_filtering: 'SeenRelay does not use an LLM to inspect or classify submitted values; callers remain responsible for what they submit.'
    },
    product_boundary: {
      outbound_source_fetch: false,
      search: false,
      external_verification: false,
      llm_truth_oracle: false,
      general_agent_memory: false
    },
    environments: {
      production_metrics: 'Production database only; synthetic Preview/CI traffic must never be represented as traction.',
      preview_ci: 'Dedicated isolated database branch.',
      reserved_test_namespace_production_guard: true
    },
    endpoints: {
      service: `${origin}/service.json`,
      data_practices: `${origin}/data-practices.json`,
      public_stats: `${origin}/public-stats.json`
    }
  };
}

export function dataPracticesPage(origin: string): string {
  const d = dataPracticesDescriptor(origin);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Technical data practices for SeenRelay freshness infrastructure."><title>SeenRelay — Data Practices</title><link rel="stylesheet" href="/site.css"></head><body><header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Overview</a><a href="/service.json">Machine JSON</a><a href="/data-practices.json">Data JSON</a></nav></header><main><section class="hero compact"><div class="eyebrow">TECHNICAL TRANSPARENCY</div><h1>Minimize identity. Preserve utility.</h1><p class="lead">This page describes application-level data handling for security and infrastructure review. It is deliberately factual and is not presented as a substitute for a formal legal privacy notice.</p></section><section class="section"><div class="section-head"><div><div class="eyebrow">IDENTITY</div><h2>Pseudonymous by design.</h2></div><p>${d.identity_processing.client_fingerprint}</p></div><div class="proof-grid"><article><b>Transport material</b><span>Raw IP and user-agent are not used as database identity; the application derives privacy-salted operational fingerprints.</span></article><article><b>Observer provenance</b><span>Self-asserted IDs and Ed25519 public keys are salted before persistence. Cryptographic proof still means key possession, not real-world identity.</span></article><article><b>Persistent evidence</b><span>Observations persist deterministic value fingerprints and bounded evidence metadata rather than the submitted raw value. Active Production raw-value columns have been purged and constrained; historical database branches or provider recovery snapshots are managed separately under backup or retention controls.</span></article><article><b>Shared response boundary</b><span>CHECK exposes comparison status and bounded freshness evidence, not another observer's submitted raw value. Do not submit credentials, private keys or unnecessary sensitive personal data.</span></article><article><b>Environment integrity</b><span>Preview/CI uses an isolated database. Production metrics are reserved for actual Production activity.</span></article></div></section><section class="section"><div class="section-head"><div><div class="eyebrow">RETENTION</div><h2>Keep evidence only as long as it serves a purpose.</h2></div></div><div class="metrics"><article><div class="label">Observation rows</div><div class="metric">${d.retention.observation_rows_days}d</div><div class="hint">configured evidence horizon</div></article><article><div class="label">Observer/fact state</div><div class="metric">${d.retention.observer_fact_state_days}d</div><div class="hint">aligned pseudonymous state</div></article><article><div class="label">Hive leases</div><div class="metric">${d.retention.hive_lease_operational_retention_days}d</div><div class="hint">operational retention</div></article><article><div class="label">Reuse events</div><div class="metric">${d.retention.useful_reuse_event_retention_days}d</div><div class="hint">network utility evidence</div></article></div><p class="lead small">Fact summaries remain available for STALE/latest-observed semantics until an explicit deletion policy removes them. Aggregate operational metrics are separate from retained observation evidence.</p></section><section class="section final"><div><div class="eyebrow">MACHINE REVIEW</div><h2>Prefer structured disclosure?</h2></div><div class="cta"><a class="primary" href="/data-practices.json">Data practices JSON</a><a class="secondary" href="/service.json">Service descriptor</a></div></section></main><footer><span>SeenRelay</span><span>Technical transparency, not a legal privacy notice.</span><span>CHECK · OBSERVE</span></footer></body></html>`;
}
