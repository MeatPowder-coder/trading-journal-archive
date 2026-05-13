import { NextRequest, NextResponse } from 'next/server';
import { moveStopLossControlled, StopLossMoveError } from '@/lib/trading/stop-loss';

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const tradeId = toNumber(body?.tradeId);
    const newStopLoss = toNumber(body?.newStopLoss);

    if (!Number.isInteger(tradeId) || tradeId <= 0) {
      return NextResponse.json({ error: 'tradeId inválido' }, { status: 400 });
    }

    if (!Number.isFinite(newStopLoss) || newStopLoss <= 0) {
      return NextResponse.json({ error: 'newStopLoss inválido' }, { status: 400 });
    }

    const result = await moveStopLossControlled({
      tradeId,
      newStopLoss,
      source: typeof body?.source === 'string' ? body.source : 'UI_MODAL',
      overrideRiskIncrease: Boolean(body?.overrideRiskIncrease),
      overrideReason: typeof body?.overrideReason === 'string' ? body.overrideReason : null,
      actor: {
        type: 'ui',
        id: typeof body?.actorId === 'string' ? body.actorId : null,
      },
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

    console.error('[MOVE_STOP_LOSS] Unexpected error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Error moviendo Stop Loss',
        code: 'MOVE_SL_UNKNOWN_ERROR',
      },
      { status: 500 }
    );
  }
}
