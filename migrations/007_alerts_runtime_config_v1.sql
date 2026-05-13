-- Runtime configuration and audit tables for alerting UI control (V1)

CREATE TABLE IF NOT EXISTS alert_config_audit (
  id BIGSERIAL PRIMARY KEY,
  changed_by TEXT,
  changed_email TEXT,
  previous_value JSONB,
  new_value JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_config_audit_changed_at
  ON alert_config_audit (changed_at DESC);

CREATE TABLE IF NOT EXISTS alert_test_events (
  id BIGSERIAL PRIMARY KEY,
  triggered_by TEXT,
  triggered_email TEXT,
  success BOOLEAN NOT NULL,
  error TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_test_events_sent_at
  ON alert_test_events (sent_at DESC);

INSERT INTO alert_runtime_config (key, value)
VALUES (
  'alerts_config_v1',
  jsonb_build_object(
    'version', 1,
    'lossThresholdPct', -8,
    'gainThresholdPct', 12,
    'cooldownMinutes', 30,
    'dedupEnabled', true,
    'escalationEnabled', true,
    'escalationStepPct', 2,
    'recoveryEnabled', true,
    'fallbackEnabled', false,
    'maxRetries', 3,
    'testNotificationsEnabled', true,
    'testCooldownSeconds', 60
  )
)
ON CONFLICT (key) DO NOTHING;

