import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  calculateAndPersistRrMetrics,
  recomputeConsecutiveLossRule,
  sendDailySummaryIfEligible,
} from '@/lib/trading/discipline';

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const tradeId = toNumber(body.tradeId);
    const exitPrice = toNumber(body.exitPrice);
    const closeNotes = typeof body.closeNotes === 'string' ? body.closeNotes.trim() : '';
    const learningNotes = typeof body.learningNotes === 'string' ? body.learningNotes.trim() : null;
    const closeRating = toNumber(body.closeRating);
    const slMoveReflection = typeof body.slMoveReflection === 'string' ? body.slMoveReflection.trim() : null;
    const closedAt = body.closedAt ? new Date(body.closedAt) : new Date();

    const maxAdverseExcursion = body.maxAdverseExcursion !== undefined && body.maxAdverseExcursion !== null
      ? toNumber(body.maxAdverseExcursion)
      : null;

    const maxFavorableExcursion = body.maxFavorableExcursion !== undefined && body.maxFavorableExcursion !== null
      ? toNumber(body.maxFavorableExcursion)
      : null;

    if (!Number.isInteger(tradeId) || tradeId <= 0) {
      return NextResponse.json({ error: 'tradeId inválido' }, { status: 400 });
    }

    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      return NextResponse.json({ error: 'Precio de salida inválido' }, { status: 400 });
    }

    if (closeNotes.length < 20) {
      return NextResponse.json({ error: 'Las notas de cierre deben tener al menos 20 caracteres.' }, { status: 400 });
    }

    if (!Number.isInteger(closeRating) || closeRating < 1 || closeRating > 5) {
      return NextResponse.json({ error: 'La calificación debe estar entre 1 y 5.' }, { status: 400 });
    }

    const tradeRes = await query(
      `SELECT id, estado, sl_was_moved
       FROM trades_activos
       WHERE id = $1
       LIMIT 1`,
      [tradeId]
    );

    if (!tradeRes.rows.length) {
      return NextResponse.json({ error: 'Trade no encontrado' }, { status: 404 });
    }

    const trade = tradeRes.rows[0];

    if (String(trade.estado).toUpperCase() !== 'OPEN') {
      return NextResponse.json({ error: 'Solo puedes cerrar trades con estado OPEN' }, { status: 400 });
    }

    if (trade.sl_was_moved && (!slMoveReflection || slMoveReflection.length < 10)) {
      return NextResponse.json({
        error: 'Se detectó movimiento de SL. Debes escribir qué pensabas cuando lo moviste (mínimo 10 caracteres).',
      }, { status: 400 });
    }

    await query(
      `UPDATE trades_activos
       SET estado = 'CLOSED',
           precio_salida = $2,
           fecha_cierre = $3,
           notas_cierre = $4,
           notas_aprendizaje = COALESCE($5, notas_aprendizaje),
           close_rating = $6,
           sl_move_reflection = CASE
             WHEN sl_was_moved = true THEN COALESCE($7, sl_move_reflection)
             ELSE sl_move_reflection
           END,
           max_adverse_excursion = COALESCE($8, max_adverse_excursion),
           max_favorable_excursion = COALESCE($9, max_favorable_excursion)
       WHERE id = $1`,
      [
        tradeId,
        exitPrice,
        closedAt.toISOString(),
        closeNotes,
        learningNotes,
        closeRating,
        slMoveReflection,
        Number.isFinite(maxAdverseExcursion) ? maxAdverseExcursion : null,
        Number.isFinite(maxFavorableExcursion) ? maxFavorableExcursion : null,
      ]
    );

    const [metrics, streakInfo, dailySummary] = await Promise.all([
      calculateAndPersistRrMetrics(tradeId),
      recomputeConsecutiveLossRule({ date: closedAt }),
      sendDailySummaryIfEligible(closedAt),
    ]);

    await query(
      `UPDATE trades_activos
       SET consecutive_losses_snapshot = $2
       WHERE id = $1`,
      [tradeId, streakInfo.consecutiveLosses]
    );

    const refreshed = await query(
      `SELECT id, estado, precio_salida, pnl_realizado, fecha_cierre, rr_estimated, rr_actual, rr_max_possible
       FROM trades_activos
       WHERE id = $1`,
      [tradeId]
    );

    return NextResponse.json({
      success: true,
      trade: refreshed.rows[0],
      metrics,
      streak: streakInfo,
      dailySummary,
    });
  } catch (error: any) {
    console.error('[TRADE CLOSE] Error:', error);
    return NextResponse.json({ error: error.message || 'Error cerrando trade' }, { status: 500 });
  }
}
