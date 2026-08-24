CREATE TABLE IF NOT EXISTS hive_leases (
  lease_id text PRIMARY KEY,
  client_key text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_refill_at timestamptz NOT NULL,
  check_tokens double precision NOT NULL,
  check_count bigint NOT NULL DEFAULT 0,
  observe_count bigint NOT NULL DEFAULT 0,
  useful_reuse_generated bigint NOT NULL DEFAULT 0,
  useful_reuse_consumed bigint NOT NULL DEFAULT 0,
  contribution_score double precision NOT NULL DEFAULT 0,
  last_fact_key text,
  last_operation text,
  last_outcome text
);

CREATE INDEX IF NOT EXISTS idx_hive_leases_client_active ON hive_leases(client_key, expires_at DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_hive_leases_last_seen ON hive_leases(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_hive_leases_contribution ON hive_leases(contribution_score DESC);

ALTER TABLE observations_recent
  ADD COLUMN IF NOT EXISTS lease_id text REFERENCES hive_leases(lease_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_observations_lease_time ON observations_recent(lease_id, observed_at DESC) WHERE lease_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS useful_reuse_events (
  fact_key text NOT NULL REFERENCES facts(fact_key) ON DELETE CASCADE,
  value_hash text NOT NULL,
  contributor_lease_id text NOT NULL REFERENCES hive_leases(lease_id) ON DELETE CASCADE,
  consumer_lease_id text NOT NULL REFERENCES hive_leases(lease_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  utility_units double precision NOT NULL DEFAULT 1,
  PRIMARY KEY (fact_key, value_hash, contributor_lease_id, consumer_lease_id),
  CHECK (contributor_lease_id <> consumer_lease_id),
  CHECK (utility_units > 0)
);

CREATE INDEX IF NOT EXISTS idx_useful_reuse_created ON useful_reuse_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_useful_reuse_contributor ON useful_reuse_events(contributor_lease_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_useful_reuse_consumer ON useful_reuse_events(consumer_lease_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hive_metrics_daily (
  day date PRIMARY KEY,
  checks bigint NOT NULL DEFAULT 0,
  observes bigint NOT NULL DEFAULT 0,
  unknown bigint NOT NULL DEFAULT 0,
  stale bigint NOT NULL DEFAULT 0,
  same_observed bigint NOT NULL DEFAULT 0,
  changed_observed bigint NOT NULL DEFAULT 0,
  contested bigint NOT NULL DEFAULT 0,
  useful_reuse bigint NOT NULL DEFAULT 0,
  new_leases bigint NOT NULL DEFAULT 0
);
