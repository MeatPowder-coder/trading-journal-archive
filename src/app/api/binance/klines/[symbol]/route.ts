import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://fapi.binance.com';
const VALID_INTERVALS = new Set([
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w', '1M',
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = String(params.symbol || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{6,20}$/.test(symbol)) {
      return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 });
    }

    const intervalRaw = String(req.nextUrl.searchParams.get('interval') || '5m').trim();
    const interval = VALID_INTERVALS.has(intervalRaw) ? intervalRaw : '5m';

    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 120);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(20, Math.min(500, Math.floor(limitRaw)))
      : 120;

    const response = await fetch(`${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const data = await response.json().catch(() => []);

    if (!response.ok || !Array.isArray(data)) {
      return NextResponse.json({ error: 'No se pudo obtener velas de Binance Futures' }, { status: 502 });
    }

    const candles = data
      .map((k: any[]) => ({
        openTime: Number(k?.[0] || 0),
        open: Number(k?.[1] || 0),
        high: Number(k?.[2] || 0),
        low: Number(k?.[3] || 0),
        close: Number(k?.[4] || 0),
        volume: Number(k?.[5] || 0),
        closeTime: Number(k?.[6] || 0),
      }))
      .filter((k: any) => Number.isFinite(k.openTime) && Number.isFinite(k.open) && Number.isFinite(k.high) && Number.isFinite(k.low) && Number.isFinite(k.close));

    return NextResponse.json({
      symbol,
      interval,
      candles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error obteniendo velas' }, { status: 500 });
  }
}
