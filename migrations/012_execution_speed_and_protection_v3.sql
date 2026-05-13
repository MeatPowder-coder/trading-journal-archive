-- v3: fast execution flow, protection telemetry, and extended discipline states.

ALTER TABLE trades_activos
  ADD COLUMN IF NOT EXISTS order_type VARCHAR(10) DEFAULT 'MARKET',
  ADD COLUMN IF NOT EXISTS entry_order_status VARCHAR(24) DEFAULT 'FILLED',
  ADD COLUMN IF NOT EXISTS checklist_checked_count SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist_total SMALLINT DEFAULT 11,
  ADD COLUMN IF NOT EXISTS checklist_missing JSONB,
  ADD COLUMN IF NOT EXISTS protection_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS protection_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protection_endpoint VARCHAR(20),
  ADD COLUMN IF NOT EXISTS protection_last_error TEXT,
  ADD COLUMN IF NOT EXISTS protection_retry_count INTEGER DEFAULT 0;

ALTER TABLE trades_activos
  DROP CONSTRAINT IF EXISTS trades_activos_order_type_check;

ALTER TABLE trades_activos
  ADD CONSTRAINT trades_activos_order_type_check
  CHECK (
    order_type IS NULL
    OR order_type IN ('MARKET', 'LIMIT')
  );

ALTER TABLE trades_activos
  DROP CONSTRAINT IF EXISTS trades_activos_entry_order_status_check;

ALTER TABLE trades_activos
  ADD CONSTRAINT trades_activos_entry_order_status_check
  CHECK (
    entry_order_status IS NULL
    OR entry_order_status IN ('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED')
  );

ALTER TABLE trades_activos
  DROP CONSTRAINT IF EXISTS trades_activos_session_mental_state_check;

ALTER TABLE trades_activos
  ADD CONSTRAINT trades_activos_session_mental_state_check
  CHECK (
    session_mental_state IS NULL
    OR session_mental_state IN (
      'calm',
      'focused',
      'confident',
      'slightly_anxious',
      'anxious',
      'fatigued',
      'fomo',
      'avoid'
    )
  );

ALTER TABLE trading_sessions
  DROP CONSTRAINT IF EXISTS trading_sessions_mental_state_check;

ALTER TABLE trading_sessions
  ADD CONSTRAINT trading_sessions_mental_state_check
  CHECK (
    mental_state IS NULL
    OR mental_state IN (
      'calm',
      'focused',
      'confident',
      'slightly_anxious',
      'anxious',
      'fatigued',
      'fomo',
      'avoid'
    )
  );

CREATE INDEX IF NOT EXISTS idx_trades_activos_order_type
  ON trades_activos (order_type);

CREATE INDEX IF NOT EXISTS idx_trades_activos_entry_order_status
  ON trades_activos (entry_order_status);

CREATE INDEX IF NOT EXISTS idx_trades_activos_protection_required
  ON trades_activos (protection_required);

CREATE TABLE IF NOT EXISTS trade_metric_snapshots (
  id BIGSERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price NUMERIC(20,8) NOT NULL,
  stop_loss NUMERIC(20,8),
  take_profit NUMERIC(20,8),
  rr_actual NUMERIC(12,6),
  max_adverse_excursion NUMERIC(20,8),
  max_favorable_excursion NUMERIC(20,8),
  source VARCHAR(30) NOT NULL DEFAULT 'listener_5s'
);

CREATE INDEX IF NOT EXISTS idx_trade_metric_snapshots_trade_id
  ON trade_metric_snapshots (trade_id);

CREATE INDEX IF NOT EXISTS idx_trade_metric_snapshots_recorded_at
  ON trade_metric_snapshots (recorded_at DESC);

CREATE TABLE IF NOT EXISTS binance_protection_audit (
  id BIGSERIAL PRIMARY KEY,
  trade_id INTEGER REFERENCES trades_activos(id) ON DELETE SET NULL,
  symbol VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  order_kind VARCHAR(8) NOT NULL,
  attempted_endpoint VARCHAR(20) NOT NULL,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  binance_code INTEGER,
  binance_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_binance_protection_audit_trade_id
  ON binance_protection_audit (trade_id);

CREATE INDEX IF NOT EXISTS idx_binance_protection_audit_created_at
  ON binance_protection_audit (created_at DESC);
