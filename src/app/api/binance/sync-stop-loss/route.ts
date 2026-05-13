import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';

const BASE_URL = 'https://fapi.binance.com';
const BINANCE_FUTURES_API_KEY = process.env.BINANCE_FUTURES_API_KEY || '';
const BINANCE_FUTURES_API_SECRET = process.env.BINANCE_FUTURES_API_SECRET || '';

function sign(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function binanceSignedFetch(path: string, params: Record<string, string | number>) {
  const ts = Date.now();
  const qs = new URLSearchParams({ ...params, timestamp: ts.toString() }).toString();
  const signature = sign(qs, BINANCE_FUTURES_API_SECRET);
  const url = `${BASE_URL}${path}?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-MBX-APIKEY': BINANCE_FUTURES_API_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function POST(req: Request) {
  try {
    if (!BINANCE_FUTURES_API_KEY || !BINANCE_FUTURES_API_SECRET) {
      return NextResponse.json({ error: 'Missing Binance Futures API keys' }, { status: 500 });
    }

    const { tradeId } = await req.json();
    if (!tradeId) return NextResponse.json({ error: 'tradeId requerido' }, { status: 400 });

    const tradeRes = await query('SELECT * FROM trades_activos WHERE id = $1', [tradeId]);
    if (tradeRes.rowCount === 0) return NextResponse.json({ error: 'Trade no encontrado' }, { status: 404 });

    const trade = tradeRes.rows[0];
    const symbol = trade.simbolo;

    const [orders, algoOrders] = await Promise.all([
      binanceSignedFetch('/fapi/v1/openOrders', { symbol }),
      binanceSignedFetch('/fapi/v1/algoOpenOrders', { symbol }).catch(() => []),
    ]);

    const existingSL = Array.isArray(orders)
      ? orders.find((o: any) => o.type === 'STOP_MARKET' || o.type === 'STOP')
      : null;
    const existingTP = Array.isArray(orders)
      ? orders.find((o: any) => o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT')
      : null;

    const existingAlgoSL = Array.isArray(algoOrders)
      ? algoOrders.find((o: any) => {
          const t = String(o?.type || o?.orderType || '').toUpperCase();
          return t === 'STOP_MARKET' || t === 'STOP';
        })
      : null;
    const existingAlgoTP = Array.isArray(algoOrders)
      ? algoOrders.find((o: any) => {
          const t = String(o?.type || o?.orderType || '').toUpperCase();
          return t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT';
        })
      : null;

    const slValue = Number(existingSL?.stopPrice || existingAlgoSL?.stopPrice || existingAlgoSL?.triggerPrice || 0);
    const tpValue = Number(existingTP?.stopPrice || existingAlgoTP?.stopPrice || existingAlgoTP?.triggerPrice || 0);

    if (!(slValue > 0) && !(tpValue > 0)) {
      await query(
        `UPDATE trades_activos
         SET sl_status = 'NONE',
             take_profit = NULL
         WHERE id = $1`,
        [tradeId]
      );
      return NextResponse.json({ success: true, found: false, stop_loss: null, take_profit: null });
    }

    await query(
      `UPDATE trades_activos
       SET stop_loss = CASE WHEN $1 > 0 THEN $1 ELSE stop_loss END,
           take_profit = CASE WHEN $2 > 0 THEN $2 ELSE take_profit END,
           sl_original = CASE WHEN $1 > 0 THEN COALESCE(sl_original, $1) ELSE sl_original END,
           sl_move_direction = COALESCE(sl_move_direction, 'not_moved'),
           sl_status = 'SYNCED',
           sl_source = $4
       WHERE id = $3`,
      [
        slValue > 0 ? slValue : null,
        tpValue > 0 ? tpValue : 0,
        tradeId,
        (existingSL || existingTP) ? 'BINANCE' : 'BINANCE_ALGO',
      ]
    );

    return NextResponse.json({
      success: true,
      found: slValue > 0 || tpValue > 0,
      stop_loss: slValue > 0 ? slValue : null,
      take_profit: tpValue > 0 ? tpValue : null,
    });
  } catch (err: any) {
    console.error('[SYNC-SL] Error:', err);
    return NextResponse.json({ error: err.message || 'Error desconocido' }, { status: 500 });
  }
}
