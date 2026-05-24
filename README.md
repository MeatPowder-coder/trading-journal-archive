# Trading Journal System (Archived)

[Español](#español) | [English](#english)

## Español

### Descripción

Sistema full-stack para registro, análisis y operación de ejecuciones de trading, con cliente web, cliente desktop, backend complementario, integración de datos en tiempo real y automatizaciones operativas.

### Alcance funcional

- Registro y gestión de trades (`OPEN`/`CLOSED`, estrategia, métricas de riesgo, notas).
- Cálculo y visualización de PnL en tiempo real (fuentes Yahoo/Binance según broker).
- Flujo de órdenes y protección (SL/TP, limit orders pendientes, controles disciplinarios).
- Chat asistido por IA con contexto operativo y almacenamiento de sesiones/mensajes.
- Alertas críticas con deduplicación, cooldown y fallback.
- Paridad funcional web/desktop con rutas y contratos compartidos.

### Arquitectura

- Monorepo:
  - `src/`: aplicación web principal (`Next.js`, UI, API routes, auth, chat, reglas de negocio).
  - `apps/desktop`: cliente desktop (`Tauri + React + Vite`).
  - `apps/api`: API Fastify para endpoints unificados y eventos desktop.
  - `packages/journal-ui`: componentes reutilizables.
  - `packages/journal-data`: contratos de navegación/paridad.
  - `packages/shared`: tipos y utilidades de dominio.
  - `migrations/`: evolución SQL por fases.
- Datos:
  - PostgreSQL como fuente principal.
  - Hasura para capa GraphQL y tiempo real.
- Integraciones:
  - Binance (órdenes/eventos).
  - Yahoo Finance (precios de mercado).
  - Proveedores LLM para asistencia IA.

### Modelo de datos (resumen)

- Trading:
  - `trades_activos`
  - `pending_limit_orders`
  - `pending_limit_order_events`
  - `trading_sessions`
  - `account_snapshots`
  - `sl_movements`, `sltp_moves`, `trade_metric_snapshots`, `chart_snapshots`, `ai_analyses`
- Chat y memoria:
  - `react_chat_sessions`
  - `react_chat_messages`
  - `user_memories`
- Alerting:
  - `alert_trade_state`
  - `alert_notification_events`
  - `alert_runtime_config`

### Operación local

1. Instalar dependencias:

```bash
pnpm install
```

2. Configurar entorno:

```bash
cp .env.example .env.local
```

3. Ejecutar web:

```bash
pnpm dev
```

4. (Opcional) backend desktop + app desktop:

```bash
pnpm dev:desktop:backend
pnpm dev:trading
```

### Variables de entorno clave

- Core/API:
  - `DATABASE_URL`
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
  - `DESKTOP_AUTH_SECRET`
- GraphQL/Hasura:
  - `NEXT_PUBLIC_HASURA_HTTP_URL`
  - `NEXT_PUBLIC_HASURA_WS_URL`
  - `NEXT_PUBLIC_HASURA_ADMIN_SECRET`
  - `HASURA_HTTP_URL`
  - `HASURA_ADMIN_SECRET`
- Integraciones de mercado:
  - `BINANCE_API_KEY`
  - `BINANCE_API_SECRET`
  - `BINANCE_FUTURES_API_KEY`
  - `BINANCE_FUTURES_API_SECRET`
- IA:
  - `OPENAI_API_KEY`
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `NVIDIA_API_BASE_URL`
  - `NVIDIA_API_KEY`
  - `KIMI_MODEL_ID`
- Alertas:
  - `ALERTS_INTERNAL_TOKEN`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
  - `N8N_FALLBACK_WEBHOOK_URL`

### CI/CD y build

- Workflow de build desktop para Windows en `.github/workflows/desktop-windows-build.yml`.
- Build local desktop:

```bash
npm --prefix apps/desktop run tauri:build
```

### Estado y transición

- Estado de mantenimiento: `Archived` (sin desarrollo activo de nuevas features en este repositorio).
- Continuidad funcional en dominio financiero/contable:
  - `https://github.com/MeatPowder-coder/finance-system`
- Notas de saneamiento y publicación:
  - [`ARCHIVE_PUBLICATION.md`](ARCHIVE_PUBLICATION.md)

---

## English

### Description

Full-stack system for logging, analyzing, and operating trading executions, including web and desktop clients, a complementary backend, real-time data integration, and operational automation.

### Functional scope

- Trade lifecycle management (`OPEN`/`CLOSED`, strategy fields, risk metrics, notes).
- Real-time PnL calculation and visualization (Yahoo/Binance by broker).
- Order/protection flows (SL/TP, pending limit orders, discipline controls).
- AI-assisted chat with operational context plus persisted sessions/messages.
- Critical alerting with deduplication, cooldown, and fallback channels.
- Web/desktop parity through shared routes and contracts.

### Architecture

- Monorepo layout:
  - `src/`: main web app (`Next.js`, UI, API routes, auth, chat, domain logic).
  - `apps/desktop`: desktop client (`Tauri + React + Vite`).
  - `apps/api`: Fastify API for unified endpoints and desktop events.
  - `packages/journal-ui`: reusable UI components.
  - `packages/journal-data`: navigation/parity contracts.
  - `packages/shared`: domain types/utilities.
  - `migrations/`: phased SQL evolution.
- Data platform:
  - PostgreSQL as primary store.
  - Hasura for GraphQL and real-time subscriptions.
- Integrations:
  - Binance (order/event workflows).
  - Yahoo Finance (market pricing).
  - LLM providers for AI assistant features.

### Data model (high level)

- Trading domain:
  - `trades_activos`
  - `pending_limit_orders`
  - `pending_limit_order_events`
  - `trading_sessions`
  - `account_snapshots`
  - `sl_movements`, `sltp_moves`, `trade_metric_snapshots`, `chart_snapshots`, `ai_analyses`
- Chat and memory:
  - `react_chat_sessions`
  - `react_chat_messages`
  - `user_memories`
- Alerting:
  - `alert_trade_state`
  - `alert_notification_events`
  - `alert_runtime_config`

### Local run

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

3. Start web:

```bash
pnpm dev
```

4. (Optional) desktop backend + desktop app:

```bash
pnpm dev:desktop:backend
pnpm dev:trading
```

### CI/CD and build

- Windows desktop build workflow:
  - `.github/workflows/desktop-windows-build.yml`
- Local desktop build:

```bash
npm --prefix apps/desktop run tauri:build
```

### Status and transition

- Maintenance status: `Archived` (no active feature development in this repository).
- Ongoing work in finance/accounting domain:
  - `https://github.com/MeatPowder-coder/finance-system`
- Sanitization/publication notes:
  - [`ARCHIVE_PUBLICATION.md`](ARCHIVE_PUBLICATION.md)
