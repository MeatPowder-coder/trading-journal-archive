import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { resolveDesktopAccessContext } from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';
import {
  getLatestAccountBalanceUsdt,
  getMaxRiskAmount,
  getTodayTradingSession,
  isTradingBlockedNow,
} from '@/lib/trading/discipline';

export async function GET(req: NextRequest) {
  try {
    const access = await resolveDesktopAccessContext(req);
    if (!access) {
      return withDesktopCors(req, { error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const [balanceUsdt, blockInfo, session, openTrades, pendingOrders, recentTrades] = await Promise.all([
      getLatestAccountBalanceUsdt(),
      isTradingBlockedNow(now),
      getTodayTradingSession(now),
      query(
        `SELECT id, simbolo, direccion, estado, broker, exchange_type,
                precio_entrada, stop_loss, take_profit, sl_status, sl_was_moved,
                apalancamiento, monto_margin, risk_amount_usdt, risk_percent,
                rr_estimated, protection_required, protection_last_error,
                entry_order_status, order_type, fecha_apertura
         FROM trades_activos
         WHERE estado = 'OPEN'
         ORDER BY fecha_apertura DESC, id DESC
         LIMIT 40`
      ),
      query(
        `SELECT id, simbolo, direccion, order_status, broker, exchange_type,
                entry_price, stop_loss, take_profit, margin, leverage,
                checklist_confirmed, checklist_checked_count, checklist_total,
                created_at, updated_at, screenshot_url, setup_tag, timeframe
         FROM pending_limit_orders
         WHERE order_status IN ('NEW', 'PARTIALLY_FILLED')
         ORDER BY created_at DESC, id DESC
         LIMIT 40`
      ).catch(() => ({ rows: [] as any[] })),
      query(
        `SELECT to_jsonb(t) AS trade
         FROM trades_activos t
         ORDER BY t.id DESC
         LIMIT 600`
      ).catch(() => ({ rows: [] as any[] })),
    ]);

    return withDesktopCors(req, {
      success: true,
      user: {
        id: access.userId,
        email: access.email,
        name: access.name,
      },
      asOf: now.toISOString(),
      account: {
        balanceUsdt,
        maxRisk: getMaxRiskAmount(balanceUsdt),
      },
      discipline: {
        blocked: blockInfo.blocked,
        blockedUntil: blockInfo.blockedUntil,
        remainingSeconds: blockInfo.remainingSeconds,
        session,
      },
      openTrades: openTrades.rows,
      pendingOrders: pendingOrders.rows,
      recentTrades: recentTrades.rows.map((row: any) => row.trade || {}),
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error obteniendo cockpit desktop' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
