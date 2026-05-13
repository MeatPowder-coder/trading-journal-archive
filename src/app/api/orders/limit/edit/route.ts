import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  editPendingLimitOrderControlled,
  PendingLimitOrderError,
} from '@/lib/trading/pending-limit-orders';
import { BinanceFuturesError } from '@/lib/trading/binance-futures';

function toNumber(value: unknown, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const body = await req.json().catch(() => ({}));

    const pendingOrderId = Number(body?.pendingOrderId || body?.orderId || body?.id);
    const entryPrice = toNumber(body?.entryPrice, NaN);
    const stopLoss = toNumber(body?.stopLoss, NaN);
    const takeProfit = toNumber(body?.takeProfit, NaN);
    const margin = toNumber(body?.margin, NaN);
    const leverage = toNumber(body?.leverage, NaN);

    if (!Number.isInteger(pendingOrderId) || pendingOrderId <= 0) {
      return NextResponse.json({ error: 'pendingOrderId inválido' }, { status: 400 });
    }

    const result = await editPendingLimitOrderControlled({
      pendingOrderId,
      entryPrice,
      stopLoss,
      takeProfit: Number.isFinite(takeProfit) && takeProfit > 0 ? takeProfit : null,
      margin,
      leverage,
      overrideRiskIncrease: Boolean(body?.overrideRiskIncrease),
      overrideReason: typeof body?.overrideReason === 'string' ? body.overrideReason : null,
      source: typeof body?.source === 'string' ? body.source : 'UI_LIMIT_EDIT',
      actorType: session ? 'user' : 'system',
      actorId: session?.userId || null,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[LIMIT_EDIT] Error:', error);

    if (error instanceof PendingLimitOrderError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details || null,
        },
        { status: error.status || 400 }
      );
    }

    if (error instanceof BinanceFuturesError) {
      return NextResponse.json(
        {
          error: error.binanceMessage || error.message,
          code: error.binanceCode,
          details: {
            path: error.path,
            method: error.method,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Error editando orden LIMIT pendiente' },
      { status: 500 }
    );
  }
}
