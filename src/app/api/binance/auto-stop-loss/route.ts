import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { placeProtectiveOrderWithFallback, recordProtectionAudit } from '@/lib/trading/binance-futures';

const BASE_URL = 'https://fapi.binance.com';
const BINANCE_FUTURES_API_KEY = process.env.BINANCE_FUTURES_API_KEY || '';
const BINANCE_FUTURES_API_SECRET = process.env.BINANCE_FUTURES_API_SECRET || '';

const MIN_SL_PCT = 0.5;
const MAX_SL_PCT = 10;
const DEFAULT_TIMEFRAME = '5m';
const KLINES_LIMIT = 200;

function sign(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function binanceSignedFetch(path: string, params: Record<string, string | number>, method: 'GET' | 'POST' = 'GET') {
  const ts = Date.now();
  const qs = new URLSearchParams({ ...params, timestamp: ts.toString() }).toString();
  const signature = sign(qs, BINANCE_FUTURES_API_SECRET);
  const url = `${BASE_URL}${path}?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': BINANCE_FUTURES_API_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance error ${res.status}: ${text}`);
  }

  return res.json();
}

async function fetchKlines(symbol: string, interval = DEFAULT_TIMEFRAME) {
  const url = `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${KLINES_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Klines error ${res.status}`);
  const data = await res.json();
  return data as any[];
}

function computeStructureSL(klines: any[], direction: string) {
  if (!Array.isArray(klines) || klines.length < 5) return null;
  const recent = klines.slice(-21, -1); // last 20 excluding current
  const lows = recent.map(k => Number(k[3])).filter(n => !isNaN(n));
  const highs = recent.map(k => Number(k[2])).filter(n => !isNaN(n));
  if (direction === 'LONG') return Math.min(...lows);
  if (direction === 'SHORT') return Math.max(...highs);
  return null;
}

function clampStopLoss(entry: number, direction: string, sl: number) {
  if (!entry || !sl) return sl;
  let distPct = 0;
  if (direction === 'LONG') distPct = ((entry - sl) / entry) * 100;
  if (direction === 'SHORT') distPct = ((sl - entry) / entry) * 100;

  if (distPct < MIN_SL_PCT) {
    return direction === 'LONG'
      ? entry * (1 - MIN_SL_PCT / 100)
      : entry * (1 + MIN_SL_PCT / 100);
  }

  if (distPct > MAX_SL_PCT) {
    return direction === 'LONG'
      ? entry * (1 - MAX_SL_PCT / 100)
      : entry * (1 + MAX_SL_PCT / 100);
  }

  return sl;
}

async function loadTradeScreenshot(url?: string | null) {
  if (!url) return null;
  if (url.startsWith('/uploads/')) {
    const path = join(process.cwd(), 'public', url);
    return readFile(path);
  }
  if (url.startsWith('http')) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  }
  return null;
}

async function proposeAiStopLoss(params: {
  symbol: string;
  direction: string;
  entry: number;
  klines: any[];
  screenshot?: Buffer | null;
}) {
  const { symbol, direction, entry, klines, screenshot } = params;

  const ohlc = klines.slice(-120).map((k: any) => ({
    t: k[0],
    o: Number(k[1]),
    h: Number(k[2]),
    l: Number(k[3]),
    c: Number(k[4])
  }));

  const prompt = `\nEres un analista de trading institucional.\nPropón un stop loss lógico para ${symbol} (${direction}) con entrada ${entry}.\nUsa estructura (swing, liquidez) y evita stops absurdos.\nDevuelve SOLO JSON válido con forma: {"stop_loss": number, "reason": string, "basis": "structure|swing|volatility"}.\nOHLC (últimas velas): ${JSON.stringify(ohlc)}\n`;

  try {
    const model = google('gemini-3-flash-preview');
    const messages: any[] = [
      {
        role: 'user',
        content: screenshot
          ? [
              { type: 'text', text: prompt },
              { type: 'image', image: screenshot }
            ]
          : prompt
      }
    ];

    const result = await generateText({ model, messages });
    const text = result.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (!parsed?.stop_loss || isNaN(Number(parsed.stop_loss))) return null;

    return {
      stop_loss: Number(parsed.stop_loss),
      reason: String(parsed.reason || 'IA'),
      basis: String(parsed.basis || 'structure')
    };
  } catch (err) {
    console.error('[AUTO-SL] IA error:', err);
    return null;
  }
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
    if (trade.estado !== 'OPEN') {
      return NextResponse.json({ error: 'Trade no está OPEN' }, { status: 400 });
    }
    if ((trade.broker || '').toUpperCase() !== 'BINANCE_FUTURES') {
      return NextResponse.json({ error: 'Trade no es BINANCE_FUTURES' }, { status: 400 });
    }

    const symbol = trade.simbolo;
    const direction = (trade.direccion || '').toUpperCase();

    // 1) Position Risk + Open Orders
    const [position] = await binanceSignedFetch('/fapi/v2/positionRisk', { symbol });
    const orders = await binanceSignedFetch('/fapi/v1/openOrders', { symbol });

    const existingSL = Array.isArray(orders)
      ? orders.find((o: any) => o.type === 'STOP_MARKET' || o.type === 'STOP')
      : null;

    if (existingSL?.stopPrice) {
      await query(
        `UPDATE trades_activos
         SET stop_loss = $1,
             sl_original = COALESCE(sl_original, $1),
             sl_move_direction = COALESCE(sl_move_direction, 'not_moved'),
             sl_status = 'SYNCED',
             sl_source = 'BINANCE'
         WHERE id = $2`,
        [Number(existingSL.stopPrice), tradeId]
      );
      return NextResponse.json({ success: true, mode: 'SYNCED', stop_loss: Number(existingSL.stopPrice) });
    }

    // 2) Fetch OHLC + optional screenshot
    const timeframe = trade.timeframe || DEFAULT_TIMEFRAME;
    const klines = await fetchKlines(symbol, timeframe);
    const screenshot = await loadTradeScreenshot(trade.screenshot_url);

    const entry = Number(trade.precio_entrada || position?.entryPrice || 0);
    const structureSL = computeStructureSL(klines, direction);

    // 3) AI proposal
    const ai = await proposeAiStopLoss({ symbol, direction, entry, klines, screenshot });

    let candidate = ai?.stop_loss || structureSL;
    let reason = ai?.reason || 'STRUCTURE_FALLBACK';

    if (ai?.stop_loss && structureSL) {
      const distAi = Math.abs(entry - ai.stop_loss);
      const distStruct = Math.abs(entry - structureSL);
      if (distAi > distStruct * 1.5) {
        candidate = structureSL;
        reason = `${reason} | Ajuste por estructura`;
      }
    }

    if (!candidate || isNaN(Number(candidate))) {
      return NextResponse.json({ error: 'No se pudo determinar un stop loss válido' }, { status: 500 });
    }

    // Directional sanity
    if (direction === 'LONG' && candidate >= entry) candidate = entry * (1 - MIN_SL_PCT / 100);
    if (direction === 'SHORT' && candidate <= entry) candidate = entry * (1 + MIN_SL_PCT / 100);

    candidate = clampStopLoss(entry, direction, Number(candidate));

    // 4) Place STOP_MARKET order (dual endpoint fallback)
    const side = direction === 'LONG' ? 'SELL' : 'BUY';
    const placed = await placeProtectiveOrderWithFallback({
      symbol,
      side,
      type: 'STOP_MARKET',
      stopPrice: Number(candidate.toFixed(4)),
      closePosition: true,
      workingType: 'MARK_PRICE',
    });

    await recordProtectionAudit({
      tradeId: Number(tradeId),
      symbol,
      action: 'AUTO_STOP_LOSS',
      orderKind: 'SL',
      attemptedEndpoint: placed.endpoint,
      fallbackUsed: placed.fallbackUsed,
      success: true,
      details: {
        orderId: placed?.data?.orderId || null,
        reason,
      },
    });

    await query(
      `UPDATE trades_activos
       SET stop_loss = $1,
           sl_original = COALESCE(sl_original, $1),
           sl_move_direction = COALESCE(sl_move_direction, 'not_moved'),
           sl_status = 'PLACED',
           sl_source = 'AI+STRUCTURE',
           protection_endpoint = $5,
           protection_last_error = NULL,
           protection_required = FALSE,
           protection_set_at = NOW(),
           sl_reason = $2,
           timeframe = $3
       WHERE id = $4`,
      [Number(candidate), reason, timeframe, tradeId, placed.endpoint]
    );

    return NextResponse.json({ success: true, mode: 'PLACED', stop_loss: Number(candidate) });
  } catch (err: any) {
    console.error('[AUTO-SL] Error:', err);
    return NextResponse.json({ error: err.message || 'Error desconocido' }, { status: 500 });
  }
}
