CREATE TABLE IF NOT EXISTS runtime_controls (
  control_id text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'NORMAL',
  checks_enabled boolean NOT NULL DEFAULT true,
  observes_enabled boolean NOT NULL DEFAULT true,
  rewards_enabled boolean NOT NULL DEFAULT true,
  capacity_multiplier double precision NOT NULL DEFAULT 1,
  refill_multiplier double precision NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'bootstrap',
  CHECK (control_id = 'global'),
  CHECK (mode IN ('NORMAL','SHIELD','READ_ONLY','FREEZE')),
  CHECK (capacity_multiplier >= 0 AND capacity_multiplier <= 2),
  CHECK (refill_multiplier >= 0 AND refill_multiplier <= 2)
);

INSERT INTO runtime_controls (control_id)
VALUES ('global')
ON CONFLICT (control_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_audit_events (
  audit_id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON admin_audit_events(occurred_at DESC);
