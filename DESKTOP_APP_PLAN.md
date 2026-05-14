# Trading Journal Desktop - Arquitectura Objetivo y Plan Maestro

Fecha base: 2026-05-14

Este documento es el plan operativo para convertir el journal actual en una plataforma con app Windows como centro principal de trading, manteniendo el backend seguro en la VPS y preparando el proyecto para mas frontends, brokers e integraciones.

## 1. Arquitectura Recomendada

La direccion correcta es una arquitectura por capas:

- App Windows en Tauri para ejecucion diaria, graficos, CVD, footprint, journal y ejecucion.
- Backend dedicado en Node/Fastify para REST, WebSocket, broker services, snapshots y AI.
- Postgres existente como fuente de verdad.
- Prisma como schema/client compartido, empezando con `prisma db pull`.
- Paquetes compartidos para contratos, tipos y normalizacion de datos.

Mejoras clave sobre la propuesta inicial:

- No meter WebSockets serios dentro de Next API routes; usar `apps/api`.
- Binance REST firmado vive solo en VPS.
- Binance WS publico puede correr desde Tauri para baja latencia.
- Tauri Rust debe manejar streams de alta frecuencia y emitir eventos al frontend.
- `tauri::command` queda para suscribir/cancelar, no para cada tick.
- Liquidation heatmap real tipo Coinglass necesita Coinglass API; sin eso se muestra fallback de liquidaciones reales de Binance `forceOrder`.
- Tokens desktop deben pasar a secure storage de Tauri/Windows en una fase de hardening.

## 2. Estructura Objetivo

```txt
apps/
  api/             # Fastify REST + WSS + servicios backend nuevos
  journal-web/     # Next.js journal actual, migrado desde la raiz
  trading-app/     # Tauri Windows, hoy vive en apps/desktop
  finanzas-web/    # Dashboard financiero futuro
packages/
  db/              # Prisma schema/client
  shared/          # Tipos, DTOs, eventos, Zod schemas
  broker/          # BrokerAdapter + adapters
  market-data/     # CVD, footprint, liquidity providers
infra/
  docker/
  workflows/
  scripts/
```

Estado actual de implementacion:

- Ya existe `apps/desktop` con Tauri 2 + React + TypeScript.
- Ya existe login Google con retorno `trading-journal://`.
- Ya se inicio la base monorepo con `pnpm-workspace.yaml` y `turbo.json`.
- Ya se inicio `apps/api` con Fastify, endpoints base y WebSocket.
- Ya se iniciaron `packages/shared`, `packages/db`, `packages/broker` y `packages/market-data`.
- Aun no se ha movido Next a `apps/journal-web`.
- Aun no se ha movido `apps/desktop` a `apps/trading-app`.

## 3. Flujo de Trabajo PC + VM

La app Windows real debe ejecutarse desde tu PC, no desde la VM.

Si corres Tauri en la VM:

- Compila para Linux.
- No valida WebView2.
- No valida deep links Windows.
- No valida secure storage Windows.
- No reproduce el comportamiento real de ventana.

Flujo recomendado:

```bash
pnpm dev:trading
```

Ese comando debe correrse en Windows cuando el repo este clonado localmente.

La VM queda para:

- Postgres.
- Docker.
- Backend/API.
- Journal web.
- Deploy.

GitHub Actions queda solo para builds instalables finales. Para iterar UI no hace falta esperar artifacts.

Cuando Codex cambie backend y desktop:

- Backend se modifica/despliega en VM.
- Desktop se modifica en repo.
- Tu PC hace `git pull`.
- `pnpm dev:trading` recarga rapido.

## 4. Fase 0 - Monorepo

Objetivo: ordenar el proyecto sin romper produccion.

Pasos:

1. Mantener la app actual funcionando.
2. Agregar `pnpm` workspaces y Turborepo.
3. Crear paquetes base.
4. Crear `apps/api`.
5. Migrar Tauri de `apps/desktop` a `apps/trading-app`.
6. Migrar Next de raiz a `apps/journal-web`.
7. Actualizar Docker y GitHub Actions.

Scripts objetivo:

```bash
pnpm dev:api
pnpm dev:journal
pnpm dev:trading
pnpm dev:finanzas
pnpm build
pnpm typecheck
pnpm db:pull
pnpm db:generate
pnpm db:migrate
```

Regla: no mover el journal web completo hasta que `apps/api` y los paquetes base esten estables.

## 5. Fase 1 - Backend, Prisma y Tracking

Objetivo: registrar cada decision importante del trade.

Tablas nuevas:

- `sltp_moves`: cada movimiento de SL/TP.
- `chart_snapshots`: capturas del grafico en entry, exit, SL move, TP move o manual.
- `ai_analyses`: analisis Claude asociado al trade/snapshot.

Campos clave:

```ts
SLTPMove {
  tradeId
  createdAt
  moveType // SL | TP
  fromPrice
  toPrice
  reason
  priceAtMove
  movedTowardEntry
  rRatioAtMove
}

ChartSnapshot {
  tradeId
  sltpMoveId
  createdAt
  trigger // ENTRY | EXIT | SL_MOVE | TP_MOVE | MANUAL
  imageUrl
  timeframe
  indicators
}

AIAnalysis {
  tradeId
  snapshotId
  createdAt
  prompt
  response
  model
  context
  status // PENDING | DONE | ERROR
  error
}
```

Servicios backend:

- `BrokerService`: entrada unica para ordenes firmadas.
- `BinanceAdapter`: primera implementacion, usando API keys solo en VPS.
- `ManualAdapter`: registro manual para brokers sin API.
- `SnapshotService`: recibe imagen, guarda archivo, crea snapshot y emite evento.
- `AIService`: llama Claude con contexto + snapshot.
- `DesktopEventService`: WSS autenticado para Tauri.

Endpoints v1:

```txt
POST /v1/trades/:tradeId/sltp-moves
GET  /v1/trades/:tradeId/sltp-moves
POST /v1/trades/:tradeId/snapshots
GET  /v1/trades/:tradeId/snapshots
POST /v1/trades/:tradeId/ai-analysis
GET  /v1/trades/:tradeId/ai-analysis
GET  /v1/desktop/cockpit
GET  /v1/desktop/session
WS   /v1/desktop/events
```

Eventos WSS:

```txt
snapshot.capture.requested
snapshot.created
sltp.move.recorded
ai.analysis.ready
trade.updated
order.updated
risk.updated
```

## 6. Fase 2 - Trading App Windows

Objetivo: que Windows sea el cockpit real de trading.

Flujo de datos:

- Market data publico: Tauri Rust -> Binance WS publico.
- Ordenes privadas: Tauri/React -> VPS -> Binance REST firmado.
- Journal/snapshots/AI: Tauri/React -> VPS REST/WSS.
- DB: solo VPS/Postgres.

Componentes principales:

- `CandleChart`: velas en tiempo real con Lightweight Charts.
- `FootprintChart`: canvas/overlay sincronizado con velas.
- `CVDPanel`: CVD desde `aggTrades`.
- `LiquidationPanel`: Coinglass si hay API key; fallback Binance `forceOrder`.
- `OrderPanel`: entry, SL, TP, risk y confirmacion.
- `JournalSidebar`: historial, snapshots, notas.
- `AIAnalysisPanel`: respuesta Claude del trade actual.
- `RiskHeader`: balance, max risk, disciplina, bloqueo.
- `CommandPalette`: acciones rapidas.

Market data Rust:

```txt
subscribe_market_data
unsubscribe_market_data
set_symbols
set_timeframe
```

Eventos Tauri:

```txt
market:candle
market:aggTrade
market:cvd
market:footprint
market:liquidation
```

Footprint:

- Agrupar trades por candle.
- Bucket por precio.
- Calcular bid volume, ask volume, total volume, delta e imbalance.
- Render inicial con canvas sincronizado con Lightweight Charts.

CVD:

- Usar `aggTrades`.
- Inferir agresor con `buyerMaker`.
- Acumular delta por simbolo/timeframe.

Liquidations:

- Coinglass real si existe `COINGLASS_API_KEY`.
- Fallback: eventos reales de liquidacion de Binance `forceOrder`.
- La UI debe mostrar la fuente claramente.

## 7. Fase 3 - Finanzas Web

Crear `apps/finanzas-web` cuando trading desktop este estable.

Modelos:

- `FinancialAccount`
- `AccountSnapshot`

Features:

- Net worth timeline.
- Cuentas bancarias, creditos, Binance, inversiones.
- Estado de creditos y cuotas.
- PnL trading reflejado en cuenta Binance.
- Claude SQL Assistant en modo read-only por defecto.

## 8. Broker Adapter

Interface objetivo:

```ts
interface BrokerAdapter {
  getPrice(symbol: string): Promise<number>
  getCandles(symbol: string, tf: string, limit: number): Promise<Candle[]>
  placeOrder(order: OrderInput): Promise<Order>
  modifyOrder(orderId: string, updates: Partial<OrderInput>): Promise<Order>
  cancelOrder(orderId: string): Promise<void>
  getBalance(): Promise<Balance>
  getOpenPositions(): Promise<Position[]>
}
```

Adapters:

- `BinanceAdapter`: crypto futures.
- `ManualAdapter`: brokers sin API.
- `IBKRAdapter`: futuro para CME/acciones via Client Portal Gateway.

Regla de seguridad: ningun adapter con REST privado corre en desktop.

## 9. Orden de Ejecucion

1. Revocar PAT expuesto y limpiar `.env`.
2. Completar Fase 0A: monorepo base.
3. Completar Fase 0B: mover Tauri a `apps/trading-app`.
4. Completar Fase 0C: mover Next a `apps/journal-web`.
5. Completar Fase 1A: `prisma db pull`.
6. Completar Fase 1B: aplicar migracion tracking.
7. Completar Fase 1C: desplegar `apps/api`.
8. Redisenar shell desktop.
9. Integrar CandleChart + CVD.
10. Integrar FootprintChart.
11. Integrar OrderPanel + BrokerService.
12. Integrar snapshots automaticos.
13. Integrar AIAnalysisPanel.
14. Integrar liquidation provider.
15. Crear `apps/finanzas-web`.

## 10. Test Plan

Monorepo:

- `pnpm install`
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev:api`
- `pnpm dev:journal`
- `pnpm dev:trading` en Windows.

Backend:

- `/health` responde OK.
- Endpoints `/v1/trades/:tradeId/sltp-moves` requieren JWT desktop.
- Crear SLTPMove funciona.
- Crear ChartSnapshot funciona.
- Crear AIAnalysis funciona.
- WSS `/v1/desktop/events` rechaza sin token.
- WSS emite eventos al crear SLTPMove/snapshot/analysis.

Desktop:

- Login Google sigue funcionando.
- App carga cockpit desde backend.
- Binance API keys no aparecen en bundle desktop.
- CandleChart recibe velas.
- CVD cambia con `aggTrades`.
- Footprint agrupa por candle/precio.
- OrderPanel nunca envia orden sin confirmacion.
- LiquidationPanel muestra fuente de datos.

## 11. Notas de Seguridad

- El PAT expuesto debe revocarse.
- No guardar PAT en `.env`.
- No enviar API keys Binance al cliente.
- Desktop solo puede tener JWT de journal.
- WSS debe autenticar.
- AI SQL assistant financiero debe iniciar como read-only.

