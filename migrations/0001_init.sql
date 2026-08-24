CREATE TABLE IF NOT EXISTS facts (
  fact_key text PRIMARY KEY,
  subject text NOT NULL,
  predicate text NOT NULL,
  qualifiers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz,
  observation_total bigint NOT NULL DEFAULT 0,
  current_value_json jsonb,
  current_value_hash text,
  current_first_seen_at timestamptz,
  current_last_seen_at timestamptz,
  previous_value_json jsonb,
  previous_value_hash text,
  previous_last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_facts_last_observed ON facts(last_observed_at DESC);

CREATE TABLE IF NOT EXISTS observations_recent (
  observation_id text PRIMARY KEY,
  fact_key text NOT NULL REFERENCES facts(fact_key) ON DELETE CASCADE,
  value_json jsonb NOT NULL,
  value_hash text NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  observer_key text NOT NULL,
  evidence_fingerprint text,
  source_validator_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_observations_fact_time ON observations_recent(fact_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_fact_value_time ON observations_recent(fact_key, value_hash, observed_at DESC);

CREATE TABLE IF NOT EXISTS observer_fact_state (
  fact_key text NOT NULL REFERENCES facts(fact_key) ON DELETE CASCADE,
  observer_key text NOT NULL,
  last_value_hash text NOT NULL,
  last_observed_at timestamptz NOT NULL,
  last_received_at timestamptz NOT NULL,
  accepted_observations bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (fact_key, observer_key)
);

CREATE INDEX IF NOT EXISTS idx_observer_state_received ON observer_fact_state(last_received_at DESC);
