## Trading Journal + Binance Listener

This project es un trading journal en Next.js que consume Hasura para sus datos en tiempo real y ahora incluye:

- Websocket de precios Yahoo Finance (trades manuales/otros brokers)
- Websocket de precios Binance para trades marcados con `broker = BINANCE`
- Esqueleto de listener de ejecuciones Binance (Spot + Futures) para insertar trades automáticamente
- Variables de entorno para API keys y Hasura admin

## Uso Rápido

1. Instala dependencias y levanta la app:

```bash
npm install
npm run dev
```

2. Configura variables en `.env` (ver sección siguiente).

3. Ejecuta el listener si quieres auto-ingesta desde Binance:

```bash
node scripts/binance-listener.js --spot --futures
```

### Con Docker Compose

- Para desarrollo local: `docker compose -f docker-compose.prod.yml up -d binance-listener-dev`
- En la VM (carpeta `/home/ubuntu/n8n`): `docker compose up -d binance-listener`

## Problemas Detectados / Próximos Fixes

- El listener necesita implementar upsert (external_order_id/external_trade_id) para evitar duplicados, especialmente en Futures.
- Falta diferenciar `broker = BINANCE_SPOT` vs `BINANCE_FUTURES` según la cuenta enlazada.
- El hook de PnL mostrará valores correctos sólo cuando los trades tengan el broker configurado; se planea agregar soporte para mostrar PnL no realizado en Futures con mayor precisión.

## Variables de Entorno Clave

En `.env` se añadieron las variables:

```
NEXT_PUBLIC_HASURA_HTTP_URL=
NEXT_PUBLIC_HASURA_WS_URL=
NEXT_PUBLIC_HASURA_ADMIN_SECRET=

BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_FUTURES_API_KEY=
BINANCE_FUTURES_API_SECRET=

HASURA_HTTP_URL=
HASURA_ADMIN_SECRET=
DESKTOP_AUTH_SECRET=
```

- Los valores `HASURA_*` son los que usa el listener server-side.
- Guarda las claves de Binance sólo en el servidor (no expongas en frontend).
- Para multi-usuario en el futuro deberías cifrar y asociar API keys por cuenta.
- `DESKTOP_AUTH_SECRET` firma tokens de sesión desktop (Tauri). Si no se define, se usa `NEXTAUTH_SECRET` como fallback.

## Desktop App (Tauri 2)

La app desktop vive en `apps/desktop` y usa:

- UI: React + TypeScript + Vite
- Shell nativo: Rust + Tauri 2
- Auth: pairing con backend (`/api/desktop/auth/*`)

### Desktop + API local (recomendado para desarrollo)

Para que la app desktop tenga chat, órdenes, eventos WSS y demás rutas `/v1/*`, corre también `apps/api` en tu máquina:

```bash
pnpm dev:api
pnpm dev:trading
```

Opcionalmente puedes forzar endpoints de API/WSS en `apps/desktop/.env`:

```bash
VITE_API_URL=http://127.0.0.1:4000
VITE_WS_URL=ws://127.0.0.1:4000
```

Si no defines esas variables, el cliente desktop ahora intenta fallback automático a `http://127.0.0.1:4000` / `ws://127.0.0.1:4000` en modo desarrollo.

### Comandos rápidos

Desde la raíz del repo:

```bash
npm run desktop:install
npm run desktop:web
```

- `desktop:web` levanta solo la UI web de desktop (puerto `1420`).

Para build web de desktop:

```bash
npm --prefix apps/desktop run build
```

Para build nativo Tauri:

```bash
npm run desktop:build
```

### Requisitos del host Linux (si compilas Tauri en VM)

- Rust/Cargo (`rustup`)
- toolchain Linux de Tauri (`pkg-config`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, etc.)

### Importante para Windows

- Esta VM compila binarios Linux (en este caso `aarch64`).
- Para generar instalador `.exe` de Windows de forma estable, compila en:
  - una máquina Windows, o
  - un runner `windows-latest` en CI (GitHub Actions).

### CI para Windows

Se añadió el workflow [`desktop-windows-build.yml`](.github/workflows/desktop-windows-build.yml) que:

1. Instala dependencias de `apps/desktop`.
2. Ejecuta `npm --prefix apps/desktop run tauri:build` en `windows-latest`.
3. Publica artefactos (`.exe` / `.msi`) en GitHub Actions.

Puedes correrlo manualmente con `Run workflow` desde la pestaña Actions.

## Listener Binance (scripts/binance-listener.js)

Características:

- Obtiene `listenKey` de Spot/Futures y abre WebSocket de user-data.
- Mapea eventos `executionReport` (spot) y `ORDER_TRADE_UPDATE` (futuros) a `trades_activos`.
- Inserta registros con campos mínimos (`simbolo`, `direccion`, `precio_entrada`, `monto_margin`, `broker=BINANCE`).

TODOs recomendados:

1. Guardar `external_order_id` / `external_trade_id` para upsert y dedupe.
2. Actualizar trades cuando se cierran (precio_salida, fecha_cierre, estado=CLOSED).
3. Manejar comisiones y apalancamiento consultando endpoints adicionales.

## Modo de Precios

El hook `useRealTimePnL` ahora:

- Usa Yahoo Finance únicamente para trades `broker !== BINANCE`.
- Abre WebSocket `miniTicker` de Binance para trades `broker = BINANCE`.
- Combina ambos feeds para calcular el PnL en componentes (`ActiveTrades`, `TradeList`, etc.).

## Próximos Pasos Sugeridos

1. Hasura Event Trigger → n8n para que Telegram pregunte notas psicológicas al insertar/actualizar un trade.
2. Agregar campos `external_order_id`, `external_trade_id`, `qty`, `quote_qty` a `trades_activos`.
3. Implementar cierre automático cuando Binance reporte `ORDER_TRADE_UPDATE` con `X` status `FILLED`.
4. Configurar permisos Hasura para exponer `broker` y nuevos campos.
5. Añadir tests automáticos para el listener.

## Alertas Críticas Node-first (Fase 1)

Se implementó una base robusta para alertas críticas con deduplicación estricta en Node, usando Telegram como canal principal y n8n como fallback opcional/manual.

### Componentes

- Motor de alertas: [`runCriticalAlertsCheck()`](src/lib/alerts/engine.ts:364)
- Endpoint interno de chequeo: [`POST()`](src/app/api/alerts/check/route.ts:12)
- Toggle de fallback n8n: [`GET()`](src/app/api/alerts/fallback/route.ts:12) y [`POST()`](src/app/api/alerts/fallback/route.ts:28)
- Monitor programado (loop): [`main()`](scripts/alerts-monitor.js:46)
- Migración de tablas de alertas: [`005_create_alerting_tables.sql`](migrations/005_create_alerting_tables.sql)

### Tablas nuevas

- `alert_trade_state`: estado por trade para dedupe/cooldown
- `alert_notification_events`: historial de envíos y errores
- `alert_runtime_config`: flags runtime (incluye `n8n_fallback_enabled`)

### Variables de entorno requeridas

Agrega en tu entorno de backend:

```
ALERTS_INTERNAL_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Opcional fallback n8n
N8N_FALLBACK_WEBHOOK_URL=

# Umbrales y comportamiento (opcionales, tienen default)
ALERT_LOSS_THRESHOLD_PCT=-8
ALERT_ESCALATION_STEP_PCT=2
ALERT_COOLDOWN_MINUTES=30
ALERT_MAX_RETRIES=3
ALERTS_INTERVAL_MS=60000
ALERTS_BASE_URL=http://localhost:3000
```

### Cómo ejecutar

1. Ejecuta la migración SQL [`005_create_alerting_tables.sql`](migrations/005_create_alerting_tables.sql).
2. Levanta la app.
3. Arranca el monitor:

```bash
npm run alerts:monitor
```

Para aplicar SQL de alertas/backfill rápidamente:

```bash
npm run alerts:sql
```

4. Para disparo manual:
   - `POST /api/alerts/check` con header `x-alerts-token`

5. Para activar/desactivar fallback n8n:
   - `GET /api/alerts/fallback`
   - `POST /api/alerts/fallback` body `{ "enabled": true|false }`

### Comportamiento de deduplicación

- Envía alerta cuando entra en estado crítico por pérdida.
- Re-alerta solo si:
  - empeora por escalamiento real, o
  - se cumple cooldown.
- Envía mensaje de recuperación cuando vuelve a zona segura.

## Alertas Críticas Node-first (Fase 2)

### Mejoras aplicadas

- Persistencia consistente de `tipo_estrategia = 'TRADING'` al crear trades Binance en [`open-position route`](src/app/api/binance/open-position/route.ts:116).
- Backfill para trades abiertos Binance existentes en [`006_backfill_tipo_estrategia_binance_open.sql`](migrations/006_backfill_tipo_estrategia_binance_open.sql:1).
- Endurecimiento de auth interna con comparación segura de token en [`isInternalAlertsRequest()`](src/lib/alerts/auth.ts:10).
- Endpoints de alertas actualizados para usar auth centralizada en [`check route`](src/app/api/alerts/check/route.ts:1) y [`fallback route`](src/app/api/alerts/fallback/route.ts:1).
- Script SQL operativo para aplicar migraciones de alertas en [`apply-alerts-sql.js`](scripts/apply-alerts-sql.js:1).

### Checklist de despliegue en producción

1. Definir `ALERTS_INTERNAL_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
2. (Opcional) Definir `N8N_FALLBACK_WEBHOOK_URL`.
3. Ejecutar [`npm run alerts:sql`](package.json:11).
4. Verificar endpoint interno de salud funcional vía [`POST /api/alerts/check`](src/app/api/alerts/check/route.ts:12).
5. Iniciar monitor con [`npm run alerts:monitor`](package.json:10) o servicio [`alerts-monitor`](docker-compose.prod.yml:45).
6. Mantener fallback n8n desactivado por defecto y activarlo solo bajo contingencia vía [`POST /api/alerts/fallback`](src/app/api/alerts/fallback/route.ts:28).
