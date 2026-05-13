import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  cancelPendingLimitOrderControlled,
  PendingLimitOrderError,
} from '@/lib/trading/pending-limit-orders';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const body = await req.json().catch(() => ({}));

    const directPendingId = Number(body?.pendingOrderId || body?.orderId || body?.id);
    const legacyTradeId = Number(body?.tradeId || 0);

    let pendingOrderId = Number.isInteger(directPendingId) && directPendingId > 0
      ? directPendingId
      : NaN;

    if (!Number.isInteger(pendingOrderId) || pendingOrderId <= 0) {
      if (!(Number.isInteger(legacyTradeId) && legacyTradeId > 0)) {
        return NextResponse.json(
          { error: 'Debes enviar pendingOrderId (o tradeId para compatibilidad).' },
          { status: 400 }
        );
      }

      const lookup = await query(
        `SELECT id
         FROM pending_limit_orders
         WHERE id = $1
            OR legacy_trade_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [legacyTradeId]
      );

      if (!lookup.rows.length) {
        return NextResponse.json(
          { error: 'Orden LIMIT pendiente no encontrada.' },
          { status: 404 }
        );
      }

      pendingOrderId = Number(lookup.rows[0].id);
    }

    const result = await cancelPendingLimitOrderControlled({
      pendingOrderId,
      source: typeof body?.source === 'string' ? body.source : 'API_TRADES_ALIAS',
      actorType: session ? 'user' : 'system',
      actorId: session?.userId || null,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    });

    return NextResponse.json({
      success: true,
      deprecatedAlias: true,
      pendingOrderId,
      exchangeStatus: result.exchangeStatus,
      pendingOrder: result.pendingOrder,
      removedFromDatabase: false,
    });
  } catch (error: any) {
    console.error('[CANCEL_PENDING_LIMIT_ALIAS] Error:', error);

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

    return NextResponse.json(
      { error: error?.message || 'Error cancelando orden LIMIT pendiente' },
      { status: 500 }
    );
  }
}
