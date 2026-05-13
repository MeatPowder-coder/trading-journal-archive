import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  ensurePreviousLossHasLesson,
  getLatestAccountBalanceUsdt,
  getMaxRiskAmount,
  isTradingBlockedNow,
  MENTAL_STATES,
  MentalState,
  sendTelegramText,
  upsertTodayTradingSession,
} from '@/lib/trading/discipline';
import {
  asFiniteNumber,
  BinanceFuturesError,
  cancelProtectiveOrders,
  fetchCurrentFuturesPrice,
  getSymbolRules,
  placeEntryOrder,
  placeProtectiveOrderWithFallback,
  recordProtectionAudit,
  roundToTick,
  setFuturesLeverage,
} from '@/lib/trading/binance-futures';
import { createPendingLimitOrder } from '@/lib/trading/pending-limit-orders';

const ACCOUNT_ID_FUTURES = 1;

const VALID_MENTAL_STATES: MentalState[] = [...MENTAL_STATES];
const VALID_TENDENCIA = ['ALCISTA', 'BAJISTA', 'LATERAL', 'NO_SE'];
const VALID_CONTEXTO = ['TENDENCIA_ALCISTA', 'TENDENCIA_BAJISTA', 'RANGO', 'CONSOLIDACION'];
const VALID_VOLATILIDAD = ['BAJA', 'MEDIA', 'ALTA'];
const VALID_LIQUIDEZ = ['SWEEP_HIGHS', 'SWEEP_LOWS', 'INDUCEMENT', 'NINGUNA'];
const VALID_DELTA = ['POSITIVO', 'NEGATIVO', 'DIVERGENTE', 'NEUTRO'];
const VALID_VOLUMEN = ['MUCHO_VOLUMEN', 'POCO_VOLUMEN', 'NORMAL'];

function toUpperText(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : null;
}

function toChecklistMissing(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 11);
}

function computeRisk(params: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number | null;
  qty: number;
  accountBalance: number;
}) {
  const { direction, entryPrice, stopLoss, takeProfit = null, qty, accountBalance } = params;
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  if (!(riskPerUnit > 0) || !(qty > 0)) {
    return {
      valid: false,
      riskAmount: 0,
      riskPct: null as number | null,
      rrEstimated: null as number | null,
    };
  }

  const riskAmount = riskPerUnit * qty;
  const riskPct = accountBalance > 0 ? (riskAmount / accountBalance) * 100 : null;

  let rrEstimated: number | null = null;
  if (Number.isFinite(takeProfit as number) && (takeProfit as number) > 0) {
    const tp = Number(takeProfit);
    const rewardPerUnit = direction === 'LONG'
      ? tp - entryPrice
      : entryPrice - tp;
    rrEstimated = rewardPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;
  }

  return {
    valid: true,
    riskAmount,
    riskPct,
    rrEstimated,
  };
}

function validateDirectionalLevels(params: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}) {
  const { direction, entryPrice, stopLoss = null, takeProfit = null } = params;

  if (Number.isFinite(stopLoss as number) && (stopLoss as number) > 0) {
    if (direction === 'LONG' && !((stopLoss as number) < entryPrice)) {
      throw new Error('Para LONG, SL debe estar por debajo del precio de entrada.');
    }
    if (direction === 'SHORT' && !((stopLoss as number) > entryPrice)) {
      throw new Error('Para SHORT, SL debe estar por encima del precio de entrada.');
    }
  }

  if (Number.isFinite(takeProfit as number) && (takeProfit as number) > 0) {
    if (direction === 'LONG' && !((takeProfit as number) > entryPrice)) {
      throw new Error('Para LONG, TP debe estar por encima del precio de entrada.');
    }
    if (direction === 'SHORT' && !((takeProfit as number) < entryPrice)) {
      throw new Error('Para SHORT, TP debe estar por debajo del precio de entrada.');
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      symbol,
      side,
      leverage,
      margin,
      orderType,
      entryPrice,
      stopLoss,
      takeProfit,
      entryTesis,
      checklistConfirmed,
      checklistCheckedCount,
      checklistTotal,
      checklistMissing,
      checklistTimestamp,
      mentalState,
      overrideCooldown,
      setupTag,
      timeframe,
      zonaEntrada,
      tendenciaMacro,
      contextoMercado,
      volatilidad,
      tipoLiquidez,
      estadoDelta,
      volumenEstado,
      absorcionDetectada,
      emocionEntrada,
      chatSessionId,
    } = body || {};

    const symbolValue = String(symbol || '').toUpperCase().trim();
    const direction = String(side || '').toUpperCase();
    const orderTypeValue = String(orderType || 'MARKET').toUpperCase();

    if (!symbolValue || !direction || !leverage || !margin) {
      return NextResponse.json({ error: 'Missing required fields (symbol, side, leverage, margin)' }, { status: 400 });
    }

    if (direction !== 'LONG' && direction !== 'SHORT') {
      return NextResponse.json({ error: 'Dirección inválida (LONG/SHORT)' }, { status: 400 });
    }

    if (orderTypeValue !== 'MARKET' && orderTypeValue !== 'LIMIT') {
      return NextResponse.json({ error: 'orderType inválido (MARKET/LIMIT)' }, { status: 400 });
    }

    const leverageNum = asFiniteNumber(leverage, NaN);
    const marginNum = asFiniteNumber(margin, NaN);
    const entryPriceNum = asFiniteNumber(entryPrice, NaN);
    const stopLossNum = asFiniteNumber(stopLoss, NaN);
    const takeProfitNum = asFiniteNumber(takeProfit, NaN);
    const tesis = typeof entryTesis === 'string' ? entryTesis.trim() : '';

    if (!Number.isFinite(leverageNum) || leverageNum < 1 || leverageNum > 125) {
      return NextResponse.json({ error: 'Invalid leverage (1-125)' }, { status: 400 });
    }

    if (!Number.isFinite(marginNum) || marginNum <= 0) {
      return NextResponse.json({ error: 'Margin must be positive' }, { status: 400 });
    }

    if (orderTypeValue === 'LIMIT' && (!Number.isFinite(entryPriceNum) || entryPriceNum <= 0)) {
      return NextResponse.json({ error: 'LIMIT requiere entryPrice válido.' }, { status: 400 });
    }

    if (orderTypeValue === 'LIMIT' && (!Number.isFinite(stopLossNum) || stopLossNum <= 0)) {
      return NextResponse.json({ error: 'LIMIT requiere Stop Loss obligatorio.' }, { status: 400 });
    }

    if (mentalState && !VALID_MENTAL_STATES.includes(mentalState)) {
      return NextResponse.json({ error: 'mentalState inválido' }, { status: 400 });
    }

    if (mentalState === 'avoid') {
      return NextResponse.json({
        error: 'Bloqueado por disciplina: estado mental en "Mejor No Operar".',
        code: 'MENTAL_STATE_BLOCKED',
      }, { status: 409 });
    }

    const setupTagValue = typeof setupTag === 'string' ? setupTag.trim() : null;
    const timeframeValue = typeof timeframe === 'string' ? timeframe.trim() : null;
    const zonaEntradaValue = typeof zonaEntrada === 'string' ? zonaEntrada.trim() : null;
    const tendenciaMacroValue = toUpperText(tendenciaMacro);
    const contextoMercadoValue = toUpperText(contextoMercado);
    const volatilidadValue = toUpperText(volatilidad);
    const tipoLiquidezValue = toUpperText(tipoLiquidez);
    const estadoDeltaValue = toUpperText(estadoDelta);
    const volumenEstadoValue = toUpperText(volumenEstado);
    const emocionEntradaValue = typeof emocionEntrada === 'string' ? emocionEntrada.trim() : null;
    const absorcionDetectadaValue = absorcionDetectada === true;

    if (tendenciaMacroValue && !VALID_TENDENCIA.includes(tendenciaMacroValue)) {
      return NextResponse.json({ error: 'tendenciaMacro inválido' }, { status: 400 });
    }
    if (contextoMercadoValue && !VALID_CONTEXTO.includes(contextoMercadoValue)) {
      return NextResponse.json({ error: 'contextoMercado inválido' }, { status: 400 });
    }
    if (volatilidadValue && !VALID_VOLATILIDAD.includes(volatilidadValue)) {
      return NextResponse.json({ error: 'volatilidad inválida' }, { status: 400 });
    }
    if (tipoLiquidezValue && !VALID_LIQUIDEZ.includes(tipoLiquidezValue)) {
      return NextResponse.json({ error: 'tipoLiquidez inválido' }, { status: 400 });
    }
    if (estadoDeltaValue && !VALID_DELTA.includes(estadoDeltaValue)) {
      return NextResponse.json({ error: 'estadoDelta inválido' }, { status: 400 });
    }
    if (volumenEstadoValue && !VALID_VOLUMEN.includes(volumenEstadoValue)) {
      return NextResponse.json({ error: 'volumenEstado inválido' }, { status: 400 });
    }

    const checklistConfirmedValue = Boolean(checklistConfirmed);
    const checklistCheckedCountValue = Number.isFinite(Number(checklistCheckedCount))
      ? Math.max(0, Math.min(11, Number(checklistCheckedCount)))
      : 0;
    const checklistTotalValue = Number.isFinite(Number(checklistTotal))
      ? Math.max(1, Math.min(20, Number(checklistTotal)))
      : 11;
    const checklistMissingValue = toChecklistMissing(checklistMissing);
    const checklistTimestampValue = (() => {
      if (typeof checklistTimestamp !== 'string' || !checklistTimestamp.trim()) return null;
      const parsed = new Date(checklistTimestamp);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })();

    const blockInfo = await isTradingBlockedNow();
    if (blockInfo.blocked && !overrideCooldown) {
      return NextResponse.json({
        error: 'Trading bloqueado temporalmente por 2 pérdidas consecutivas.',
        code: 'TRADING_COOLDOWN_ACTIVE',
        blockedUntil: blockInfo.blockedUntil,
        remainingSeconds: blockInfo.remainingSeconds,
      }, { status: 429 });
    }

    const lessonCheck = await ensurePreviousLossHasLesson();
    if (lessonCheck.missing) {
      return NextResponse.json({
        error: `Debes escribir una lección aprendida en el trade #${lessonCheck.tradeId} antes de abrir otra operación (Regla #11).`,
        code: 'PREVIOUS_LOSS_LESSON_REQUIRED',
        tradeId: lessonCheck.tradeId,
      }, { status: 409 });
    }

    await setFuturesLeverage(symbolValue, leverageNum);

    const [currentPrice, symbolRules, accountBalance] = await Promise.all([
      fetchCurrentFuturesPrice(symbolValue),
      getSymbolRules(symbolValue),
      getLatestAccountBalanceUsdt(),
    ]);

    const refEntryPrice = orderTypeValue === 'LIMIT' ? entryPriceNum : currentPrice;
    const slRounded = Number.isFinite(stopLossNum) && stopLossNum > 0
      ? roundToTick(stopLossNum, symbolRules.tickSize)
      : null;
    const tpRounded = Number.isFinite(takeProfitNum) && takeProfitNum > 0
      ? roundToTick(takeProfitNum, symbolRules.tickSize)
      : null;

    if (slRounded !== null || tpRounded !== null) {
      validateDirectionalLevels({
        direction: direction as 'LONG' | 'SHORT',
        entryPrice: refEntryPrice,
        stopLoss: slRounded,
        takeProfit: tpRounded,
      });
    }

    const positionValue = marginNum * leverageNum;
    const rawQty = positionValue / refEntryPrice;
    const stepDecimals = (symbolRules.stepSize.toString().split('.')[1] || '').length;
    const factor = Math.pow(10, stepDecimals);
    const qty = Math.floor(rawQty * factor) / factor;

    if (qty < symbolRules.stepSize) {
      return NextResponse.json({
        error: `Cantidad calculada (${qty}) por debajo del mínimo (${symbolRules.stepSize}).`,
      }, { status: 400 });
    }

    if (slRounded !== null) {
      const maxRisk = getMaxRiskAmount(accountBalance);
      const preRisk = computeRisk({
        direction: direction as 'LONG' | 'SHORT',
        entryPrice: refEntryPrice,
        stopLoss: slRounded,
        takeProfit: tpRounded,
        qty,
        accountBalance,
      });

      if (maxRisk.blocking && preRisk.valid && preRisk.riskAmount > maxRisk.amount) {
        return NextResponse.json({
          error: `Riesgo excede 2% de tu cuenta (${preRisk.riskAmount.toFixed(2)} > ${maxRisk.amount.toFixed(2)} USDT).`,
          risk: {
            amount: preRisk.riskAmount,
            percent: preRisk.riskPct,
            maxAllowed: maxRisk.amount,
          },
        }, { status: 400 });
      }
    }

    const orderSide = direction === 'LONG' ? 'BUY' : 'SELL';
    const limitPriceRounded = orderTypeValue === 'LIMIT'
      ? roundToTick(refEntryPrice, symbolRules.tickSize)
      : null;

    const orderData = await placeEntryOrder({
      symbol: symbolValue,
      side: orderSide,
      orderType: orderTypeValue as 'MARKET' | 'LIMIT',
      quantity: qty,
      price: limitPriceRounded || undefined,
      timeInForce: orderTypeValue === 'LIMIT' ? 'GTC' : undefined,
    });

    const entryOrderStatus = String(orderData?.status || (orderTypeValue === 'MARKET' ? 'FILLED' : 'NEW')).toUpperCase();
    const executedPrice = orderTypeValue === 'MARKET'
      ? (asFiniteNumber(orderData?.avgPrice, NaN) > 0 ? asFiniteNumber(orderData?.avgPrice, NaN) : currentPrice)
      : (limitPriceRounded || refEntryPrice);

    let protectionStatus = 'NONE';
    let protectionEndpoint: string | null = null;
    let protectionError: string | null = null;
    let protectionRequired = false;
    let protectionSetAt: string | null = null;
    let protectionFallbackUsed = false;

    const effectiveRisk = slRounded !== null
      ? computeRisk({
          direction: direction as 'LONG' | 'SHORT',
          entryPrice: executedPrice,
          stopLoss: slRounded,
          takeProfit: tpRounded,
          qty,
          accountBalance,
        })
      : {
          valid: false,
          riskAmount: 0,
          riskPct: null as number | null,
          rrEstimated: null as number | null,
        };

    if (orderTypeValue === 'MARKET') {
      if (slRounded !== null) {
        const protectiveSide = direction === 'LONG' ? 'SELL' : 'BUY';

        try {
          await cancelProtectiveOrders(symbolValue).catch(() => undefined);

          const slOrder = await placeProtectiveOrderWithFallback({
            symbol: symbolValue,
            side: protectiveSide,
            type: 'STOP_MARKET',
            stopPrice: slRounded,
            closePosition: true,
            workingType: 'MARK_PRICE',
          });

          protectionEndpoint = slOrder.endpoint;
          protectionFallbackUsed = protectionFallbackUsed || slOrder.fallbackUsed;

          if (tpRounded !== null) {
            const tpOrder = await placeProtectiveOrderWithFallback({
              symbol: symbolValue,
              side: protectiveSide,
              type: 'TAKE_PROFIT_MARKET',
              stopPrice: tpRounded,
              closePosition: true,
              workingType: 'MARK_PRICE',
            });

            protectionFallbackUsed = protectionFallbackUsed || tpOrder.fallbackUsed;
            if (protectionEndpoint !== tpOrder.endpoint) {
              protectionEndpoint = 'mixed';
            }

            await recordProtectionAudit({
              symbol: symbolValue,
              action: 'OPEN_POSITION',
              orderKind: 'TP',
              attemptedEndpoint: tpOrder.endpoint,
              fallbackUsed: tpOrder.fallbackUsed,
              success: true,
              details: {
                stopPrice: tpRounded,
                orderId: tpOrder?.data?.orderId || null,
              },
            });
          }

          await recordProtectionAudit({
            symbol: symbolValue,
            action: 'OPEN_POSITION',
            orderKind: 'SL',
            attemptedEndpoint: slOrder.endpoint,
            fallbackUsed: slOrder.fallbackUsed,
            success: true,
            details: {
              stopPrice: slRounded,
              orderId: slOrder?.data?.orderId || null,
            },
          });

          protectionStatus = 'PLACED';
          protectionSetAt = new Date().toISOString();
          protectionRequired = false;
        } catch (protectiveError: any) {
          const binanceErr = protectiveError instanceof BinanceFuturesError ? protectiveError : null;

          await recordProtectionAudit({
            symbol: symbolValue,
            action: 'OPEN_POSITION',
            orderKind: 'SL',
            attemptedEndpoint: 'order',
            fallbackUsed: true,
            success: false,
            binanceCode: binanceErr?.binanceCode ?? null,
            binanceMessage: binanceErr?.binanceMessage ?? protectiveError?.message ?? null,
            details: {
              stopLoss: slRounded,
              takeProfit: tpRounded,
              raw: binanceErr?.raw || null,
            },
          });

          protectionStatus = 'ERROR';
          protectionRequired = true;
          protectionError = protectiveError?.message || 'No se pudo colocar SL/TP';
        }
      } else {
        protectionStatus = 'PENDING_REQUIRED';
        protectionRequired = true;
      }
    } else {
      // LIMIT: guardamos intención. La protección real se aplica después del fill.
      protectionStatus = 'PENDING_LIMIT_FILL';
      protectionRequired = true;
    }

    const session = await upsertTodayTradingSession({
      mentalState: mentalState || null,
      rulesConfirmed: checklistConfirmedValue,
      overrideUsed: Boolean(overrideCooldown),
    });

    if (orderTypeValue === 'LIMIT') {
      const pendingOrder = await createPendingLimitOrder({
        symbol: symbolValue,
        direction: direction as 'LONG' | 'SHORT',
        entryPrice: executedPrice,
        stopLoss: slRounded as number,
        takeProfit: tpRounded,
        margin: marginNum,
        leverage: leverageNum,
        externalOrderId: String(orderData?.orderId || ''),
        externalClientOrderId: String(orderData?.clientOrderId || ''),
        orderStatus: entryOrderStatus as any,
        broker: 'BINANCE_FUTURES',
        exchangeType: 'FUTURES',
        tickerApi: symbolValue,
        accountId: ACCOUNT_ID_FUTURES,
        checklistConfirmed: checklistConfirmedValue,
        checklistCheckedCount: checklistCheckedCountValue,
        checklistTotal: checklistTotalValue,
        checklistMissing: checklistMissingValue,
        checklistTimestamp: checklistTimestampValue,
        entryTesis: tesis || null,
        setupTag: setupTagValue || null,
        timeframe: timeframeValue || null,
        zonaEntrada: zonaEntradaValue || null,
        tendenciaMacro: tendenciaMacroValue || null,
        contextoMercado: contextoMercadoValue || null,
        volatilidad: volatilidadValue || null,
        tipoLiquidez: tipoLiquidezValue || null,
        estadoDelta: estadoDeltaValue || null,
        volumenEstado: volumenEstadoValue || null,
        absorcionDetectada: absorcionDetectadaValue,
        emocionEntrada: emocionEntradaValue || null,
        sessionMentalState: session?.mental_state || null,
        source: 'OPEN_POSITION',
        actorType: 'ui',
        chatSessionId: chatSessionId || null,
      });

      const pendingOrderId = Number(pendingOrder.id);

      if (effectiveRisk.valid && (effectiveRisk.rrEstimated || 0) < 1.5) {
        await sendTelegramText(
          `📊 <b>LIMIT #${pendingOrderId} con R:R bajo</b>\n` +
          `${symbolValue} ${direction}\n` +
          `R:R estimado: <b>${(effectiveRisk.rrEstimated || 0).toFixed(2)}</b>\n` +
          `Evalúa si el setup realmente compensa el riesgo.`
        );
      }

      return NextResponse.json({
        success: true,
        pendingOrderId,
        orderType: orderTypeValue,
        entryOrderStatus,
        requiresPostProtection: false,
        details: {
          symbol: symbolValue,
          direction,
          price: executedPrice,
          qty,
          leverage: leverageNum,
          margin: marginNum,
          stopLoss: slRounded,
          takeProfit: tpRounded,
        },
        protection: {
          status: protectionStatus,
          required: true,
          endpoint: protectionEndpoint,
          fallbackUsed: protectionFallbackUsed,
          error: protectionError,
        },
        risk: {
          amount: effectiveRisk.valid ? effectiveRisk.riskAmount : null,
          percent: effectiveRisk.valid ? effectiveRisk.riskPct : null,
          rrEstimated: effectiveRisk.valid ? effectiveRisk.rrEstimated : null,
        },
        rawOrder: {
          orderId: orderData?.orderId || null,
          clientOrderId: orderData?.clientOrderId || null,
          status: orderData?.status || null,
        },
      });
    }

    const insertQuery = `
      INSERT INTO trades_activos (
        simbolo, direccion, monto_margin, apalancamiento, precio_entrada,
        estado, fecha_apertura, broker, exchange_type,
        ticker_api, cuenta_id, external_order_id, external_trade_id, tipo_estrategia,
        order_type, entry_order_status,
        stop_loss, take_profit, sl_original, sl_status, sl_source,
        checklist_confirmed, checklist_checked_count, checklist_total, checklist_missing,
        checklist_timestamp, entry_tesis, session_mental_state,
        risk_amount_usdt, risk_percent, rr_estimated,
        setup_tag, timeframe, zona_entrada, tendencia_macro, contexto_mercado,
        volatilidad, tipo_liquidez, estado_delta, volumen_estado, absorcion_detectada, emocion_entrada,
        protection_required, protection_set_at, protection_endpoint, protection_last_error
      ) VALUES (
        $1, $2, $3, $4, $5,
        'OPEN', NOW(), 'BINANCE_FUTURES', 'FUTURES',
        $6, $7, $8, $8, 'TRADING',
        $9, $10,
        $11::numeric, $12::numeric, COALESCE($11::numeric, $12::numeric), $13, $14,
        $15, $16, $17, $18::jsonb,
        COALESCE($19, NOW()), $20, $21,
        $22, $23, $24,
        $25, $26, $27, $28, $29,
        $30, $31, $32, $33, $34, $35,
        $36, $37, $38, $39
      )
      RETURNING id
    `;

    const tradeRes = await query(insertQuery, [
      symbolValue,
      direction,
      marginNum,
      leverageNum,
      executedPrice,
      symbolValue,
      ACCOUNT_ID_FUTURES,
      String(orderData?.orderId || ''),
      orderTypeValue,
      entryOrderStatus,
      slRounded,
      tpRounded,
      protectionStatus,
      protectionStatus === 'PLACED' ? 'BINANCE' : null,
      checklistConfirmedValue,
      checklistCheckedCountValue,
      checklistTotalValue,
      JSON.stringify(checklistMissingValue),
      checklistTimestampValue,
      tesis || null,
      session?.mental_state || null,
      effectiveRisk.valid ? effectiveRisk.riskAmount : null,
      effectiveRisk.valid ? effectiveRisk.riskPct : null,
      effectiveRisk.valid ? effectiveRisk.rrEstimated : null,
      setupTagValue || null,
      timeframeValue || null,
      zonaEntradaValue || null,
      tendenciaMacroValue || null,
      contextoMercadoValue || null,
      volatilidadValue || null,
      tipoLiquidezValue || null,
      estadoDeltaValue || null,
      volumenEstadoValue || null,
      absorcionDetectadaValue,
      emocionEntradaValue || null,
      protectionRequired,
      protectionSetAt,
      protectionEndpoint,
      protectionError,
    ]);

    const tradeId = tradeRes.rows[0].id;

    if (chatSessionId) {
      await query(
        `UPDATE react_chat_sessions
         SET trade_id = $1,
             pending_limit_order_id = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [tradeId, chatSessionId]
      );
    }

    if (effectiveRisk.valid && (effectiveRisk.rrEstimated || 0) < 1.5) {
      await sendTelegramText(
        `📊 <b>Trade #${tradeId} con R:R bajo</b>\n` +
        `${symbolValue} ${direction}\n` +
        `R:R estimado: <b>${(effectiveRisk.rrEstimated || 0).toFixed(2)}</b>\n` +
        `Evalúa si el setup realmente compensa el riesgo.`
      );
    }

    return NextResponse.json({
      success: true,
      tradeId,
      orderType: orderTypeValue,
      entryOrderStatus,
      requiresPostProtection: orderTypeValue === 'MARKET' && protectionRequired,
      details: {
        symbol: symbolValue,
        direction,
        price: executedPrice,
        qty,
        leverage: leverageNum,
        margin: marginNum,
        stopLoss: slRounded,
        takeProfit: tpRounded,
      },
      protection: {
        status: protectionStatus,
        required: protectionRequired,
        endpoint: protectionEndpoint,
        fallbackUsed: protectionFallbackUsed,
        error: protectionError,
      },
      risk: {
        amount: effectiveRisk.valid ? effectiveRisk.riskAmount : null,
        percent: effectiveRisk.valid ? effectiveRisk.riskPct : null,
        rrEstimated: effectiveRisk.valid ? effectiveRisk.rrEstimated : null,
      },
      rawOrder: {
        orderId: orderData?.orderId || null,
        clientOrderId: orderData?.clientOrderId || null,
        status: orderData?.status || null,
      },
    });
  } catch (error: any) {
    console.error('Open Position Error:', error);
    return NextResponse.json({
      error: error?.message || 'Error abriendo posición',
      code: error instanceof BinanceFuturesError ? error.binanceCode : null,
    }, { status: 500 });
  }
}
