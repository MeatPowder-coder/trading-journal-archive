ALTER TABLE trades_activos
  ADD COLUMN IF NOT EXISTS external_order_id varchar(64),
  ADD COLUMN IF NOT EXISTS external_trade_id varchar(64),
  ADD COLUMN IF NOT EXISTS exchange_type varchar(32);

CREATE INDEX IF NOT EXISTS idx_trades_activos_external_order ON trades_activos (external_order_id);
CREATE INDEX IF NOT EXISTS idx_trades_activos_external_trade ON trades_activos (external_trade_id);