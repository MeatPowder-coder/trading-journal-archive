-- Trading Journal v2 discipline schema
-- Adds checklist/session fields, SL move tracking, MAE/MFE, and R:R metrics.

ALTER TABLE trades_activos
  ADD COLUMN IF NOT EXISTS checklist_confirmed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS checklist_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entry_tesis TEXT,
  ADD COLUMN IF NOT EXISTS sl_original NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS sl_was_moved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sl_move_direction VARCHAR(20) DEFAULT 'not_moved',
  ADD COLUMN IF NOT EXISTS sl_move_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_adverse_excursion NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS max_favorable_excursion NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS rr_estimated NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS rr_actual NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS rr_max_possible NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS session_mental_state VARCHAR(20),
  ADD COLUMN IF NOT EXISTS close_rating SMALLINT,
  ADD COLUMN IF NOT EXISTS sl_move_reflection TEXT,
  ADD COLUMN IF NOT EXISTS risk_amount_usdt NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS risk_percent NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS consecutive_losses_snapshot INTEGER DEFAULT 0;

ALTER TABLE trades_activos
  DROP CONSTRAINT IF EXISTS trades_activos_sl_move_direction_check;

ALTER TABLE trades_activos
  ADD CONSTRAINT trades_activos_sl_move_direction_check
  CHECK (
    sl_move_direction IS NULL
    OR sl_move_direction IN ('not_moved', 'risk_increase', 'risk_reduction', 'breakeven')
  );

ALTER TABLE trades_activos
  DROP CONSTRAINT IF EXISTS trades_activos_session_mental_state_check;

ALTER TABLE trades_activos
  ADD CONSTRAINT trades_activos_session_mental_state_check
  CHECK (
    session_mental_state IS NULL
    OR session_mental_state IN ('calm', 'slightly_anxious', 'stressed', 'avoid')
  );

ALTER TABLE trades_activos
  DROP CONSTRAINT IF EXISTS trades_activos_close_rating_check;

ALTER TABLE trades_activos
  ADD CONSTRAINT trades_activos_close_rating_check
  CHECK (close_rating IS NULL OR (close_rating >= 1 AND close_rating <= 5));

CREATE INDEX IF NOT EXISTS idx_trades_activos_checklist_timestamp
  ON trades_activos (checklist_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_trades_activos_sl_was_moved
  ON trades_activos (sl_was_moved);

CREATE INDEX IF NOT EXISTS idx_trades_activos_sl_move_direction
  ON trades_activos (sl_move_direction);

CREATE INDEX IF NOT EXISTS idx_trades_activos_session_mental_state
  ON trades_activos (session_mental_state);

CREATE TABLE IF NOT EXISTS sl_movements (
  id BIGSERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  original_sl NUMERIC(20,8) NOT NULL,
  new_sl NUMERIC(20,8) NOT NULL,
  direction VARCHAR(20) NOT NULL,
  risk_increased BOOLEAN NOT NULL DEFAULT FALSE,
  client_order_id VARCHAR(128),
  source VARCHAR(30) NOT NULL DEFAULT 'BINANCE_WEBSOCKET',
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sl_movements_trade_id
  ON sl_movements (trade_id);

CREATE INDEX IF NOT EXISTS idx_sl_movements_moved_at
  ON sl_movements (moved_at DESC);

CREATE TABLE IF NOT EXISTS trading_sessions (
  id SERIAL PRIMARY KEY,
  session_date DATE NOT NULL UNIQUE,
  mental_state VARCHAR(20),
  rules_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  consecutive_losses_today INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  override_used BOOLEAN NOT NULL DEFAULT FALSE,
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trading_sessions_mental_state_check
    CHECK (mental_state IS NULL OR mental_state IN ('calm', 'slightly_anxious', 'stressed', 'avoid'))
);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_session_date
  ON trading_sessions (session_date DESC);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_blocked_until
  ON trading_sessions (blocked_until);

CREATE TABLE IF NOT EXISTS account_snapshots (
  id SERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  balance_usdt NUMERIC(12,2) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  notes TEXT,
  CONSTRAINT account_snapshots_source_check
    CHECK (source IN ('manual', 'binance_api'))
);

CREATE INDEX IF NOT EXISTS idx_account_snapshots_recorded_at
  ON account_snapshots (recorded_at DESC);
