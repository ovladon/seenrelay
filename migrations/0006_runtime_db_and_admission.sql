CREATE TABLE IF NOT EXISTS hive_admission_windows (
  admission_key text NOT NULL,
  window_start timestamptz NOT NULL,
  admissions integer NOT NULL CHECK (admissions >= 1),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (admission_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_hive_admission_windows_updated_at
  ON hive_admission_windows(updated_at);

COMMENT ON TABLE hive_admission_windows IS
  'Coarse privacy-scoped network fixed-window counters for new-lease and aggregate CHECK/OBSERVE abuse ceilings; not actor identity, observer provenance, reward independence, or truth confidence.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seenrelay_runtime') THEN
    CREATE ROLE seenrelay_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- A pre-existing role is an operator/security boundary, not something a migration should silently
-- broaden or rewrite. Fail closed if its defensive attributes do not match the intended grant role.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'seenrelay_runtime'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'seenrelay_runtime exists with broader role attributes than allowed';
  END IF;
END
$$;

-- Re-baseline direct privileges on every migration run. This removes accidental/manual grants
-- before restoring the exact runtime matrix below. Privileges inherited from PostgreSQL's PUBLIC
-- role are outside this direct-grant baseline and must not include SECURITY DEFINER escalation paths.
DO $$
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM seenrelay_runtime', current_database());
END
$$;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM seenrelay_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM seenrelay_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM seenrelay_runtime;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO seenrelay_runtime', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO seenrelay_runtime;

GRANT SELECT, INSERT, UPDATE ON TABLE facts TO seenrelay_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE observations_recent TO seenrelay_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE observer_fact_state TO seenrelay_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hive_leases TO seenrelay_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE hive_metrics_daily TO seenrelay_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE mcp_discovery_metrics_daily TO seenrelay_runtime;
GRANT SELECT, UPDATE ON TABLE runtime_controls TO seenrelay_runtime;
GRANT SELECT, INSERT ON TABLE admin_audit_events TO seenrelay_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE useful_reuse_events TO seenrelay_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hive_admission_windows TO seenrelay_runtime;
