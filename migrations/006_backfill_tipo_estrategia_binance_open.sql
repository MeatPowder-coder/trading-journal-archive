-- Backfill strategy type for existing open Binance futures trades

UPDATE trades_activos
SET tipo_estrategia = 'TRADING'
WHERE estado = 'OPEN'
  AND broker = 'BINANCE_FUTURES'
  AND (tipo_estrategia IS NULL OR BTRIM(tipo_estrategia) = '');

