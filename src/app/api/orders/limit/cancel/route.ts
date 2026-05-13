import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  cancelPendingLimitOrderControlled,
  getPendingLimitOrderById,
  PendingLimitOrderError,
} from '@/lib/trading/pending-limit-orders';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const body = await req.json().catch(() => ({}));

    const pendingOrderId = Number(body?.pendingOrderId || body?.orderId || body?.id);
    if (!Number.isInteger(pendingOrderId) || pendingOrderId <= 0) {
      return NextResponse.json({ error: 'pendingOrderId inválido' }, { status: 400 });
    }

    const pendingOrder = await getPendingLimitOrderById(pendingOrderId);
    if (!pendingOrder) {
      return NextResponse.json({ error: 'Orden LIMIT pendiente no encontrada' }, { status: 404 });
    }

    const result = await cancelPendingLimitOrderControlled({
      pendingOrderId,
      source: typeof body?.source === 'string' ? body.source : 'UI_LIMIT_CANCEL',
      actorType: session ? 'user' : 'system',
      actorId: session?.userId || null,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    });

    return NextResponse.json({
      success: true,
      pendingOrderId,
      exchangeStatus: result.exchangeStatus,
      pendingOrder: result.pendingOrder,
    });
  } catch (error: any) {
    console.error('[LIMIT_CANCEL] Error:', error);

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
