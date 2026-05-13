# Trading Journal — Plan de Mejora Completo v2
> Para implementar con Claude Code / VS Code AI  
> Stack: React + Node.js + Hasura + Postgres + Binance WebSocket + Telegram Bot  
> Actualizado: Abril 2026

---

## Parte 1 — Propósito del journal a largo plazo

Resolver el problema del SL es solo la Fase 1. El journal es un dataset personal que responde preguntas que ninguna herramienta externa puede responder sobre ti:

| Fase | Pregunta que el journal responde | Requiere |
|---|---|---|
| 1 (ahora) | ¿Estoy respetando mis reglas? | Disciplina básica, SL tracking |
| 2 | ¿Qué setups me funcionan realmente? | R:R real vs. estimado, MAE/MFE |
| 3 | ¿Cuándo rindo mejor? | Correlación hora/día + estado mental |
| 4 | ¿En qué condición de mercado soy rentable? | Contexto mercado + resultados |
| 5 | ¿Cuál es mi edge real? | 200+ trades con datos completos |

Cuando tengas 6 meses de datos bien registrados, podrás responder: "Mis trades SHORT en contexto bajista, entre las 9am y 12pm, con CVD negativo y absorción detectada, tienen un win rate de X% y R:R promedio de Y." Eso es un edge. Ahora mismo no tienes suficientes datos limpios para saberlo.

---

## Parte 2 — Reglas del journal (versión expandida)

Estas 11 reglas se muestran en la pantalla pre-trade. El usuario debe confirmar cada una antes de poder registrar un trade nuevo.

```
REGLA 1: No operes cuando estés enojado, emocionalmente afectado, cansado o distraído.
         → El journal pregunta tu estado mental al inicio de cada sesión.

REGLA 2: Nunca arriesgues más del 2% de tu cuenta por trade.
         → Con $10: máximo $0.20 en riesgo. Con $100: máximo $2.
         → El sistema calcula esto automáticamente según tu capital registrado.
         → NOTA: Con capital < $50 esta regla es orientativa, no bloqueante,
           porque los montos mínimos de Binance la hacen impracticable.

REGLA 3: El Stop Loss es obligatorio ANTES de ejecutar. Nunca se mueve
         para aumentar el riesgo. Solo se mueve para reducirlo o hacer breakeven.

REGLA 4: Si el mercado está lateral, sin estructura clara o en rango sin dirección,
         no operes. El mercado siempre vuelve.

REGLA 5: No hagas revenge trading. Si perdiste 2 trades consecutivos hoy,
         para. El journal bloqueará un tercer trade el mismo día si detecta
         2 pérdidas seguidas (con opción de override con confirmación explícita).

REGLA 6: El trading es 80% esperar, 20% ejecutar. Un setup mediocre
         que ejecutaste es peor que un setup excelente que esperaste.

REGLA 7: No promedies en contra. Si el trade va en tu contra y quieres
         "comprar más barato", cierra la posición, analiza de nuevo,
         y reentra solo si el setup sigue siendo válido.

REGLA 8: Registra SIEMPRE: win rate, R:R estimado, R:R real (lo calcula
         el sistema), y duración del trade. Sin datos no hay mejora.

REGLA 9: Define tu tesis en texto antes de ejecutar. Si no puedes explicar
         en una oración por qué entras, no entres.

REGLA 10: El Take Profit se define antes de entrar. Solo puede moverse
          hacia arriba, nunca hacia abajo.

REGLA 11: Después de cada trade con pérdida > $3, escribe al menos
          una línea de lección aprendida antes de abrir el siguiente trade.
```

---

## Parte 3 — Detección automática vía Binance WebSocket (Node.js)

### 3.1 Detección de movimiento de SL

**Cómo funciona Binance:**  
Cuando el usuario modifica una orden stop en Binance, el userData WebSocket emite un evento `ORDER_TRADE_UPDATE` con `orderType: "STOP_MARKET"` y el nuevo `stopPrice`. Node.js puede capturar esto, compararlo con el SL original guardado en Postgres, y registrar automáticamente si el movimiento fue a favor o en contra del trader.

```javascript
// En tu servicio de Node.js (websocket handler existente)
// Agregar dentro del handler de mensajes del userData stream:

async function handleOrderUpdate(data) {
  if (data.e !== 'ORDER_TRADE_UPDATE') return;
  if (data.o.ot !== 'STOP_MARKET' && data.o.ot !== 'STOP') return;
  if (data.o.X !== 'NEW' && data.o.X !== 'PARTIALLY_FILLED') return;
  // Solo nos interesan modificaciones, no la orden original

  const symbol = data.o.s;           // ej: "ETHUSDT"
  const newStopPrice = parseFloat(data.o.sp);
  const clientOrderId = data.o.c;

  // Buscar el trade abierto asociado a este símbolo en Postgres
  const trade = await db.query(
    'SELECT * FROM trades WHERE symbol = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
    [symbol, 'OPEN']
  );

  if (!trade.rows.length) return;

  const activeTrade = trade.rows[0];
  const originalSL = parseFloat(activeTrade.stop_loss);
  const entryPrice = parseFloat(activeTrade.entry_price);
  const direction = activeTrade.direction; // 'LONG' o 'SHORT'

  // Determinar si el movimiento aumentó o redujo el riesgo
  let slMoveDirection;
  let riskIncreased;

  if (direction === 'LONG') {
    // En LONG: SL más bajo = más riesgo, SL más alto = menos riesgo
    riskIncreased = newStopPrice < originalSL;
    if (newStopPrice < originalSL) slMoveDirection = 'risk_increase';
    else if (newStopPrice >= entryPrice) slMoveDirection = 'breakeven';
    else slMoveDirection = 'risk_reduction';
  } else {
    // En SHORT: SL más alto = más riesgo, SL más bajo = menos riesgo
    riskIncreased = newStopPrice > originalSL;
    if (newStopPrice > originalSL) slMoveDirection = 'risk_increase';
    else if (newStopPrice <= entryPrice) slMoveDirection = 'breakeven';
    else slMoveDirection = 'risk_reduction';
  }

  // Registrar en Postgres
  await db.query(`
    UPDATE trades SET
      sl_was_moved = true,
      sl_move_direction = $1,
      sl_move_count = COALESCE(sl_move_count, 0) + 1,
      sl_original = CASE WHEN sl_original IS NULL THEN stop_loss ELSE sl_original END,
      stop_loss = $2,
      updated_at = NOW()
    WHERE id = $3
  `, [slMoveDirection, newStopPrice, activeTrade.id]);

  // Registrar en tabla de historial de movimientos
  await db.query(`
    INSERT INTO sl_movements (trade_id, original_sl, new_sl, direction, moved_at)
    VALUES ($1, $2, $3, $4, NOW())
  `, [activeTrade.id, originalSL, newStopPrice, slMoveDirection]);

  // Notificar por Telegram si el movimiento aumentó el riesgo
  if (riskIncreased) {
    await telegramBot.sendMessage(
      TELEGRAM_CHAT_ID,
      `⚠️ ALERTA: Moviste el SL de ${originalSL} a ${newStopPrice} en ${symbol}.\n` +
      `Esto AUMENTA tu riesgo. Recuerda la Regla #3.`
    );
  }
}
```

---

### 3.2 Tracking de MAE y MFE (Maximum Adverse/Favorable Excursion)

**Qué es:**
- **MAE (Maximum Adverse Excursion):** El precio más desfavorable que alcanzó el trade durante su vida. Sirve para evaluar si tu SL estaba bien ubicado.
- **MFE (Maximum Favorable Excursion):** El precio más favorable alcanzado. Sirve para evaluar si tu TP estaba bien ubicado o si cerraste demasiado pronto.

**Por qué importa:**  
Si tu MFE fue $2450 pero cerraste en $2420, dejaste $30 de recorrido sobre la mesa. Si tu MAE nunca tocó el SL pero lo moviste de todas formas, el SL original era válido. Estos datos hacen que el journal sea un espejo de tus decisiones reales.

```javascript
// Agregar al handler del stream de precios (markPrice o aggTrade)
// Este ya debe existir en tu código para el PnL en tiempo real

const tradeExtremes = new Map(); // tradeId -> { mae, mfe }

async function trackPriceExtremes(symbol, currentPrice) {
  // Obtener todos los trades abiertos para este símbolo
  const openTrades = await db.query(
    'SELECT id, entry_price, direction FROM trades WHERE symbol = $1 AND status = $2',
    [symbol, 'OPEN']
  );

  for (const trade of openTrades.rows) {
    const tradeId = trade.id;
    const entryPrice = parseFloat(trade.entry_price);
    const direction = trade.direction;

    if (!tradeExtremes.has(tradeId)) {
      tradeExtremes.set(tradeId, { mae: currentPrice, mfe: currentPrice });
    }

    const extremes = tradeExtremes.get(tradeId);

    if (direction === 'LONG') {
      extremes.mae = Math.min(extremes.mae, currentPrice); // peor precio = mínimo
      extremes.mfe = Math.max(extremes.mfe, currentPrice); // mejor precio = máximo
    } else {
      extremes.mae = Math.max(extremes.mae, currentPrice); // peor precio = máximo
      extremes.mfe = Math.min(extremes.mfe, currentPrice); // mejor precio = mínimo
    }

    tradeExtremes.set(tradeId, extremes);
  }
}

// Al cerrar un trade, guardar los extremos en Postgres
async function onTradeClosed(tradeId) {
  const extremes = tradeExtremes.get(tradeId);
  if (!extremes) return;

  await db.query(`
    UPDATE trades SET
      max_adverse_excursion = $1,
      max_favorable_excursion = $2
    WHERE id = $3
  `, [extremes.mae, extremes.mfe, tradeId]);

  tradeExtremes.delete(tradeId);
}
```

---

### 3.3 R:R real calculado automáticamente

Con MAE/MFE disponibles, Node.js puede calcular el R:R real y compararlo con el estimado:

```javascript
// Al cerrar un trade, calcular métricas derivadas
async function calculateTradeMetrics(tradeId) {
  const trade = await db.query('SELECT * FROM trades WHERE id = $1', [tradeId]);
  const t = trade.rows[0];

  const entry = parseFloat(t.entry_price);
  const exit = parseFloat(t.exit_price);
  const sl = parseFloat(t.sl_original || t.stop_loss);
  const tp = parseFloat(t.take_profit);
  const mfe = parseFloat(t.max_favorable_excursion);
  const mae = parseFloat(t.max_adverse_excursion);

  const riskPerUnit = Math.abs(entry - sl);
  const estimatedRewardPerUnit = tp ? Math.abs(tp - entry) : null;
  const realRewardPerUnit = Math.abs(exit - entry);
  const maxPossibleRewardPerUnit = Math.abs(mfe - entry);

  const rrEstimated = estimatedRewardPerUnit ? estimatedRewardPerUnit / riskPerUnit : null;
  const rrActual = realRewardPerUnit / riskPerUnit;
  const rrMaxPossible = maxPossibleRewardPerUnit / riskPerUnit;

  // rrMaxPossible es el R:R que PODRÍAS haber capturado si el TP estaba en el MFE
  // Si rrActual << rrMaxPossible, cerraste demasiado pronto
  // Si rrEstimated > rrActual, el precio nunca llegó a tu TP

  await db.query(`
    UPDATE trades SET
      rr_estimated = $1,
      rr_actual = $2,
      rr_max_possible = $3
    WHERE id = $4
  `, [rrEstimated, rrActual, rrMaxPossible, tradeId]);
}
```

---

## Parte 4 — Campos nuevos en base de datos

```sql
-- En tabla trades (agregar):
ALTER TABLE trades ADD COLUMN checklist_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN checklist_timestamp TIMESTAMP;
ALTER TABLE trades ADD COLUMN entry_tesis TEXT;            -- Tesis de entrada obligatoria
ALTER TABLE trades ADD COLUMN sl_original DECIMAL(18,8);  -- SL en el momento de apertura (nunca se modifica)
ALTER TABLE trades ADD COLUMN sl_was_moved BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN sl_move_direction VARCHAR(20);
  -- valores: 'not_moved' | 'risk_increase' | 'risk_reduction' | 'breakeven'
ALTER TABLE trades ADD COLUMN sl_move_count INTEGER DEFAULT 0;
ALTER TABLE trades ADD COLUMN max_adverse_excursion DECIMAL(18,8);   -- MAE
ALTER TABLE trades ADD COLUMN max_favorable_excursion DECIMAL(18,8); -- MFE
ALTER TABLE trades ADD COLUMN rr_estimated DECIMAL(8,4);    -- R:R que planificaste
ALTER TABLE trades ADD COLUMN rr_actual DECIMAL(8,4);       -- R:R que capturaste
ALTER TABLE trades ADD COLUMN rr_max_possible DECIMAL(8,4); -- R:R máximo posible (MFE/riesgo)

-- Nueva tabla: historial de movimientos de SL
CREATE TABLE sl_movements (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER REFERENCES trades(id),
  original_sl DECIMAL(18,8),
  new_sl DECIMAL(18,8),
  direction VARCHAR(20),  -- 'risk_increase' | 'risk_reduction' | 'breakeven'
  moved_at TIMESTAMP DEFAULT NOW()
);

-- Nueva tabla: sesiones de trading
CREATE TABLE trading_sessions (
  id SERIAL PRIMARY KEY,
  session_date DATE UNIQUE,
  mental_state VARCHAR(20),   -- 'calm' | 'slightly_anxious' | 'stressed' | 'avoid'
  rules_confirmed BOOLEAN DEFAULT FALSE,
  session_start TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Nueva tabla: capital registrado (para calcular el 2% dinámicamente)
CREATE TABLE account_snapshots (
  id SERIAL PRIMARY KEY,
  recorded_at TIMESTAMP DEFAULT NOW(),
  balance_usdt DECIMAL(10,2),
  source VARCHAR(20)  -- 'manual' | 'binance_api'
);
```

---

## Parte 5 — Cambios en la UI de React

### 5.1 Pantalla pre-trade (nueva, obligatoria)

**Trigger:** Click en "Nueva Operación"  
**Comportamiento:** Modal que bloquea la creación del trade hasta completar

```
COMPONENTE: PreTradeGateway

Estado del componente:
- rulesChecked: boolean[11] (una por regla)
- mentalState: 'calm' | 'slightly_anxious' | 'stressed' | 'avoid' | null

Renderizado:
1. Título: "Antes de operar"
2. Pregunta de estado mental con 4 botones (solo si es la primera operación del día
   o si no hay sesión registrada hoy)
3. Si mental_state === 'stressed' o 'avoid':
   → Mostrar banner: "Tu estado mental no es óptimo para operar hoy.
     Puedes continuar, pero asegúrate de que no sea por impulso."
   → Botón de continuar igual (no bloquear, solo advertir)
4. Lista de 11 reglas, cada una con checkbox
5. Botón "Continuar al trade" habilitado solo cuando los 11 checkboxes están marcados
6. Los checkboxes NO se guardan entre aperturas — se reinician cada vez

Al confirmar: guardar en DB { checklist_confirmed: true, checklist_timestamp: now() }
```

---

### 5.2 Formulario de registro en dos fases

**Fase 1 — Al ABRIR el trade:**

Campos obligatorios (en orden de aparición):
1. Símbolo (default: ETHUSDT)
2. Dirección: LONG / SHORT (botones grandes)
3. Monto + Apalancamiento
4. Precio de entrada (pre-llenado desde Binance WebSocket, editable)
5. Stop Loss — **OBLIGATORIO** — con cálculo automático de pérdida potencial en USD
6. Take Profit — **OBLIGATORIO** — con cálculo automático de R:R estimado
7. Tesis de entrada — campo texto libre, mínimo 15 caracteres, placeholder: "¿Por qué entras a este trade?"

Validaciones en tiempo real:
```
- Al ingresar SL: mostrar "Riesgo: $X.XX (Y% de tu cuenta)"
  - Si > límite configurado: banner amarillo de advertencia
- Al ingresar TP: mostrar "R:R estimado: 1:X"
  - Si R:R < 1.5: banner amarillo "R:R menor a 1.5 — considera si el trade vale la pena"
- Tesis: contador de caracteres, se habilita "Registrar trade" solo con ≥ 15 chars
```

**Fase 2 — Al CERRAR el trade (si se cierra manualmente desde el journal):**

Campos (aparecen en modal al hacer click en "Cerrar trade"):
1. Precio de salida (pre-llenado desde Binance)
2. Notas de cierre — campo texto libre, mínimo 20 caracteres
3. Calificación del trade: 1–5 estrellas (¿qué tan bien ejecutaste tu plan?)
4. Si `sl_was_moved === true` (detectado automáticamente):
   → Mostrar: "Se detectó que moviste el SL durante este trade"
   → Campo obligatorio: "¿Qué pensabas cuando lo moviste?" (texto libre)

**Todo lo demás va en sección colapsada "Análisis detallado":**
- Contexto mercado, volatilidad, tipo de liquidez, estado delta, volumen, absorción
- Visible pero no obligatorio

---

### 5.3 Widget de monitoreo de trade abierto

Para cada trade con estado OPEN, agregar en la tarjeta del trade:

```
COMPONENTE: OpenTradeMonitor

Muestra (actualizado en tiempo real vía WebSocket):
┌─────────────────────────────────┐
│ ETHUSDT LONG 20x                │
│                                 │
│ TP:    $2480  (+$12.50 / +2.5R) │  ← verde
│ ────────────────────────────── │
│ PRECIO: $2419.36       PnL: -$0.41 │
│ ────────────────────────────── │
│ SL:    $2390  (-$29.00 / -2.9R) │  ← rojo
│                                 │
│ MAE actual: $2410.20            │  ← gris, actualizado live
│ MFE actual: $2425.80            │  ← gris, actualizado live
└─────────────────────────────────┘

NO tiene botón para mover el SL desde aquí.
El SL solo se mueve desde Binance — el journal solo lo detecta y registra.
```

---

### 5.4 Nuevas métricas en el Dashboard

Agregar sección "Análisis de disciplina" en el dashboard:

```
MÉTRICAS NUEVAS:

┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ SL RESPETADOS      │  │ R:R EFECTIVO REAL  │  │ EFICIENCIA MFE     │
│ 72%                │  │ 1.38               │  │ 43%                │
│ 8/11 trades        │  │ objetivo: ≥ 1.5    │  │ capturas el 43% del│
└────────────────────┘  └────────────────────┘  │ recorrido posible  │
                                                 └────────────────────┘

EFICIENCIA MFE = (rr_actual / rr_max_possible) × 100
→ Si es < 50%: estás cerrando trades demasiado pronto o con TP mal ubicado
→ Si es > 80%: tu gestión de TP es buena

┌──────────────────────────────────────────────┐
│ RENDIMIENTO POR ESTADO MENTAL                │
│                                              │
│ Tranquilo:         +$X.XX avg   (N trades)  │
│ Levemente ansioso: +$X.XX avg   (N trades)  │
│ Estresado:         -$X.XX avg   (N trades)  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ TRADES CON SL MOVIDO (RIESGO AUMENTADO)      │
│                                              │
│ PnL promedio trades SL respetado:   +$X.XX  │
│ PnL promedio trades SL movido:      -$X.XX  │
│                                              │
│ [Gráfico de barras comparativo]              │
└──────────────────────────────────────────────┘
```

---

### 5.5 Bloqueo automático por pérdidas consecutivas

```
LÓGICA EN BACKEND (Node.js):

Al registrar un trade cerrado:
1. Consultar los últimos 2 trades del día
2. Si ambos son pérdidas (pnl < 0):
   a. Registrar flag en trading_sessions: consecutive_losses_today = 2
   b. Enviar mensaje Telegram: 
      "🛑 Has perdido 2 trades seguidos hoy. 
       El journal bloqueará el siguiente trade por 30 minutos.
       Tómate un descanso."
   c. Guardar timestamp del bloqueo en DB

EN EL FRONTEND:
Al intentar abrir un nuevo trade, consultar si hay bloqueo activo.
Si sí: mostrar pantalla de espera con countdown.
Después del countdown: se puede continuar, pero con mensaje de confirmación extra.
```

---

## Parte 6 — Notificaciones Telegram (expandir las existentes)

Agregar al bot existente los siguientes mensajes (además de los de TP/SL que ya tienes):

```javascript
// Triggers nuevos para el bot de Telegram:

// 1. SL movido aumentando riesgo (ya incluido en Parte 3.1)
// "⚠️ Moviste el SL de X a Y en ETHUSDT. Esto AUMENTA tu riesgo. Regla #3."

// 2. Dos pérdidas consecutivas
// "🛑 2 pérdidas seguidas hoy ($X.XX en total). Pausa de 30 minutos activada."

// 3. Trade sin tesis registrada (si se detecta que el campo está corto)
// "📝 El trade #X no tiene tesis registrada. Agrégala antes de cerrar el trade."

// 4. R:R estimado < 1.5 al abrir
// "📊 Trade #X tiene R:R estimado de 0.8. ¿Estás seguro de este setup?"

// 5. Resumen diario (enviar a las 6pm o al cerrar la última posición del día)
const dailySummary = `
📅 Resumen del día:
Trades: X | Ganados: X | Perdidos: X
PnL: $X.XX
SL respetados: X/X
R:R promedio: X.X
Eficiencia MFE: X%

${slMovedBadly > 0 ? `⚠️ Moviste el SL para aumentar riesgo ${slMovedBadly} vez(es)` : '✅ Respetaste todos los SL hoy'}
`;
```

---

## Parte 7 — Hoja de ruta de implementación

### Fase 1 — Inmediata (impacto máximo)
- [ ] Detección automática de SL movido vía WebSocket `ORDER_TRADE_UPDATE`
- [ ] Campos en DB: `sl_original`, `sl_was_moved`, `sl_move_direction`, `sl_move_count`, `sl_movements` tabla
- [ ] Stop Loss obligatorio al crear trade (cambiar validación)
- [ ] Campo "Tesis de entrada" obligatorio (mínimo 15 chars)
- [ ] Take Profit obligatorio al crear trade
- [ ] Pantalla pre-trade con las 11 reglas y checkboxes
- [ ] Alerta Telegram cuando se mueve SL aumentando riesgo

### Fase 2 — Corto plazo (2–3 semanas)
- [ ] Tracking de MAE/MFE vía WebSocket de precio
- [ ] Cálculo automático de R:R estimado, real y máximo posible al cerrar
- [ ] Bloqueo de 30 minutos tras 2 pérdidas consecutivas + Telegram
- [ ] Ritual de inicio de sesión diario con estado mental
- [ ] Métricas nuevas en dashboard: SL respetados %, R:R efectivo, eficiencia MFE
- [ ] Sección colapsable "Análisis detallado" para campos opcionales
- [ ] Resumen diario automático por Telegram

### Fase 3 — Mediano plazo (1–2 meses)
- [ ] Widget OpenTradeMonitor con precio live, SL, TP, MAE/MFE en tiempo real
- [ ] Gráfica de rendimiento por estado mental
- [ ] Análisis de rendimiento por hora del día (¿a qué hora rindes mejor?)
- [ ] Análisis de rendimiento por contexto de mercado (alcista/bajista/lateral)
- [ ] Vista "Mis setups": filtrar por setup/zona y ver estadísticas agrupadas
- [ ] Exportación de datos a CSV para análisis externo

### Fase 4 — Largo plazo (3–6 meses, cuando tengas datos suficientes)
- [ ] Identificación de tu edge real: los setups con mejor expectativa estadística
- [ ] Correlación estado mental → resultado (¿operar ansioso te cuesta dinero?)
- [ ] MAE analysis: ¿tus SL están bien ubicados o demasiado cerca?
- [ ] MFE analysis: ¿estás dejando dinero sobre la mesa por TP conservador?

---

## Parte 8 — Nota sobre el 2% de riesgo por trade

Con capital < $50, la regla del 2% da montos tan pequeños que Binance no los acepta (límite mínimo de orden). Implementar así:

```javascript
// En el backend, al calcular el riesgo máximo por trade:
function getMaxRiskAmount(accountBalance) {
  const twoPercent = accountBalance * 0.02;
  const binanceMinimum = 5; // USDT, límite aproximado de Binance Futures

  if (twoPercent < binanceMinimum) {
    // Capital muy pequeño: mostrar advertencia pero no bloquear
    return {
      amount: twoPercent,
      warning: `Con $${accountBalance} de capital, el 2% es $${twoPercent.toFixed(2)}.
                Binance requiere mínimo ~$5 por orden.
                La regla del 2% aplica cuando tu cuenta supere $250.`,
      blocking: false
    };
  }

  return { amount: twoPercent, warning: null, blocking: true };
}
```

---

*Prioridad absoluta para esta semana: Fase 1, items 1–4. La detección automática del SL es el cambio más valioso que puedes hacer porque no depende de tu disciplina para registrar — funciona aunque no abras el journal.*
