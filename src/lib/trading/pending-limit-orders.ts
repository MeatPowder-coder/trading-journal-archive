import { query } from '@/lib/db';
import {
  asFiniteNumber,
  BinanceFuturesError,
  futuresSignedRequest,
  getSymbolRules,
  placeEntryOrder,
  roundToTick,
} from '@/lib/trading/binance-futures';
import { classifySlMovement } from '@/lib/trading/discipline';

export type PendingOrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'REJECTED';

type Direction = 'LONG' | 'SHORT';

const ACTIVE_PENDING_STATUSES: PendingOrderStatus[] = ['NEW', 'PARTIALLY_FILLED'];

export class PendingLimitOrderError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, options?: { status?: number; code?: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'PendingLimitOrderError';
    this.status = options?.status || 400;
    this.code = options?.code || 'PENDING_LIMIT_ORDER_ERROR';
    this.details = options?.details;
  }
}

function normalizeDirection(direction: unknown): Direction {
  return String(direction || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
}

function normalizeStatus(status: unknown): PendingOrderStatus {
  const s = String(status || '').toUpperCase();
  if (s === 'PARTIALLY_FILLED') return 'PARTIALLY_FILLED';
  if (s === 'FILLED') return 'FILLED';
  if (s === 'CANCELED') return 'CANCELED';
  if (s === 'EXPIRED') return 'EXPIRED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'NEW';
}

function sanitizeSource(value: unknown, fallback = 'UI') {
  const source = String(value || fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  return source || fallback;
}

function assertDirectionalLevels(params: {
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number | null;
}) {
  const { direction, entryPrice, stopLoss, takeProfit = null } = params;
  if (!(entryPrice > 0) || !(stopLoss > 0)) {
    throw new PendingLimitOrderError('entryPrice y stopLoss deben ser positivos.', {
      status: 400,
      code: 'INVALID_LEVELS',
    });
  }

  if (direction === 'LONG') {
    if (!(stopLoss < entryPrice)) {
      throw new PendingLimitOrderError('Para LONG, SL debe estar por debajo del entry.', {
        status: 400,
        code: 'INVALID_LONG_SL',
      });
    }
    if (Number.isFinite(takeProfit as number) && (takeProfit as number) <= entryPrice) {
      throw new PendingLimitOrderError('Para LONG, TP debe estar por encima del entry.', {
        status: 400,
        code: 'INVALID_LONG_TP',
      });
    }
    return;
  }

  if (!(stopLoss > entryPrice)) {
    throw new PendingLimitOrderError('Para SHORT, SL debe estar por encima del entry.', {
      status: 400,
      code: 'INVALID_SHORT_SL',
    });
  }
  if (Number.isFinite(takeProfit as number) && (takeProfit as number) >= entryPrice) {
    throw new PendingLimitOrderError('Para SHORT, TP debe estar por debajo del entry.', {
      status: 400,
      code: 'INVALID_SHORT_TP',
    });
  }
}

async function insertPendingLimitOrderEvent(params: {
  pendingOrderId: number;
  eventType: 'created' | 'edited' | 'canceled' | 'filled' | 'migrated' | 'status_sync';
  actorType?: string | null;
  actorId?: string | null;
  reason?: string | null;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  await query(
    `INSERT INTO pending_limit_order_events (
      pending_order_id,
      event_type,
      actor_type,
      actor_id,
      reason,
      payload_before,
      payload_after,
      metadata,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, NOW())`,
    [
      params.pendingOrderId,
      params.eventType,
      params.actorType || null,
      params.actorId || null,
      params.reason || null,
      JSON.stringify(params.payloadBefore || {}),
      JSON.stringify(params.payloadAfter || {}),
      JSON.stringify(params.metadata || {}),
    ]
  );
}

export async function getPendingLimitOrderById(pendingOrderId: number) {
  const res = await query(
    `SELECT *
     FROM pending_limit_orders
     WHERE id = $1
     LIMIT 1`,
    [pendingOrderId]
  );
  return res.rows[0] || null;
}

export async function listActivePendingLimitOrders() {
  const res = await query(
    `SELECT *
     FROM pending_limit_orders
     WHERE order_status IN ('NEW', 'PARTIALLY_FILLED')
     ORDER BY created_at DESC, id DESC`
  );
  return res.rows;
}

export async function createPendingLimitOrder(params: {
  symbol: string;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number | null;
  margin: number;
  leverage: number;
  externalOrderId: string | null;
  externalClientOrderId?: string | null;
  orderStatus?: PendingOrderStatus;
  broker?: string | null;
  exchangeType?: string | null;
  tickerApi?: string | null;
  accountId?: number | null;
  checklistConfirmed?: boolean;
  checklistCheckedCount?: number;
  checklistTotal?: number;
  checklistMissing?: unknown;
  checklistTimestamp?: string | null;
  entryTesis?: string | null;
  setupTag?: string | null;
  timeframe?: string | null;
  zonaEntrada?: string | null;
  tendenciaMacro?: string | null;
  contextoMercado?: string | null;
  volatilidad?: string | null;
  tipoLiquidez?: string | null;
  estadoDelta?: string | null;
  volumenEstado?: string | null;
  absorcionDetectada?: boolean;
  emocionEntrada?: string | null;
  sessionMentalState?: string | null;
  screenshotUrl?: string | null;
  source?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  chatSessionId?: string | null;
}) {
  const orderStatus = normalizeStatus(params.orderStatus || 'NEW');
  const insertRes = await query(
    `INSERT INTO pending_limit_orders (
      simbolo,
      direccion,
      entry_price,
      stop_loss,
      take_profit,
      margin,
      leverage,
      order_status,
      external_order_id,
      external_client_order_id,
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
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18::jsonb, COALESCE($19, NOW()), $20,
      $21, $22, $23, $24, $25,
      $26, $27, $28, $29, $30,
      $31, $32, $33, $34, NOW(), NOW()
    )
    RETURNING *`,
    [
      params.symbol,
      normalizeDirection(params.direction),
      params.entryPrice,
      params.stopLoss,
      params.takeProfit ?? null,
      params.margin,
      params.leverage,
      orderStatus,
      params.externalOrderId || null,
      params.externalClientOrderId || null,
      params.broker || 'BINANCE_FUTURES',
      params.exchangeType || 'FUTURES',
      params.tickerApi || params.symbol,
      params.accountId ?? 1,
      Boolean(params.checklistConfirmed),
      Number.isFinite(Number(params.checklistCheckedCount)) ? Number(params.checklistCheckedCount) : 0,
      Number.isFinite(Number(params.checklistTotal)) ? Number(params.checklistTotal) : 11,
      JSON.stringify(params.checklistMissing || []),
      params.checklistTimestamp || null,
      params.entryTesis || null,
      params.setupTag || null,
      params.timeframe || null,
      params.zonaEntrada || null,
      params.tendenciaMacro || null,
      params.contextoMercado || null,
      params.volatilidad || null,
      params.tipoLiquidez || null,
      params.estadoDelta || null,
      params.volumenEstado || null,
      Boolean(params.absorcionDetectada),
      params.emocionEntrada || null,
      params.sessionMentalState || null,
      params.screenshotUrl || null,
      sanitizeSource(params.source, 'OPEN_POSITION'),
    ]
  );

  const pendingOrder = insertRes.rows[0];
  const pendingOrderId = Number(pendingOrder.id);

  await insertPendingLimitOrderEvent({
    pendingOrderId,
    eventType: 'created',
    actorType: params.actorType || 'system',
    actorId: params.actorId || null,
    payloadAfter: pendingOrder,
    metadata: {
      source: sanitizeSource(params.source, 'OPEN_POSITION'),
      external_order_id: params.externalOrderId || null,
    },
  });

  if (params.chatSessionId) {
    await query(
      `UPDATE react_chat_sessions
       SET pending_limit_order_id = $1,
           trade_id = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [pendingOrderId, params.chatSessionId]
    ).catch(() => undefined);
  }

  return pendingOrder;
}

async function fetchOrderStatusSafe(symbol: string, orderId: number) {
  try {
    const order = await futuresSignedRequest<any>('/fapi/v1/order', { symbol, orderId }, 'GET');
    return normalizeStatus(order?.status || 'NEW');
  } catch {
    return 'NEW' as PendingOrderStatus;
  }
}

async function cancelBinanceLimitOrderIfNeeded(symbol: string, externalOrderId: string | null) {
  const numericOrderId = Number(externalOrderId || 0);
  if (!(numericOrderId > 0)) {
    return {
      canceled: false,
      status: 'NEW' as PendingOrderStatus,
    };
  }

  try {
    const cancelRes = await futuresSignedRequest<any>(
      '/fapi/v1/order',
      { symbol, orderId: numericOrderId },
      'DELETE'
    );
    return {
      canceled: true,
      status: normalizeStatus(cancelRes?.status || 'CANCELED'),
    };
  } catch (error: any) {
    if (error instanceof BinanceFuturesError && (error.binanceCode === -2011 || error.binanceCode === -2013)) {
      const status = await fetchOrderStatusSafe(symbol, numericOrderId);
      return {
        canceled: false,
        status,
      };
    }
    throw error;
  }
}

export async function cancelPendingLimitOrderControlled(params: {
  pendingOrderId: number;
  source?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  reason?: string | null;
}) {
  const pendingOrder = await getPendingLimitOrderById(params.pendingOrderId);
  if (!pendingOrder) {
    throw new PendingLimitOrderError('Orden LIMIT pendiente no encontrada.', {
      status: 404,
      code: 'PENDING_ORDER_NOT_FOUND',
    });
  }

  const currentStatus = normalizeStatus(pendingOrder.order_status || 'NEW');
  if (!ACTIVE_PENDING_STATUSES.includes(currentStatus)) {
    throw new PendingLimitOrderError(`La orden no está activa (estado ${currentStatus}).`, {
      status: 409,
      code: 'PENDING_ORDER_NOT_ACTIVE',
      details: { status: currentStatus },
    });
  }

  const symbol = String(pendingOrder.simbolo || '').toUpperCase();
  if (!symbol) {
    throw new PendingLimitOrderError('La orden pendiente no tiene símbolo válido.', {
      status: 400,
      code: 'INVALID_PENDING_SYMBOL',
    });
  }

  const before = { ...pendingOrder };
  const cancelResult = await cancelBinanceLimitOrderIfNeeded(symbol, pendingOrder.external_order_id || null);

  if (cancelResult.status === 'FILLED' || cancelResult.status === 'PARTIALLY_FILLED') {
    throw new PendingLimitOrderError('La orden LIMIT ya fue ejecutada o parcialmente ejecutada; no se puede cancelar.', {
      status: 409,
      code: 'LIMIT_ALREADY_FILLED',
    });
  }

  const updateRes = await query(
    `UPDATE pending_limit_orders
     SET order_status = 'CANCELED',
         canceled_at = NOW(),
         updated_at = NOW(),
         source = $2
     WHERE id = $1
     RETURNING *`,
    [params.pendingOrderId, sanitizeSource(params.source, 'UI')]
  );

  const updated = updateRes.rows[0];
  await insertPendingLimitOrderEvent({
    pendingOrderId: Number(updated.id),
    eventType: 'canceled',
    actorType: params.actorType || 'ui',
    actorId: params.actorId || null,
    reason: params.reason || null,
    payloadBefore: before,
    payloadAfter: updated,
    metadata: {
      exchange_status: cancelResult.status,
      cancel_requested: cancelResult.canceled,
    },
  });

  return {
    success: true,
    pendingOrder: updated,
    exchangeStatus: cancelResult.status,
  };
}

export async function editPendingLimitOrderControlled(params: {
  pendingOrderId: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number | null;
  margin: number;
  leverage: number;
  overrideRiskIncrease?: boolean;
  overrideReason?: string | null;
  source?: string | null;
  actorType?: string | null;
  actorId?: string | null;
}) {
  const pendingOrder = await getPendingLimitOrderById(params.pendingOrderId);
  if (!pendingOrder) {
    throw new PendingLimitOrderError('Orden LIMIT pendiente no encontrada.', {
      status: 404,
      code: 'PENDING_ORDER_NOT_FOUND',
    });
  }

  const currentStatus = normalizeStatus(pendingOrder.order_status || 'NEW');
  if (!ACTIVE_PENDING_STATUSES.includes(currentStatus)) {
    throw new PendingLimitOrderError(`La orden no está activa (estado ${currentStatus}).`, {
      status: 409,
      code: 'PENDING_ORDER_NOT_ACTIVE',
      details: { status: currentStatus },
    });
  }

  const symbol = String(pendingOrder.simbolo || '').toUpperCase();
  const direction = normalizeDirection(pendingOrder.direccion);
  if (!symbol) {
    throw new PendingLimitOrderError('La orden pendiente no tiene símbolo válido.', {
      status: 400,
      code: 'INVALID_PENDING_SYMBOL',
    });
  }

  if (!(Number.isFinite(params.entryPrice) && params.entryPrice > 0)) {
    throw new PendingLimitOrderError('entryPrice inválido.', {
      status: 400,
      code: 'INVALID_ENTRY_PRICE',
    });
  }
  if (!(Number.isFinite(params.stopLoss) && params.stopLoss > 0)) {
    throw new PendingLimitOrderError('stopLoss inválido.', {
      status: 400,
      code: 'INVALID_STOP_LOSS',
    });
  }
  if (!(Number.isFinite(params.margin) && params.margin > 0)) {
    throw new PendingLimitOrderError('margin inválido.', {
      status: 400,
      code: 'INVALID_MARGIN',
    });
  }
  if (!(Number.isFinite(params.leverage) && params.leverage >= 1 && params.leverage <= 125)) {
    throw new PendingLimitOrderError('leverage inválido (1-125).', {
      status: 400,
      code: 'INVALID_LEVERAGE',
    });
  }

  const symbolRules = await getSymbolRules(symbol);
  const entryRounded = roundToTick(params.entryPrice, symbolRules.tickSize);
  const slRounded = roundToTick(params.stopLoss, symbolRules.tickSize);
  const tpRounded = Number.isFinite(Number(params.takeProfit)) && Number(params.takeProfit) > 0
    ? roundToTick(Number(params.takeProfit), symbolRules.tickSize)
    : null;

  assertDirectionalLevels({
    direction,
    entryPrice: entryRounded,
    stopLoss: slRounded,
    takeProfit: tpRounded,
  });

  const previousSL = asFiniteNumber(pendingOrder.stop_loss, NaN);
  const hasPreviousSL = Number.isFinite(previousSL) && previousSL > 0;
  let riskIncreased = false;
  let slMoveDirection = 'not_moved';

  if (hasPreviousSL && Math.abs(previousSL - slRounded) >= 1e-8) {
    const classification = classifySlMovement({
      direction,
      originalSL: previousSL,
      newSL: slRounded,
      entryPrice: entryRounded,
    });
    riskIncreased = classification.riskIncreased;
    slMoveDirection = classification.slMoveDirection;
  }

  const overrideReason = String(params.overrideReason || '').trim();
  const overrideValid = Boolean(params.overrideRiskIncrease) && overrideReason.length >= 10;
  if (riskIncreased && !overrideValid) {
    throw new PendingLimitOrderError(
      params.overrideRiskIncrease
        ? 'Para override necesitas un motivo de mínimo 10 caracteres.'
        : 'Movimiento bloqueado: el nuevo SL aumenta riesgo y requiere override con motivo.'
      ,
      {
        status: 400,
        code: 'RISK_INCREASE_BLOCKED',
      }
    );
  }

  const cancelResult = await cancelBinanceLimitOrderIfNeeded(symbol, pendingOrder.external_order_id || null);
  if (cancelResult.status === 'FILLED' || cancelResult.status === 'PARTIALLY_FILLED') {
    throw new PendingLimitOrderError('La orden LIMIT ya fue ejecutada o parcialmente ejecutada; no se puede editar.', {
      status: 409,
      code: 'LIMIT_ALREADY_FILLED',
    });
  }

  const side = direction === 'LONG' ? 'BUY' : 'SELL';
  const positionValue = params.margin * params.leverage;
  const rawQty = positionValue / entryRounded;
  const stepDecimals = (symbolRules.stepSize.toString().split('.')[1] || '').length;
  const factor = Math.pow(10, stepDecimals);
  const qty = Math.floor(rawQty * factor) / factor;
  if (!(qty >= symbolRules.stepSize)) {
    throw new PendingLimitOrderError(`Cantidad calculada (${qty}) por debajo del mínimo (${symbolRules.stepSize}).`, {
      status: 400,
      code: 'INVALID_QTY',
    });
  }

  const newOrder = await placeEntryOrder({
    symbol,
    side,
    orderType: 'LIMIT',
    quantity: qty,
    price: entryRounded,
    timeInForce: 'GTC',
  });

  const newStatus = normalizeStatus(newOrder?.status || 'NEW');
  const before = { ...pendingOrder };
  const updateRes = await query(
    `UPDATE pending_limit_orders
     SET entry_price = $2,
         stop_loss = $3,
         take_profit = $4,
         margin = $5,
         leverage = $6,
         order_status = $7,
         external_order_id = $8,
         external_client_order_id = $9,
         source = $10,
         last_binance_endpoint = 'order',
         last_binance_error = NULL,
         last_fallback_used = FALSE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      params.pendingOrderId,
      entryRounded,
      slRounded,
      tpRounded,
      params.margin,
      params.leverage,
      newStatus,
      String(newOrder?.orderId || ''),
      String(newOrder?.clientOrderId || ''),
      sanitizeSource(params.source, 'UI'),
    ]
  );

  const updated = updateRes.rows[0];
  await insertPendingLimitOrderEvent({
    pendingOrderId: Number(updated.id),
    eventType: 'edited',
    actorType: params.actorType || 'ui',
    actorId: params.actorId || null,
    reason: riskIncreased && overrideValid ? overrideReason : null,
    payloadBefore: before,
    payloadAfter: updated,
    metadata: {
      cancel_exchange_status: cancelResult.status,
      sl_move_direction: slMoveDirection,
      risk_increased: riskIncreased,
      override_applied: riskIncreased && overrideValid,
      recreated_order_id: String(newOrder?.orderId || ''),
    },
  });

  return {
    success: true,
    pendingOrder: updated,
    risk: {
      slMoveDirection,
      riskIncreased,
      overrideApplied: riskIncreased && overrideValid,
    },
    recreatedOrder: {
      orderId: String(newOrder?.orderId || ''),
      status: newStatus,
    },
  };
}
