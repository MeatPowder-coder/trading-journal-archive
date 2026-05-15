import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthSession } from '@/lib/auth';
import { calculateAndPersistRrMetrics, recomputeConsecutiveLossRule, sendDailySummaryIfEligible } from '@/lib/trading/discipline';
import { ensureFuturesCredentials, futuresSignedRequest } from '@/lib/trading/binance-futures';

/**
 * pnl_realizado is GENERATED ALWAYS:
 *   pnl_realizado = ((precio_salida - precio_entrada) / precio_entrada * margin * lev) - comision
 *
 * We can't write it directly. We solve for precio_salida that makes the formula give targetNetPnl:
 *   LONG:  precio_salida = precio_entrada * (1 + (targetNetPnl + comision) / (margin * lev))
 *   SHORT: precio_salida = precio_entrada * (1 - (targetNetPnl + comision) / (margin * lev))
 */
function impliedExitPrice(
    targetNetPnl: number,
    comisionInDb: number,
    entryPrice: number,
    margin: number,
    leverage: number,
    direction: string
): number {
    const positionValue = margin * leverage;
    if (positionValue === 0 || entryPrice === 0) return 0;
    const pct = (targetNetPnl + comisionInDb) / positionValue;
    return direction.toUpperCase() === 'LONG'
        ? entryPrice * (1 + pct)
        : entryPrice * (1 - pct);
}

/**
 * POST /api/binance/sync
 * Body: { tradeId: number }
 *
 * Fetches Binance income/REALIZED_PNL events filtered to the specific trade's time window,
 * then back-calculates an implied precio_salida so the DB generated column produces
 * the correct pnl_realizado.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getAuthSession();
        if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        try {
            ensureFuturesCredentials();
        } catch {
            return NextResponse.json({ error: 'Binance API keys not configured' }, { status: 500 });
        }

        const body = await req.json().catch(() => ({}));
        const tradeId = body?.tradeId ? Number(body.tradeId) : null;

        if (!tradeId || isNaN(tradeId)) {
            return NextResponse.json({ error: 'Se requiere tradeId en el body.' }, { status: 400 });
        }

        // 1. Fetch the trade from DB
        const dbResult = await query(
            `SELECT id, simbolo, precio_entrada, precio_salida, monto_margin, apalancamiento,
                    direccion, estado, comision, fecha_apertura, fecha_cierre
             FROM trades_activos
             WHERE id = $1 AND broker = 'BINANCE_FUTURES'`,
            [tradeId]
        );

        if (!dbResult.rows.length) {
            return NextResponse.json({
                error: `Trade #${tradeId} no encontrado o no es de BINANCE_FUTURES.`
            }, { status: 404 });
        }

        const trade = dbResult.rows[0];

        // 2. Build time window for filtering (trade open → trade close or now)
        const startMs = trade.fecha_apertura
            ? new Date(trade.fecha_apertura).getTime()
            : Date.now() - 7 * 24 * 60 * 60 * 1000; // fallback: last 7 days
        const endMs = trade.fecha_cierre
            ? new Date(trade.fecha_cierre).getTime() + 5000 // +5s buffer
            : Date.now();

        // 3. Fetch income events filtered by the trade's time window
        //    - REALIZED_PNL = gross PnL from price movement  
        //    - COMMISSION   = trading fees paid
        const fetchIncome = async (incomeType: string) => {
            const events: any[] = await futuresSignedRequest('/fapi/v1/income', {
                symbol: trade.simbolo,
                incomeType,
                startTime: startMs,
                endTime: endMs,
                limit: 100,
            }, 'GET');
            return events.reduce((sum: number, e: any) => sum + Number(e.income || 0), 0);
        };

        const grossPnl = await fetchIncome('REALIZED_PNL');  // e.g. -5.75 (price move, no fees)
        const commissionRaw = await fetchIncome('COMMISSION'); // e.g. -0.25 (negative in Binance)
        const totalCommission = Math.abs(commissionRaw);       // store as positive in DB
        const totalNetPnl = grossPnl - totalCommission;        // e.g. -5.75 - 0.25 = -6.00

        if (grossPnl === 0 && totalCommission === 0) {
            return NextResponse.json({
                success: false,
                message: `No se encontraron eventos de PnL en Binance para ${trade.simbolo} en el período del trade.`,
            });
        }

        // 4. Get the exit price timestamp from last fill
        const userTrades: any[] = await futuresSignedRequest('/fapi/v1/userTrades', {
            symbol: trade.simbolo,
            startTime: startMs,
            endTime: endMs,
            limit: 100,
        }, 'GET');
        const lastFill = userTrades.length > 0 ? userTrades[userTrades.length - 1] : null;
        const closedAt = lastFill
            ? new Date(Number(lastFill.time)).toISOString()
            : new Date(endMs).toISOString();

        // 5. Back-calculate implied exit price so the DB formula gives the correct pnl_realizado
        //    DB formula: pnl_realizado = ((precio_salida - precio_entrada) / precio_entrada * margin * lev) - comision
        //    We set comision = totalCommission in DB, and need pnl_bruto = grossPnl.
        //    Solving for precio_salida given pnl_bruto:
        //    LONG:  precio_salida = precio_entrada * (1 + grossPnl / (margin * lev))
        //    SHORT: precio_salida = precio_entrada * (1 - grossPnl / (margin * lev))
        const margin = Number(trade.monto_margin);
        const leverage = Number(trade.apalancamiento);
        const entryPrice = Number(trade.precio_entrada);

        let exitPriceToUse: number | null = null;
        if (margin > 0 && leverage > 0 && entryPrice > 0) {
            const positionValue = margin * leverage;
            const pct = grossPnl / positionValue;
            exitPriceToUse = trade.direccion.toUpperCase() === 'LONG'
                ? entryPrice * (1 + pct)
                : entryPrice * (1 - pct);
        }

        if (!exitPriceToUse || isNaN(exitPriceToUse) || exitPriceToUse <= 0) {
            return NextResponse.json({
                success: false,
                binance_pnl: totalNetPnl,
                message: `No se pudo calcular precio de salida (datos del trade insuficientes).`,
            });
        }

        // 6. Update trade: comision + precio_salida → triggers correct pnl_bruto and pnl_realizado
        await query(
            `UPDATE trades_activos
             SET estado        = 'CLOSED',
                 precio_salida = $1,
                 comision      = $2,
                 fecha_cierre  = COALESCE(fecha_cierre, $3)
             WHERE id = $4`,
            [exitPriceToUse, totalCommission, closedAt, tradeId]
        );

        const [metrics, streakInfo, dailySummary] = await Promise.all([
            calculateAndPersistRrMetrics(tradeId),
            recomputeConsecutiveLossRule({ date: new Date(closedAt) }),
            sendDailySummaryIfEligible(new Date(closedAt)),
        ]);

        await query(
            `UPDATE trades_activos
             SET consecutive_losses_snapshot = $2
             WHERE id = $1`,
            [tradeId, streakInfo.consecutiveLosses]
        );

        return NextResponse.json({
            success: true,
            tradeId,
            gross_pnl: grossPnl,
            commission: totalCommission,
            net_pnl: totalNetPnl,
            metrics,
            streak: streakInfo,
            dailySummary,
            message: `Trade #${tradeId} sincronizado. PnL neto: ${totalNetPnl >= 0 ? '+' : ''}${totalNetPnl.toFixed(2)} USDT (bruto: ${grossPnl.toFixed(2)}, comisión: ${totalCommission.toFixed(2)})`,
        });

    } catch (err: any) {
        console.error('[SYNC] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
