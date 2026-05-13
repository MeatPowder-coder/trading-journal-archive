import { NextRequest, NextResponse } from 'next/server';
import { setTradeProtectionControlled, StopLossMoveError } from '@/lib/trading/stop-loss';

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const tradeId = toNumber(body?.tradeId);
    const stopLoss = toNumber(body?.stopLoss);
    const takeProfit = body?.takeProfit !== undefined && body?.takeProfit !== null
      ? toNumber(body.takeProfit)
      : null;

    if (!Number.isInteger(tradeId) || tradeId <= 0) {
      return NextResponse.json({ error: 'tradeId inválido' }, { status: 400 });
    }

    if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
      return NextResponse.json({ error: 'stopLoss inválido' }, { status: 400 });
    }

    if (takeProfit !== null && (!Number.isFinite(takeProfit) || takeProfit <= 0)) {
      return NextResponse.json({ error: 'takeProfit inválido' }, { status: 400 });
    }

    const result = await setTradeProtectionControlled({
      tradeId,
      stopLoss,
      takeProfit,
      source: typeof body?.source === 'string' ? body.source : 'UI_POST_ENTRY',
      overrideRiskIncrease: Boolean(body?.overrideRiskIncrease),
      overrideReason: typeof body?.overrideReason === 'string' ? body.overrideReason : null,
      actor: {
        type: 'ui',
        id: typeof body?.actorId === 'string' ? body.actorId : null,
      },
      action: 'SET_PROTECTION',
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof StopLossMoveError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details || null,
        },
        { status: error.status }
      );
    }

    console.error('[SET_PROTECTION] Unexpected error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Error estableciendo protección',
        code: 'SET_PROTECTION_UNKNOWN_ERROR',
      },
      { status: 500 }
    );
  }
}
