-- Alerting tables for Node-first critical trade notifications

CREATE TABLE IF NOT EXISTS alert_trade_state (
  trade_id INT PRIMARY KEY REFERENCES trades_activos(id) ON DELETE CASCADE,
  last_status VARCHAR(32) NOT NULL DEFAULT 'SAFE',
  last_severity NUMERIC(10,4),
  last_event_key VARCHAR(128),
  last_notified_at TIMESTAMPTZ,
  last_recovered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_trade_state_status ON alert_trade_state (last_status);
CREATE INDEX IF NOT EXISTS idx_alert_trade_state_updated_at ON alert_trade_state (updated_at DESC);

CREATE TABLE IF NOT EXISTS alert_notification_events (
  id BIGSERIAL PRIMARY KEY,
  trade_id INT NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL,
  event_key VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  severity NUMERIC(10,4),
  success BOOLEAN NOT NULL,
  error TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_notification_events_trade_id ON alert_notification_events (trade_id);
CREATE INDEX IF NOT EXISTS idx_alert_notification_events_sent_at ON alert_notification_events (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_notification_events_event_key ON alert_notification_events (event_key);

CREATE TABLE IF NOT EXISTS alert_runtime_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO alert_runtime_config (key, value)
VALUES ('n8n_fallback_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

