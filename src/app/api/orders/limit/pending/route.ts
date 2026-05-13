import { NextResponse } from 'next/server';
import { listActivePendingLimitOrders } from '@/lib/trading/pending-limit-orders';

export async function GET() {
  try {
    const orders = await listActivePendingLimitOrders();
    return NextResponse.json({
      success: true,
      orders,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('ECONNREFUSED')) {
      return NextResponse.json({
        success: true,
        orders: [],
        warning: 'DB_UNAVAILABLE',
      });
    }
    console.error('[PENDING_LIMIT_LIST] Error:', error);
    return NextResponse.json(
      { error: message || 'Error listando órdenes LIMIT pendientes' },
      { status: 500 }
    );
  }
}
