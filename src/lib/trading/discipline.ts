import { query } from '@/lib/db';
import {
  MENTAL_STATES,
  MENTAL_STATE_LABELS,
  MentalState,
} from '@/lib/trading/mental-states';

export {
  MENTAL_STATES,
  MENTAL_STATE_LABELS,
  type MentalState,
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const MIN_BINANCE_ORDER_USDT = 5;

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getMaxRiskAmount(accountBalance: number) {
  const twoPercent = accountBalance * 0.02;

  if (twoPercent < MIN_BINANCE_ORDER_USDT) {
    return {
      amount: twoPercent,
      warning: `Con $${accountBalance.toFixed(2)} de capital, el 2% es $${twoPercent.toFixed(2)}. Binance requiere mínimo ~$${MIN_BINANCE_ORDER_USDT} por orden. La regla del 2% aplica de forma estricta cuando la cuenta supere ~$250.`,
      blocking: false,
    };
  }

  return {
    amount: twoPercent,
    warning: null as string | null,
    blocking: true,
  };
}

export function computeRiskAndRr(params: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  margin: number;
  leverage: number;
  accountBalance?: number | null;
}) {
  const { direction, entryPrice, stopLoss, takeProfit, margin, leverage, accountBalance } = params;

  const positionValue = margin * leverage;
  const qty = entryPrice > 0 ? positionValue / entryPrice : 0;

  const riskPerUnit = direction === 'LONG'
    ? entryPrice - stopLoss
    : stopLoss - entryPrice;

  const rewardPerUnit = direction === 'LONG'
    ? takeProfit - entryPrice
    : entryPrice - takeProfit;

  if (!(riskPerUnit > 0) || !(rewardPerUnit > 0) || !(qty > 0)) {
    return {
      valid: false,
      riskAmount: 0,
      riskPct: null as number | null,
      rrEstimated: null as number | null,
      positionValue,
      qty,
    };
  }

  const riskAmount = riskPerUnit * qty;
  const riskPct = accountBalance && accountBalance > 0 ? (riskAmount / accountBalance) * 100 : null;
  const rrEstimated = rewardPerUnit / riskPerUnit;

  return {
    valid: true,
    riskAmount,
    riskPct,
    rrEstimated,
    positionValue,
    qty,
  };
}

export function classifySlMovement(params: {
  direction: 'LONG' | 'SHORT';
  originalSL: number;
  newSL: number;
  entryPrice: number;
}) {
  const { direction, originalSL, newSL, entryPrice } = params;

  if (direction === 'LONG') {
    if (newSL < originalSL) return { slMoveDirection: 'risk_increase', riskIncreased: true };
    if (newSL >= entryPrice) return { slMoveDirection: 'breakeven', riskIncreased: false };
    return { slMoveDirection: 'risk_reduction', riskIncreased: false };
  }

  if (newSL > originalSL) return { slMoveDirection: 'risk_increase', riskIncreased: true };
  if (newSL <= entryPrice) return { slMoveDirection: 'breakeven', riskIncreased: false };
  return { slMoveDirection: 'risk_reduction', riskIncreased: false };
}

export async function sendTelegramText(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return null;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      console.warn('[TELEGRAM] sendMessage failed', data);
      return null;
    }

    return Number(data?.result?.message_id || 0) || null;
  } catch (error) {
    console.warn('[TELEGRAM] sendMessage error', error);
    return null;
  }
}

export async function getLatestAccountBalanceUsdt() {
  const snapshot = await query(
    `SELECT balance_usdt
     FROM account_snapshots
     ORDER BY recorded_at DESC
     LIMIT 1`
  );

  if (snapshot.rows.length > 0) {
    return toNumber(snapshot.rows[0].balance_usdt, 0);
  }

  const account = await query(
    `SELECT saldo_actual
     FROM cuentas
     WHERE id = 1
     LIMIT 1`
  );

  if (account.rows.length > 0) {
    return toNumber(account.rows[0].saldo_actual, 0);
  }

  return 0;
}

export async function getTodayTradingSession(date = new Date()) {
  const sessionDate = toIsoDate(date);
  const result = await query(
    `SELECT *
     FROM trading_sessions
     WHERE session_date = $1
     LIMIT 1`,
    [sessionDate]
  );

  return result.rows[0] || null;
}

export async function upsertTodayTradingSession(params: {
  date?: Date;
  mentalState?: MentalState | null;
  rulesConfirmed?: boolean;
  notes?: string | null;
  overrideUsed?: boolean;
}) {
  const {
    date = new Date(),
    mentalState = null,
    rulesConfirmed = false,
    notes = null,
    overrideUsed = false,
  } = params;

  const sessionDate = toIsoDate(date);

  const result = await query(
    `INSERT INTO trading_sessions (session_date, mental_state, rules_confirmed, notes, override_used, session_start, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (session_date) DO UPDATE SET
       mental_state = COALESCE(EXCLUDED.mental_state, trading_sessions.mental_state),
       rules_confirmed = trading_sessions.rules_confirmed OR EXCLUDED.rules_confirmed,
       notes = COALESCE(EXCLUDED.notes, trading_sessions.notes),
       override_used = trading_sessions.override_used OR EXCLUDED.override_used,
       updated_at = NOW()
     RETURNING *`,
    [sessionDate, mentalState, rulesConfirmed, notes, overrideUsed]
  );

  return result.rows[0] || null;
}

export async function isTradingBlockedNow(date = new Date()) {
  const session = await getTodayTradingSession(date);

  if (!session?.blocked_until) {
    return {
      blocked: false,
      remainingSeconds: 0,
      blockedUntil: null as string | null,
      session,
    };
  }

  const blockedUntil = new Date(session.blocked_until);
  if (blockedUntil.getTime() <= date.getTime()) {
    return {
      blocked: false,
      remainingSeconds: 0,
      blockedUntil: session.blocked_until,
      session,
    };
  }

  return {
    blocked: true,
    remainingSeconds: Math.ceil((blockedUntil.getTime() - date.getTime()) / 1000),
    blockedUntil: session.blocked_until,
    session,
  };
}

export async function recomputeConsecutiveLossRule(params: {
  date?: Date;
  cooldownMinutes?: number;
}) {
  const { date = new Date(), cooldownMinutes = 30 } = params;
  const sessionDate = toIsoDate(date);

  const closedToday = await query(
    `SELECT id, pnl_realizado, simbolo, fecha_cierre
     FROM trades_activos
     WHERE estado = 'CLOSED'
       AND fecha_cierre::date = $1
     ORDER BY fecha_cierre DESC NULLS LAST, id DESC
     LIMIT 20`,
    [sessionDate]
  );

  let consecutiveLosses = 0;
  for (const row of closedToday.rows) {
    if (toNumber(row.pnl_realizado, 0) < 0) {
      consecutiveLosses += 1;
      continue;
    }
    break;
  }

  const lastTwo = closedToday.rows.slice(0, 2);
  const hasTwoRecentLosses =
    lastTwo.length === 2 &&
    lastTwo.every((row) => toNumber(row.pnl_realizado, 0) < 0);

  const session = await upsertTodayTradingSession({ date });
  const existingBlockedUntil = session?.blocked_until ? new Date(session.blocked_until) : null;
  const nowMs = date.getTime();

  let nextBlockedUntil: Date | null = null;
  if (hasTwoRecentLosses) {
    nextBlockedUntil = new Date(nowMs + cooldownMinutes * 60 * 1000);
  }

  await query(
    `UPDATE trading_sessions
     SET consecutive_losses_today = $2,
         blocked_until = $3,
         updated_at = NOW()
     WHERE session_date = $1`,
    [sessionDate, consecutiveLosses, nextBlockedUntil ? nextBlockedUntil.toISOString() : null]
  );

  const shouldNotify = Boolean(
    hasTwoRecentLosses &&
    (!existingBlockedUntil || existingBlockedUntil.getTime() <= nowMs)
  );

  if (shouldNotify) {
    const totalLoss = lastTwo.reduce((sum, row) => sum + Math.abs(toNumber(row.pnl_realizado, 0)), 0);
    const symbols = escapeTelegramHtml(lastTwo.map((row) => String(row.simbolo || '')).join(', '));
    await sendTelegramText(
      `🛑 <b>2 pérdidas consecutivas detectadas</b>\n` +
      `Símbolos: <b>${symbols}</b>\n` +
      `Pérdida combinada: <b>-$${totalLoss.toFixed(2)}</b>\n` +
      `Pausa automática activada por <b>${cooldownMinutes} minutos</b>.`
    );
  }

  return {
    consecutiveLosses,
    blocked: hasTwoRecentLosses,
    blockedUntil: nextBlockedUntil ? nextBlockedUntil.toISOString() : null,
    shouldNotify,
  };
}

export async function ensurePreviousLossHasLesson(params: {
  date?: Date;
  threshold?: number;
} = {}) {
  const { date = new Date(), threshold = 3 } = params;
  const sessionDate = toIsoDate(date);

  const res = await query(
    `SELECT id, pnl_realizado, notas_aprendizaje
     FROM trades_activos
     WHERE estado = 'CLOSED'
       AND fecha_cierre::date = $1
     ORDER BY fecha_cierre DESC NULLS LAST, id DESC
     LIMIT 1`,
    [sessionDate]
  );

  if (!res.rows.length) {
    return { required: false, missing: false, tradeId: null as number | null };
  }

  const last = res.rows[0];
  const pnl = toNumber(last.pnl_realizado, 0);
  const lesson = String(last.notas_aprendizaje || '').trim();

  const required = pnl <= -Math.abs(threshold);
  const missing = required && lesson.length < 5;

  return {
    required,
    missing,
    tradeId: Number(last.id),
    pnl,
  };
}

export async function sendDailySummaryIfEligible(date = new Date()) {
  const sessionDate = toIsoDate(date);

  const openTradesRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM trades_activos
     WHERE estado = 'OPEN'`
  );
  const openTrades = Number(openTradesRes.rows[0]?.count || 0);
  if (openTrades > 0) {
    return { sent: false, reason: 'open_trades_exist', openTrades };
  }

  const session = await upsertTodayTradingSession({ date });
  if (session?.daily_summary_sent_at) {
    return { sent: false, reason: 'already_sent', at: session.daily_summary_sent_at };
  }

  const summaryRes = await query(
    `SELECT
        COUNT(*)::int AS trades,
        COUNT(*) FILTER (WHERE pnl_realizado > 0)::int AS wins,
        COUNT(*) FILTER (WHERE pnl_realizado < 0)::int AS losses,
        COALESCE(SUM(pnl_realizado), 0)::numeric AS pnl_total,
        COUNT(*) FILTER (WHERE COALESCE(sl_move_direction, 'not_moved') <> 'risk_increase')::int AS sl_respected,
        COUNT(*) FILTER (WHERE COALESCE(sl_move_direction, 'not_moved') = 'risk_increase')::int AS sl_bad_moves,
        COALESCE(AVG(rr_actual), 0)::numeric AS rr_avg,
        COALESCE(AVG(
          CASE
            WHEN rr_max_possible > 0 THEN (rr_actual / rr_max_possible) * 100
            ELSE NULL
          END
        ), 0)::numeric AS mfe_efficiency
     FROM trades_activos
     WHERE estado = 'CLOSED'
       AND fecha_cierre::date = $1`,
    [sessionDate]
  );

  const summary = summaryRes.rows[0];
  const trades = Number(summary?.trades || 0);
  if (trades === 0) {
    return { sent: false, reason: 'no_trades' };
  }

  const wins = Number(summary.wins || 0);
  const losses = Number(summary.losses || 0);
  const pnlTotal = toNumber(summary.pnl_total, 0);
  const slRespected = Number(summary.sl_respected || 0);
  const rrAvg = toNumber(summary.rr_avg, 0);
  const mfeEfficiency = toNumber(summary.mfe_efficiency, 0);
  const slBadMoves = Number(summary.sl_bad_moves || 0);

  const message =
    `📅 <b>Resumen del día (${sessionDate})</b>\n` +
    `Trades: <b>${trades}</b> | Ganados: <b>${wins}</b> | Perdidos: <b>${losses}</b>\n` +
    `PnL: <b>${pnlTotal >= 0 ? '+' : ''}$${pnlTotal.toFixed(2)}</b>\n` +
    `SL respetados: <b>${slRespected}/${trades}</b>\n` +
    `R:R promedio: <b>${rrAvg.toFixed(2)}</b>\n` +
    `Eficiencia MFE: <b>${mfeEfficiency.toFixed(0)}%</b>\n\n` +
    (slBadMoves > 0
      ? `⚠️ Moviste SL aumentando riesgo <b>${slBadMoves}</b> vez(es).`
      : '✅ Respetaste todos los SL hoy.');

  const messageId = await sendTelegramText(message);
  if (!messageId) {
    return { sent: false, reason: 'telegram_failed' };
  }

  await query(
    `UPDATE trading_sessions
     SET daily_summary_sent_at = NOW(),
         daily_summary_payload = $2::jsonb,
         updated_at = NOW()
     WHERE session_date = $1`,
    [
      sessionDate,
      JSON.stringify({
        messageId,
        trades,
        wins,
        losses,
        pnlTotal,
        slRespected,
        rrAvg,
        mfeEfficiency,
        slBadMoves,
      }),
    ]
  );

  return { sent: true, messageId };
}

export async function calculateAndPersistRrMetrics(tradeId: number) {
  const result = await query(
    `SELECT id,
            direccion,
            t.precio_entrada,
            t.precio_salida,
            t.take_profit,
            t.stop_loss,
            t.sl_original,
            t.max_favorable_excursion,
            t.max_adverse_excursion
     FROM trades_activos t
     WHERE t.id = $1
     LIMIT 1`,
    [tradeId]
  );

  if (!result.rows.length) {
    return null;
  }

  const trade = result.rows[0];

  const entry = toNumber(trade.precio_entrada, 0);
  const exit = toNumber(trade.precio_salida, 0);
  const slBase = toNumber(trade.sl_original ?? trade.stop_loss, 0);
  const tp = toNumber(trade.take_profit, 0);
  const mfe = toNumber(trade.max_favorable_excursion, 0);

  if (!(entry > 0) || !(exit > 0) || !(slBase > 0)) {
    return null;
  }

  const riskPerUnit = Math.abs(entry - slBase);
  if (!(riskPerUnit > 0)) {
    return null;
  }

  const estimatedReward = tp > 0 ? Math.abs(tp - entry) : null;
  const realReward = Math.abs(exit - entry);
  const maxPossibleReward = mfe > 0 ? Math.abs(mfe - entry) : null;

  const rrEstimated = estimatedReward !== null ? estimatedReward / riskPerUnit : null;
  const rrActual = realReward / riskPerUnit;
  const rrMaxPossible = maxPossibleReward !== null ? maxPossibleReward / riskPerUnit : null;

  await query(
    `UPDATE trades_activos
     SET rr_estimated = $2,
         rr_actual = $3,
         rr_max_possible = $4
     WHERE id = $1`,
    [tradeId, rrEstimated, rrActual, rrMaxPossible]
  );

  return {
    rrEstimated,
    rrActual,
    rrMaxPossible,
  };
}
