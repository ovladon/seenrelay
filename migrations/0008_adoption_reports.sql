CREATE TABLE IF NOT EXISTS adoption_reports_daily (
  day date NOT NULL,
  seenrelay_version varchar(32) NOT NULL,
  integration_class varchar(32) NOT NULL,
  deployment varchar(16) NOT NULL,
  mode varchar(16) NOT NULL,
  verdict varchar(32) NOT NULL,
  workload_class varchar(32) NOT NULL,
  reports integer NOT NULL DEFAULT 0 CHECK (reports >= 0),
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  PRIMARY KEY (day, seenrelay_version, integration_class, deployment, mode, verdict, workload_class)
);

COMMENT ON TABLE adoption_reports_daily IS 'Explicit opt-in aggregate SeenRelay adoption reports. No client/user/repo/IP identifier, prompt, response, source URL, fact value, filename, or customer identity is stored in application state.';
