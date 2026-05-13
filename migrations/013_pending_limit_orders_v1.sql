-- Separate pending LIMIT orders from executed trades.
-- LIMIT orders remain in pending_limit_orders until FILLED, then are promoted to trades_activos.

CREATE TABLE IF NOT EXISTS pending_limit_orders (
  id BIGSERIAL PRIMARY KEY,
  simbolo VARCHAR(20) NOT NULL,
  direccion VARCHAR(10) NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  stop_loss NUMERIC(20,8),
  take_profit NUMERIC(20,8),
  margin NUMERIC(20,8) NOT NULL,
  leverage INTEGER NOT NULL,
  order_status VARCHAR(24) NOT NULL DEFAULT 'NEW',
  external_order_id VARCHAR(64),
  external_client_order_id VARCHAR(128),
  broker VARCHAR(40) NOT NULL DEFAULT 'BINANCE_FUTURES',
  exchange_type VARCHAR(20) NOT NULL DEFAULT 'FUTURES',
  ticker_api VARCHAR(20),
  cuenta_id INTEGER,
  checklist_confirmed BOOLEAN DEFAULT FALSE,
  checklist_checked_count SMALLINT DEFAULT 0,
  checklist_total SMALLINT DEFAULT 11,
  checklist_missing JSONB,
  checklist_timestamp TIMESTAMPTZ,
  entry_tesis TEXT,
  setup_tag VARCHAR(80),
  timeframe VARCHAR(30),
  zona_entrada VARCHAR(120),
  tendencia_macro VARCHAR(20),
  contexto_mercado VARCHAR(30),
  volatilidad VARCHAR(10),
  tipo_liquidez VARCHAR(20),
  estado_delta VARCHAR(20),
  volumen_estado VARCHAR(20),
  absorcion_detectada BOOLEAN DEFAULT FALSE,
  emocion_entrada VARCHAR(60),
  session_mental_state VARCHAR(20),
  screenshot_url TEXT,
  source VARCHAR(30) NOT NULL DEFAULT 'UI',
  last_binance_endpoint VARCHAR(20),
  last_binance_error TEXT,
  last_fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  fill_price NUMERIC(20,8),
  fill_quantity NUMERIC(20,8),
  filled_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  promoted_trade_id INTEGER REFERENCES trades_activos(id) ON DELETE SET NULL,
  legacy_trade_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_limit_orders_direction_check
    CHECK (direccion IN ('LONG', 'SHORT')),
  CONSTRAINT pending_limit_orders_status_check
    CHECK (order_status IN ('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_pending_limit_orders_status
  ON pending_limit_orders(order_status);

CREATE INDEX IF NOT EXISTS idx_pending_limit_orders_symbol
  ON pending_limit_orders(simbolo);

CREATE INDEX IF NOT EXISTS idx_pending_limit_orders_created_at
  ON pending_limit_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_limit_orders_promoted_trade_id
  ON pending_limit_orders(promoted_trade_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_limit_orders_external_order_id
  ON pending_limit_orders(external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_limit_orders_legacy_trade_id
  ON pending_limit_orders(legacy_trade_id)
  WHERE legacy_trade_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pending_limit_order_events (
  id BIGSERIAL PRIMARY KEY,
  pending_order_id BIGINT NOT NULL REFERENCES pending_limit_orders(id) ON DELETE CASCADE,
  event_type VARCHAR(24) NOT NULL,
  actor_type VARCHAR(20),
  actor_id VARCHAR(80),
  reason TEXT,
  payload_before JSONB,
  payload_after JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_limit_order_events_type_check
    CHECK (event_type IN ('created', 'edited', 'canceled', 'filled', 'migrated', 'status_sync'))
);

CREATE INDEX IF NOT EXISTS idx_pending_limit_order_events_pending_id
  ON pending_limit_order_events(pending_order_id);

CREATE INDEX IF NOT EXISTS idx_pending_limit_order_events_created_at
  ON pending_limit_order_events(created_at DESC);

ALTER TABLE IF EXISTS react_chat_sessions
  ADD COLUMN IF NOT EXISTS pending_limit_order_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'react_chat_sessions_pending_limit_order_id_fkey'
  ) THEN
    ALTER TABLE react_chat_sessions
      ADD CONSTRAINT react_chat_sessions_pending_limit_order_id_fkey
      FOREIGN KEY (pending_limit_order_id)
      REFERENCES pending_limit_orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_react_chat_sessions_pending_limit_order_id
  ON react_chat_sessions(pending_limit_order_id);

CREATE TEMP TABLE _migrated_pending_limits (
  pending_order_id BIGINT,
  legacy_trade_id INTEGER
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO pending_limit_orders (
    simbolo,
    direccion,
    entry_price,
    stop_loss,
    take_profit,
    margin,
    leverage,
    order_status,
    external_order_id,
    broker,
    exchange_type,
    ticker_api,
    cuenta_id,
    checklist_confirmed,
    checklist_checked_count,
    checklist_total,
    checklist_missing,
    checklist_timestamp,
    entry_tesis,
    setup_tag,
    timeframe,
    zona_entrada,
    tendencia_macro,
    contexto_mercado,
    volatilidad,
    tipo_liquidez,
    estado_delta,
    volumen_estado,
    absorcion_detectada,
    emocion_entrada,
    session_mental_state,
    screenshot_url,
    source,
    last_binance_endpoint,
    last_binance_error,
    created_at,
    updated_at,
    legacy_trade_id
  )
  SELECT
    t.simbolo,
    t.direccion,
    t.precio_entrada,
    t.stop_loss,
    t.take_profit,
    t.monto_margin,
    t.apalancamiento,
    COALESCE(NULLIF(t.entry_order_status, ''), 'NEW'),
    t.external_order_id,
    COALESCE(NULLIF(t.broker, ''), 'BINANCE_FUTURES'),
    COALESCE(NULLIF(t.exchange_type, ''), 'FUTURES'),
    COALESCE(NULLIF(t.ticker_api, ''), t.simbolo),
    t.cuenta_id,
    COALESCE(t.checklist_confirmed, FALSE),
    COALESCE(t.checklist_checked_count, 0),
    COALESCE(t.checklist_total, 11),
    t.checklist_missing,
    t.checklist_timestamp,
    t.entry_tesis,
    t.setup_tag,
    t.timeframe,
    t.zona_entrada,
    t.tendencia_macro,
    t.contexto_mercado,
    t.volatilidad,
    t.tipo_liquidez,
    t.estado_delta,
    t.volumen_estado,
    COALESCE(t.absorcion_detectada, FALSE),
    t.emocion_entrada,
    t.session_mental_state,
    t.screenshot_url,
    'MIGRATION',
    t.protection_endpoint,
    t.protection_last_error,
    COALESCE(t.fecha_apertura, NOW()),
    NOW(),
    t.id
  FROM trades_activos t
  WHERE t.estado = 'OPEN'
    AND COALESCE(t.order_type, 'MARKET') = 'LIMIT'
    AND COALESCE(t.entry_order_status, 'NEW') NOT IN ('FILLED', 'PARTIALLY_FILLED')
  ON CONFLICT DO NOTHING
  RETURNING id, legacy_trade_id
)
INSERT INTO _migrated_pending_limits (pending_order_id, legacy_trade_id)
SELECT id, legacy_trade_id
FROM inserted;

INSERT INTO pending_limit_order_events (
  pending_order_id,
  event_type,
  actor_type,
  reason,
  payload_after,
  metadata
)
SELECT
  m.pending_order_id,
  'migrated',
  'system',
  'Migrated from legacy trades_activos pending LIMIT model',
  to_jsonb(p.*),
  jsonb_build_object('legacy_trade_id', m.legacy_trade_id)
FROM _migrated_pending_limits m
JOIN pending_limit_orders p ON p.id = m.pending_order_id;

UPDATE react_chat_sessions s
SET pending_limit_order_id = m.pending_order_id,
    trade_id = NULL,
    updated_at = NOW()
FROM _migrated_pending_limits m
WHERE s.trade_id = m.legacy_trade_id;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'alert_notification_events',
    'alert_trade_state',
    'sl_movements',
    'trade_metric_snapshots',
    'binance_protection_audit',
    'sl_override_audit'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM %I WHERE trade_id IN (SELECT legacy_trade_id FROM _migrated_pending_limits)',
        tbl
      );
    END IF;
  END LOOP;
END $$;

DELETE FROM trades_activos
WHERE id IN (SELECT legacy_trade_id FROM _migrated_pending_limits);
