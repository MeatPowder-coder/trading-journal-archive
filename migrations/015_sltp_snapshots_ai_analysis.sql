-- SL/TP tracking, chart snapshots, and AI analysis for desktop trading workflows.

CREATE TABLE IF NOT EXISTS sltp_moves (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  move_type VARCHAR(8) NOT NULL,
  from_price NUMERIC(20, 8),
  to_price NUMERIC(20, 8) NOT NULL,
  reason TEXT,
  price_at_move NUMERIC(20, 8),
  moved_toward_entry BOOLEAN,
  r_ratio_at_move NUMERIC(12, 4),
  CONSTRAINT sltp_moves_move_type_check CHECK (move_type IN ('SL', 'TP'))
);

CREATE INDEX IF NOT EXISTS idx_sltp_moves_trade_created_at
  ON sltp_moves (trade_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chart_snapshots (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  sltp_move_id INTEGER REFERENCES sltp_moves(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger VARCHAR(20) NOT NULL,
  image_url TEXT NOT NULL,
  timeframe VARCHAR(20),
  indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chart_snapshots_trigger_check
    CHECK (trigger IN ('ENTRY', 'EXIT', 'SL_MOVE', 'TP_MOVE', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_chart_snapshots_trade_created_at
  ON chart_snapshots (trade_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chart_snapshots_sltp_move_id
  ON chart_snapshots (sltp_move_id);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades_activos(id) ON DELETE CASCADE,
  snapshot_id INTEGER REFERENCES chart_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt TEXT NOT NULL,
  response TEXT,
  model VARCHAR(120) NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error TEXT,
  CONSTRAINT ai_analyses_status_check CHECK (status IN ('PENDING', 'DONE', 'ERROR'))
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_trade_created_at
  ON ai_analyses (trade_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_snapshot_id
  ON ai_analyses (snapshot_id);
