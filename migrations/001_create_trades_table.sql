-- Crear tabla trades
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  pair VARCHAR(20) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

-- Insertar datos de ejemplo
INSERT INTO trades (pair, entry_price, pnl, status) VALUES
  ('BTC/USDT', 42500.50, 1250.75, 'OPEN'),
  ('ETH/USDT', 2250.25, -150.30, 'OPEN'),
  ('SOL/USDT', 98.75, 45.20, 'CLOSED'),
  ('ADA/USDT', 0.52, 12.50, 'OPEN'),
  ('DOT/USDT', 7.85, -8.75, 'CLOSED');

-- Comentario: Después de ejecutar este SQL en tu base de datos PostgreSQL,
-- debes rastrear la tabla en Hasura Console para que esté disponible en GraphQL:
-- 1. Abre Hasura Console: http://149.130.182.57:8085/console
-- 2. Ve a la pestaña "Data"
-- 3. Selecciona tu base de datos
-- 4. Ve a la pestaña "Track Tables"
-- 5. Haz clic en "Track" junto a la tabla "trades"
-- 6. Opcionalmente, configura permisos en la pestaña "Permissions" para la tabla trades
