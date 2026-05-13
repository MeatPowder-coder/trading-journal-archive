# Configuración de la Base de Datos - Trading Journal

## Problema
El error `field 'trades' not found in type: 'subscription_root'` ocurre porque la tabla `trades` no existe en la base de datos PostgreSQL o no ha sido rastreada en Hasura.

## Solución

### Opción 1: Ejecutar SQL directamente en Hasura Console (Recomendado)

1. **Abre Hasura Console:**
   - Navega a: http://149.130.182.57:8085/console
   - Ingresa la clave de administrador: `pon_una_clave_segura_aqui`

2. **Ve a la pestaña "Data"** en el menú superior

3. **Selecciona tu base de datos** (normalmente llamada "default" o "postgres")

4. **Haz clic en la pestaña "SQL"** en el menú lateral

5. **Copia y pega el siguiente SQL:**

```sql
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
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);

-- Insertar datos de ejemplo
INSERT INTO trades (pair, entry_price, pnl, status) VALUES
  ('BTC/USDT', 42500.50, 1250.75, 'OPEN'),
  ('ETH/USDT', 2250.25, -150.30, 'OPEN'),
  ('SOL/USDT', 98.75, 45.20, 'CLOSED'),
  ('ADA/USDT', 0.52, 12.50, 'OPEN'),
  ('DOT/USDT', 7.85, -8.75, 'CLOSED');
```

6. **Marca la casilla "Track this"** (Rastrear esto) debajo del área de texto SQL

7. **Haz clic en "Run!"**

8. **¡Listo!** La tabla se creará y se rastreará automáticamente en Hasura

### Opción 2: Si la tabla ya existe pero no está rastreada

Si ya ejecutaste el SQL pero la tabla no aparece en GraphQL:

1. **Abre Hasura Console:** http://149.130.182.57:8085/console

2. **Ve a Data → [tu base de datos] → Untracked tables or views**

3. **Busca la tabla "trades"** en la lista

4. **Haz clic en "Track"** junto a la tabla trades

### Opción 3: Usando psql (Terminal)

Si tienes acceso directo a PostgreSQL:

```bash
# Conectar a la base de datos
psql -h 149.130.182.57 -U postgres -d postgres

# Pegar el contenido de migrations/001_create_trades_table.sql

# Luego debes rastrear la tabla en Hasura Console (ver Opción 2)
```

## Verificar que funciona

1. **En Hasura Console**, ve a la pestaña "API"

2. **Ejecuta esta consulta de prueba:**

```graphql
subscription {
  trades(order_by: {id: desc}) {
    id
    pair
    entry_price
    pnl
    status
  }
}
```

3. **Deberías ver los datos de ejemplo**

## Configurar Permisos (Opcional pero recomendado)

Para permitir consultas públicas (si tu app no usa autenticación):

1. **En Hasura Console**, ve a Data → trades → Permissions

2. **En la fila "public"**, haz clic en el ícono de lápiz en la columna "select"

3. **Marca "Without any checks"** (permite lectura pública)

4. **Selecciona las columnas que quieres exponer:** id, pair, entry_price, pnl, status

5. **Haz clic en "Save Permissions"**

6. **Repite para "subscribe"** si quieres permitir suscripciones públicas

## Probar la Aplicación

Una vez completados los pasos anteriores:

```bash
# Inicia tu aplicación Next.js
npm run dev
```

Luego abre http://localhost:3000 y deberías ver la lista de trades sin errores.

## Troubleshooting

### Si el error persiste:

1. **Verifica la conexión:**
   - Asegúrate de que Hasura esté corriendo en http://149.130.182.57:8085
   - Prueba acceder a la consola web

2. **Verifica la tabla:**
   - En Hasura Console → Data, confirma que "trades" aparece en la lista de tablas rastreadas

3. **Verifica los permisos:**
   - Asegúrate de que el rol "public" tiene permisos de select y subscribe

4. **Revisa la configuración de Apollo:**
   - Confirma que la URL en `src/lib/apollo-provider.tsx` sea correcta
   - Verifica que la clave de administrador sea la correcta

5. **Limpia el caché del navegador:**
   - A veces el navegador cachea la respuesta del error

## Estructura de la Tabla

```
trades
├── id (SERIAL, PRIMARY KEY)
├── pair (VARCHAR(20), NOT NULL) - Ej: "BTC/USDT"
├── entry_price (DECIMAL(20,8), NOT NULL) - Precio de entrada
├── pnl (DECIMAL(20,8), DEFAULT 0) - Profit & Loss
├── status (VARCHAR(20), DEFAULT 'OPEN') - Estado: OPEN/CLOSED
├── created_at (TIMESTAMP WITH TIME ZONE)
└── updated_at (TIMESTAMP WITH TIME ZONE)
```

## Próximos Pasos

- Puedes agregar más campos a la tabla según tus necesidades
- Configurar triggers para actualizar `updated_at` automáticamente
- Agregar más datos de ejemplo
- Implementar mutaciones para insertar/actualizar/eliminar trades
