-- Add broker field to trades_activos for exchange/source routing
ALTER TABLE trades_activos
  ADD COLUMN IF NOT EXISTS broker VARCHAR(50) DEFAULT 'MANUAL';

-- Optional index for filtering by broker
CREATE INDEX IF NOT EXISTS idx_trades_activos_broker ON trades_activos (broker);