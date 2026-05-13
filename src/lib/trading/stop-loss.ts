import { query } from '@/lib/db';
import { classifySlMovement, sendTelegramText } from '@/lib/trading/discipline';
import {
  asFiniteNumber,
  BinanceFuturesError,
  cancelProtectiveOrders,
  fetchCurrentFuturesPrice,
  getSymbolRules,
  placeProtectiveOrderWithFallback,
  recordProtectionAudit,
  roundToTick,
} from '@/lib/trading/binance-futures';

export class StopLossMoveError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, options?: { status?: number; code?: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'StopLossMoveError';
    this.status = options?.status || 400;
    this.code = options?.code || 'STOP_LOSS_MOVE_ERROR';
    this.details = options?.details;
  }
}

function sanitizeSource(input?: string | null) {
  const source = String(input || 'UI_MODAL')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');

  if (!source) return 'UI_MODAL';
  return source.slice(0, 30);
}

function mapBinanceError(error: any) {
  if (error instanceof StopLossMoveError) return error;

  if (error instanceof BinanceFuturesError) {
    return new StopLossMoveError(
      error.binanceMessage || error.message || 'Error en Binance al gestionar protección.',
      {
        status: 502,
        code: 'BINANCE_API_ERROR',
        details: {
          binanceCode: error.binanceCode,
          binanceMessage: error.binanceMessage,
          path: error.path,
          method: error.method,
          raw: error.raw,
        },
      }
    );
  }

  return new StopLossMoveError(error?.message || 'Error moviendo Stop Loss', {
    status: 500,
    code: 'MOVE_SL_UNKNOWN_ERROR',
  });
}

function assertDirectionalCoherence(direction: 'LONG' | 'SHORT', currentPrice: number, stopLoss: number, takeProfit?: number | null) {
  if (direction === 'LONG') {
    if (!(stopLoss < currentPrice)) {
      throw new StopLossMoveError('Para LONG, el nuevo SL debe estar por debajo del precio actual.', {
        status: 400,
        code: 'INVALID_LONG_SL_VS_CURRENT_PRICE',
      });
    }
    if (Number.isFinite(takeProfit as number) && (takeProfit as number) <= currentPrice) {
      throw new StopLossMoveError('Para LONG, el TP debe estar por encima del precio actual.', {
        status: 400,
        code: 'INVALID_LONG_TP_VS_CURRENT_PRICE',
      });
    }
    return;
  }

  if (!(stopLoss > currentPrice)) {
    throw new StopLossMoveError('Para SHORT, el nuevo SL debe estar por encima del precio actual.', {
      status: 400,
      code: 'INVALID_SHORT_SL_VS_CURRENT_PRICE',
    });
  }
  if (Number.isFinite(takeProfit as number) && (takeProfit as number) >= currentPrice) {
    throw new StopLossMoveError('Para SHORT, el TP debe estar por debajo del precio actual.', {
      status: 400,
      code: 'INVALID_SHORT_TP_VS_CURRENT_PRICE',
    });
  }
}

async function getTradeForProtection(tradeId: number) {
  const tradeRes = await query(
    `SELECT id,
            simbolo,
            estado,
            direccion,
            broker,
            precio_entrada,
            stop_loss,
            take_profit,
            sl_original,
            sl_move_count
     FROM trades_activos
     WHERE id = $1
     LIMIT 1`,
    [tradeId]
  );

  if (!tradeRes.rows.length) {
    throw new StopLossMoveError('Trade no encontrado.', {
      status: 404,
      code: 'TRADE_NOT_FOUND',
    });
  }

  const trade = tradeRes.rows[0];
  const status = String(trade.estado || '').toUpperCase();
  if (status !== 'OPEN') {
    throw new StopLossMoveError('Solo puedes gestionar protección en trades OPEN.', {
      status: 400,
      code: 'TRADE_NOT_OPEN',
    });
  }

  const broker = String(trade.broker || '').toUpperCase();
  if (!broker.includes('BINANCE')) {
    throw new StopLossMoveError('La gestión de SL solo está habilitada para Binance Futures.', {
      status: 400,
      code: 'UNSUPPORTED_BROKER',
    });
  }

  const symbol = String(trade.simbolo || '').toUpperCase();
  if (!symbol) {
    throw new StopLossMoveError('Trade sin símbolo válido.', {
      status: 400,
      code: 'INVALID_SYMBOL',
    });
  }

  const direction = String(trade.direccion || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const entryPrice = asFiniteNumber(trade.precio_entrada, NaN);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new StopLossMoveError('El trade no tiene precio de entrada válido.', {
      status: 400,
      code: 'INVALID_ENTRY_PRICE',
    });
  }

  return {
    trade,
    symbol,
    direction: direction as 'LONG' | 'SHORT',
    entryPrice,
  };
}

export async function setTradeProtectionControlled(params: {
  tradeId: number;
  stopLoss: number;
  takeProfit?: number | null;
  source?: string | null;
  overrideRiskIncrease?: boolean;
  overrideReason?: string | null;
  actor?: {
    type?: 'ui' | 'copilot' | 'system';
    id?: string | null;
  };
  action?: 'SET_PROTECTION' | 'MOVE_STOP_LOSS';
}) {
  const {
    tradeId,
    stopLoss,
    takeProfit = undefined,
    source,
    overrideRiskIncrease = false,
    overrideReason = null,
    actor,
    action = 'SET_PROTECTION',
  } = params;

  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    throw new StopLossMoveError('tradeId inválido.', {
      status: 400,
      code: 'INVALID_TRADE_ID',
    });
  }

  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
    throw new StopLossMoveError('stopLoss inválido.', {
      status: 400,
      code: 'INVALID_NEW_STOP_LOSS',
    });
  }

  const { trade, symbol, direction, entryPrice } = await getTradeForProtection(tradeId);

  const previousSL = asFiniteNumber(trade.stop_loss ?? trade.sl_original, NaN);
  const existingTP = asFiniteNumber(trade.take_profit, NaN);
  const hasPreviousSL = Number.isFinite(previousSL) && previousSL > 0;

  const nextTakeProfitRaw = Number.isFinite(Number(takeProfit)) && Number(takeProfit) > 0
    ? Number(takeProfit)
    : (Number.isFinite(existingTP) && existingTP > 0 ? existingTP : null);

  const [marketPrice, symbolRules] = await Promise.all([
    fetchCurrentFuturesPrice(symbol),
    getSymbolRules(symbol),
  ]);

  const roundedStop = roundToTick(Number(stopLoss), symbolRules.tickSize);
  const roundedTp = nextTakeProfitRaw !== null
    ? roundToTick(nextTakeProfitRaw, symbolRules.tickSize)
    : null;

  assertDirectionalCoherence(direction, marketPrice, roundedStop, roundedTp);

  let slMoveDirection = 'not_moved';
  let riskIncreased = false;
  let moveCount = asFiniteNumber(trade.sl_move_count, 0);

  if (hasPreviousSL) {
    if (Math.abs(previousSL - roundedStop) < 1e-8) {
      if (Number.isFinite(existingTP) && Number.isFinite(roundedTp) && Math.abs(existingTP - (roundedTp as number)) >= 1e-8) {
        // TP changed only; allowed.
      } else {
        throw new StopLossMoveError('El nuevo SL es igual al SL actual.', {
          status: 409,
          code: 'SL_NOT_CHANGED',
          details: { previousSL },
        });
      }
    }

    const classify = classifySlMovement({
      direction,
      originalSL: previousSL,
      newSL: roundedStop,
      entryPrice,
    });

    slMoveDirection = classify.slMoveDirection;
    riskIncreased = classify.riskIncreased;

    if (Math.abs(previousSL - roundedStop) >= 1e-8) {
      moveCount += 1;
    }
  }

  const normalizedReason = String(overrideReason || '').trim();
  const isOverrideValid = overrideRiskIncrease && normalizedReason.length >= 10;

  if (riskIncreased && !isOverrideValid) {
    throw new StopLossMoveError(
      overrideRiskIncrease
        ? 'Para override necesitas una razón de mínimo 10 caracteres.'
        : 'Movimiento bloqueado: aumenta riesgo y requiere override explícito.',
      {
        status: 400,
        code: 'RISK_INCREASE_BLOCKED',
        details: {
          slMoveDirection,
          riskIncreased,
          requiresOverride: true,
        },
      }
    );
  }

  const protectiveSide = direction === 'LONG' ? 'SELL' : 'BUY';

  try {
    await cancelProtectiveOrders(symbol).catch(() => undefined);

    const slOrder = await placeProtectiveOrderWithFallback({
      symbol,
      side: protectiveSide,
      type: 'STOP_MARKET',
      stopPrice: roundedStop,
      closePosition: true,
      workingType: 'MARK_PRICE',
    });

    await recordProtectionAudit({
      tradeId,
      symbol,
      action,
      orderKind: 'SL',
      attemptedEndpoint: slOrder.endpoint,
      fallbackUsed: slOrder.fallbackUsed,
      success: true,
      details: {
        stopPrice: roundedStop,
        orderId: slOrder?.data?.orderId || null,
      },
    });

    let endpoint = slOrder.endpoint as 'order' | 'algoOrder' | 'mixed';
    const slOrderClientId = String(slOrder?.data?.clientOrderId || '');

    if (roundedTp !== null) {
      const tpOrder = await placeProtectiveOrderWithFallback({
        symbol,
        side: protectiveSide,
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: roundedTp,
        closePosition: true,
        workingType: 'MARK_PRICE',
      });

      if (endpoint !== tpOrder.endpoint) endpoint = 'mixed';
      await recordProtectionAudit({
        tradeId,
        symbol,
        action,
        orderKind: 'TP',
        attemptedEndpoint: tpOrder.endpoint,
        fallbackUsed: tpOrder.fallbackUsed,
        success: true,
        details: {
          stopPrice: roundedTp,
          orderId: tpOrder?.data?.orderId || null,
        },
      });
    }

    const sourceTag = sanitizeSource(
      riskIncreased && overrideRiskIncrease ? 'UI_OVERRIDE' : source || 'UI_MODAL'
    );

    await query(
      `UPDATE trades_activos
       SET stop_loss = $2,
           take_profit = COALESCE($3, take_profit),
           sl_was_moved = CASE
             WHEN $4::boolean = TRUE AND ABS(COALESCE(stop_loss, 0) - $2) >= 0.00000001 THEN TRUE
             ELSE sl_was_moved
           END,
           sl_move_direction = CASE
             WHEN $4::boolean = TRUE AND ABS(COALESCE(stop_loss, 0) - $2) >= 0.00000001 THEN $5
             ELSE COALESCE(sl_move_direction, 'not_moved')
           END,
           sl_move_count = CASE
             WHEN $4::boolean = TRUE AND ABS(COALESCE(stop_loss, 0) - $2) >= 0.00000001 THEN $6
             ELSE sl_move_count
           END,
           sl_original = CASE
             WHEN $4::boolean = TRUE THEN COALESCE(sl_original, $7)
             ELSE COALESCE(sl_original, $2)
           END,
           sl_status = 'PLACED',
           sl_source = 'BINANCE',
           sl_reason = CASE
             WHEN $8::boolean = TRUE THEN 'OVERRIDE_RISK_INCREASE'
             WHEN $4::boolean = TRUE THEN COALESCE(sl_reason, 'MANUAL_SL_MOVE')
             ELSE COALESCE(sl_reason, 'INITIAL_PROTECTION')
           END,
           protection_required = FALSE,
           protection_set_at = NOW(),
           protection_endpoint = $9,
           protection_last_error = NULL,
           protection_retry_count = CASE WHEN protection_required = TRUE THEN COALESCE(protection_retry_count, 0) + 1 ELSE protection_retry_count END
       WHERE id = $1`,
      [
        tradeId,
        roundedStop,
        roundedTp,
        hasPreviousSL,
        slMoveDirection,
        moveCount,
        hasPreviousSL ? previousSL : roundedStop,
        riskIncreased && overrideRiskIncrease,
        endpoint,
      ]
    );

    if (hasPreviousSL && Math.abs(previousSL - roundedStop) >= 1e-8) {
      await query(
        `INSERT INTO sl_movements (
          trade_id,
          original_sl,
          new_sl,
          direction,
          risk_increased,
          client_order_id,
          source,
          moved_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          tradeId,
          previousSL,
          roundedStop,
          slMoveDirection,
          riskIncreased,
          slOrderClientId,
          sourceTag,
        ]
      );
    }

    if (riskIncreased && overrideRiskIncrease) {
      await query(
        `INSERT INTO sl_override_audit (
          trade_id,
          previous_sl,
          new_sl,
          reason,
          source,
          actor_type,
          actor_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          tradeId,
          previousSL,
          roundedStop,
          normalizedReason,
          sourceTag,
          String(actor?.type || 'ui').slice(0, 20),
          actor?.id || null,
        ]
      );

      await sendTelegramText(
        `⚠️ <b>Override de SL con aumento de riesgo</b>\n` +
        `${symbol} ${direction}\n` +
        `SL: <b>${previousSL}</b> → <b>${roundedStop}</b>\n` +
        `Razón: <i>${normalizedReason.replace(/[<>]/g, '')}</i>`
      );
    }

    return {
      success: true,
      tradeId,
      symbol,
      direction,
      entryPrice,
      previousSL: hasPreviousSL ? previousSL : null,
      newSL: roundedStop,
      takeProfit: roundedTp,
      marketPrice,
      slMoveDirection,
      riskIncreased,
      overrideApplied: riskIncreased && overrideRiskIncrease,
      moveCount,
      protectionEndpoint: endpoint,
    };
  } catch (error: any) {
    const mapped = mapBinanceError(error);

    await query(
      `UPDATE trades_activos
       SET sl_status = 'ERROR',
           protection_required = TRUE,
           protection_last_error = $2,
           protection_retry_count = COALESCE(protection_retry_count, 0) + 1
       WHERE id = $1`,
      [tradeId, mapped.message]
    ).catch(() => undefined);

    const rawBinanceCode = Number((mapped?.details as any)?.binanceCode);
    await recordProtectionAudit({
      tradeId,
      symbol,
      action,
      orderKind: 'SL',
      attemptedEndpoint: 'order',
      fallbackUsed: true,
      success: false,
      binanceCode: Number.isFinite(rawBinanceCode) ? rawBinanceCode : null,
      binanceMessage: String((mapped?.details as any)?.binanceMessage ?? mapped.message),
      details: mapped.details || null,
    }).catch(() => undefined);

    throw mapped;
  }
}

export async function moveStopLossControlled(params: {
  tradeId: number;
  newStopLoss: number;
  source?: string | null;
  overrideRiskIncrease?: boolean;
  overrideReason?: string | null;
  actor?: {
    type?: 'ui' | 'copilot' | 'system';
    id?: string | null;
  };
}) {
  return setTradeProtectionControlled({
    tradeId: params.tradeId,
    stopLoss: params.newStopLoss,
    source: params.source,
    overrideRiskIncrease: params.overrideRiskIncrease,
    overrideReason: params.overrideReason,
    actor: params.actor,
    action: 'MOVE_STOP_LOSS',
  });
}
