# Trading Journal (Portfolio Archive)

[Español](#español) | [English](#english)

## Español

Repositorio de portafolio que muestra un sistema full-stack de journaling de trading con versión web + desktop, integración en tiempo real y automatización operativa.

### Por qué importa este proyecto

Este proyecto fue mi implementación más completa de sistemas aplicada a un caso real:

- Producto web y desktop con base de código compartida.
- Integración de datos en tiempo real (WebSocket).
- Backend API y procesos asíncronos.
- Diseño de esquema SQL y migraciones incrementales.
- Autenticación, observabilidad operativa y automatizaciones.

### Highlights técnicos

- Monorepo con `apps/*` y `packages/*`.
- Frontend web en `Next.js` y desktop en `Tauri + React + Vite`.
- API dedicada en `Fastify` para rutas desktop/unificadas.
- PostgreSQL + Hasura para modelo de datos y tiempo real.
- Capa de IA para asistencia contextual (chat + herramientas de dominio).
- Motor de alertas críticas con deduplicación y fallback.
- Pipeline de build desktop en GitHub Actions.

### Arquitectura (resumen)

- `src/`: app web principal (UI, API routes, auth, chat, reglas de negocio).
- `apps/desktop`: cliente desktop y shell nativo.
- `apps/api`: backend complementario para desktop/eventos.
- `packages/journal-ui`: componentes reutilizables.
- `packages/journal-data`: contratos de navegación/tabs/parity.
- `migrations/`: evolución de esquema SQL por fases.

### Qué demuestra en entrevistas

- Diseño de arquitectura modular en un proyecto que evolucionó de MVP a sistema complejo.
- Capacidad de integrar múltiples runtimes (web, API node, desktop nativo).
- Toma de decisiones de producto/ingeniería bajo restricciones reales.
- Mantenimiento incremental: migraciones, hardening, fallback paths y operación en VM.

### Estado del repositorio

- `ARCHIVED`: se conserva como evidencia técnica de portafolio.
- No se recomienda uso productivo tal cual.
- Secretos y artefactos sensibles fueron removidos del contenido público.

Detalles de publicación segura: [`ARCHIVE_PUBLICATION.md`](ARCHIVE_PUBLICATION.md)

### Demo local rápida

1. Instalar dependencias:

```bash
pnpm install
```

2. Configurar variables:

```bash
cp .env.example .env.local
```

3. Levantar web:

```bash
pnpm dev
```

4. (Opcional) API desktop + app desktop:

```bash
pnpm dev:desktop:backend
pnpm dev:trading
```

### Stack principal

- TypeScript
- Next.js
- React
- Fastify
- PostgreSQL
- Hasura
- Tauri
- GitHub Actions

### Nota de transición

Este repo queda como archivo histórico. El trabajo nuevo enfocado en finanzas/contabilidad continúa en:

- `https://github.com/MeatPowder-coder/finance-system`

---

## English

Portfolio repository showcasing a full-stack trading journal system with web + desktop apps, real-time data flows, and operational automation.

### Why this project matters

This was my most complete systems implementation for a real-world use case:

- Web and desktop product with shared code.
- Real-time market/data integration (WebSocket).
- Dedicated backend APIs and async processes.
- SQL schema design with incremental migrations.
- Authentication, observability, and operational automations.

### Technical highlights

- Monorepo structure with `apps/*` and `packages/*`.
- Web frontend built with `Next.js`; desktop built with `Tauri + React + Vite`.
- Dedicated `Fastify` API for desktop/unified routes.
- `PostgreSQL + Hasura` for data model and real-time access.
- AI assistant layer with domain tools.
- Critical alerts engine with deduplication and fallback flows.
- Desktop CI build pipeline in GitHub Actions.

### Architecture (high level)

- `src/`: main web app (UI, API routes, auth, chat, business rules).
- `apps/desktop`: desktop client and native shell.
- `apps/api`: complementary backend for desktop/events.
- `packages/journal-ui`: reusable UI components.
- `packages/journal-data`: shared navigation/tabs contracts.
- `migrations/`: SQL schema evolution by phase.

### Interview relevance

- Modular architecture design evolving from MVP to complex system.
- Multi-runtime integration (web, Node API, native desktop).
- Product/engineering decision-making under real constraints.
- Incremental maintenance: migrations, hardening, fallback paths, VM operations.

### Repository status

- `ARCHIVED`: kept as a technical portfolio artifact.
- Not recommended for production use as-is.
- Sensitive artifacts and secrets were removed from public history/content.

Secure publication notes: [`ARCHIVE_PUBLICATION.md`](ARCHIVE_PUBLICATION.md)

### Quick local demo

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

3. Run web app:

```bash
pnpm dev
```

4. (Optional) desktop backend + desktop app:

```bash
pnpm dev:desktop:backend
pnpm dev:trading
```
