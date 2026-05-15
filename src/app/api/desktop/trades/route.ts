import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { resolveDesktopAccessContext } from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

function toLimit(raw: string | null) {
  const parsed = Number(raw || '300');
  if (!Number.isFinite(parsed)) return 300;
  return Math.max(30, Math.min(1000, Math.floor(parsed)));
}

export async function GET(req: NextRequest) {
  try {
    const access = await resolveDesktopAccessContext(req);
    if (!access) {
      return withDesktopCors(req, { error: 'Unauthorized' }, { status: 401 });
    }

    const limit = toLimit(req.nextUrl.searchParams.get('limit'));
    const result = await query(
      `SELECT id, simbolo, precio_entrada, precio_salida, pnl_realizado, pnl_bruto, comision,
              estado, direccion, apalancamiento, ticker_api, broker, fecha_apertura, fecha_cierre,
              monto_margin, cuenta_id, tipo_estrategia, screenshot_url, nombre_jugada, setup_tag,
              timeframe, emocion_entrada, zona_entrada, tendencia_macro, contexto_mercado,
              volatilidad, tipo_liquidez, estado_delta, volumen_estado, absorcion_detectada,
              calificacion_personal, notas_aprendizaje, notas_cierre, stop_loss, take_profit,
              sl_original, sl_was_moved, sl_move_direction, sl_move_count, max_adverse_excursion,
              max_favorable_excursion, rr_estimated, rr_actual, rr_max_possible,
              checklist_confirmed, checklist_timestamp, entry_tesis, session_mental_state,
              close_rating, sl_move_reflection, risk_amount_usdt, risk_percent,
              consecutive_losses_snapshot, order_type, entry_order_status
       FROM trades_activos
       ORDER BY id DESC
       LIMIT $1`,
      [limit]
    );

    return withDesktopCors(req, {
      success: true,
      asOf: new Date().toISOString(),
      total: result.rows.length,
      trades: result.rows,
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error obteniendo trades desktop' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
