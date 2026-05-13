ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS daily_summary_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_summary_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_trading_sessions_daily_summary_sent_at
  ON trading_sessions (daily_summary_sent_at DESC);
