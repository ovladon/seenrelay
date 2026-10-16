-- Privacy-preserving voluntary Adoption Atlas aggregation.
-- Stores no report/event rows and no actor identifiers. Each accepted report increments one
-- coarse daily aggregate cell. This cannot support unique-user/company claims or deduplication.

CREATE TABLE IF NOT EXISTS adoption_atlas_daily (
  day date NOT NULL,
  seenrelay_version text NOT NULL CHECK (seenrelay_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+([+-][0-9A-Za-z.-]+)?$'),
  integration_class text NOT NULL CHECK (integration_class IN ('cli','sdk','mcp','agent-skill','framework-adapter','rest-openapi','other')),
  deployment_class text NOT NULL CHECK (deployment_class IN ('local','hosted','private-l1')),
  mode text NOT NULL CHECK (mode IN ('shadow','active')),
  decision text NOT NULL CHECK (decision IN ('USE','DO_NOT_USE','INSUFFICIENT')),
  workload_class text NOT NULL CHECK (workload_class IN ('web-research','browser-automation','extraction','api-validation','mcp-tools','agent-tools','monitoring','other')),
  reports integer NOT NULL DEFAULT 0 CHECK (reports >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, seenrelay_version, integration_class, deployment_class, mode, decision, workload_class)
);

COMMENT ON TABLE adoption_atlas_daily IS
  'Voluntary unverified SeenRelay adoption-report aggregates. No event rows, actor IDs, IP-derived identity, user-agent, prompt, response, URL, fact/value, repository, filename or customer identity are stored. Counts are reports, not unique users or companies.';

GRANT SELECT, INSERT, UPDATE ON TABLE adoption_atlas_daily TO seenrelay_runtime;
