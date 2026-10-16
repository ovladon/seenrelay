-- Daily public-distribution context for Adoption Atlas v1.
-- Stores aggregate/public metrics only. No actor, client, IP, request, repository-visitor,
-- prompt, source fact, or customer identity is collected.

CREATE TABLE IF NOT EXISTS adoption_atlas_distribution_daily (
  day date PRIMARY KEY,
  collected_at timestamptz NOT NULL,
  checked_surfaces integer NOT NULL CHECK (checked_surfaces >= 0),
  healthy_surfaces integer NOT NULL CHECK (healthy_surfaces >= 0 AND healthy_surfaces <= checked_surfaces),
  npm_downloads_7d integer CHECK (npm_downloads_7d IS NULL OR npm_downloads_7d >= 0),
  github_stars integer CHECK (github_stars IS NULL OR github_stars >= 0),
  github_forks integer CHECK (github_forks IS NULL OR github_forks >= 0),
  mcpfield_installs integer CHECK (mcpfield_installs IS NULL OR mcpfield_installs >= 0),
  signals_json jsonb NOT NULL CHECK (jsonb_typeof(signals_json) = 'object')
);

COMMENT ON TABLE adoption_atlas_distribution_daily IS
  'Daily aggregate/public distribution context for Adoption Atlas. Public reach/discovery evidence only; not unique users, companies, customers, or verified adoption.';

GRANT SELECT, INSERT, UPDATE ON TABLE adoption_atlas_distribution_daily TO seenrelay_runtime;
