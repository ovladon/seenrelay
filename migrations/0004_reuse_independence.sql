ALTER TABLE hive_leases
  ADD COLUMN IF NOT EXISTS independence_key text;

CREATE INDEX IF NOT EXISTS idx_hive_leases_independence_active
  ON hive_leases(independence_key, expires_at DESC)
  WHERE independence_key IS NOT NULL;

COMMENT ON COLUMN hive_leases.independence_key IS
  'Privacy-salted conservative network bucket used for useful-reuse anti-farming; distinct from accountless lease continuity client_key.';
