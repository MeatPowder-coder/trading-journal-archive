ALTER TABLE trades_activos
  ADD COLUMN stop_loss NUMERIC(20,8),
  ADD COLUMN take_profit NUMERIC(20,8),
  ADD COLUMN sl_status VARCHAR(20) DEFAULT 'NONE',
  ADD COLUMN sl_source VARCHAR(30),
  ADD COLUMN sl_reason TEXT,
  ADD COLUMN timeframe VARCHAR(10),
  ADD COLUMN setup_tag VARCHAR(50),
  ADD COLUMN emocion_entrada VARCHAR(30);
