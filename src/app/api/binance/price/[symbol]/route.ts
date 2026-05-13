import { NextResponse } from 'next/server';

const BASE_URL = 'https://fapi.binance.com';

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = String(params.symbol || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{6,20}$/.test(symbol)) {
      return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 });
    }

    const res = await fetch(`${BASE_URL}/fapi/v1/ticker/price?symbol=${symbol}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.price) {
      return NextResponse.json({ error: 'No se pudo obtener precio de Binance' }, { status: 502 });
    }

    return NextResponse.json({ symbol, price: Number(data.price) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error de precio Binance' }, { status: 500 });
  }
}
