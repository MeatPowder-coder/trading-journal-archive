-- Audit trail for SL movements that increase risk and require explicit override reason.

CREATE TABLE IF NOT EXISTS sl_override_audit (
  id BIGSERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  previous_sl NUMERIC(20,8) NOT NULL,
  new_sl NUMERIC(20,8) NOT NULL,
  reason TEXT NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'UI_OVERRIDE',
  actor_type VARCHAR(20) NOT NULL DEFAULT 'ui',
  actor_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sl_override_audit_trade_id
  ON sl_override_audit (trade_id);

CREATE INDEX IF NOT EXISTS idx_sl_override_audit_created_at
  ON sl_override_audit (created_at DESC);
