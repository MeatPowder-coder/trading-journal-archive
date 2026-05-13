import { NextResponse } from 'next/server';
import crypto from 'crypto';

const BINANCE_FUTURES_API_KEY = process.env.BINANCE_FUTURES_API_KEY;
const BINANCE_FUTURES_API_SECRET = process.env.BINANCE_FUTURES_API_SECRET;
const BASE_URL = "https://fapi.binance.com";

const sign = (queryString: string, secret: string) => {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
};

export async function POST(req: Request) {
  try {
    const { symbol } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    if (!BINANCE_FUTURES_API_KEY || !BINANCE_FUTURES_API_SECRET) {
      return NextResponse.json({ error: "API Keys missing" }, { status: 500 });
    }

    // 1. Get current position to determine Size and Direction
    const timestamp1 = Date.now();
    const query1 = `symbol=${symbol}&timestamp=${timestamp1}`;
    const signature1 = sign(query1, BINANCE_FUTURES_API_SECRET);
    
    const posRes = await fetch(`${BASE_URL}/fapi/v2/positionRisk?${query1}&signature=${signature1}`, {
      headers: { "X-MBX-APIKEY": BINANCE_FUTURES_API_KEY }
    });

    if (!posRes.ok) {
      const text = await posRes.text();
      return NextResponse.json({ error: `Binance Error (Risk): ${text}` }, { status: posRes.status });
    }

    const posData = await posRes.json();
    const position = Array.isArray(posData) ? posData[0] : posData;
    const qty = Number(position.positionAmt);

    if (qty === 0) {
      return NextResponse.json({ message: "No open position to close" });
    }

    // 2. Determine Side (Opposite to current)
    const side = qty > 0 ? "SELL" : "BUY";
    const absQty = Math.abs(qty);

    // 3. Send Market Order to Close
    const timestamp2 = Date.now();
    // reduceOnly=true ensures we don't open a new position by mistake
    const query2 = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${absQty}&reduceOnly=true&timestamp=${timestamp2}`;
    const signature2 = sign(query2, BINANCE_FUTURES_API_SECRET);

    const orderRes = await fetch(`${BASE_URL}/fapi/v1/order?${query2}&signature=${signature2}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": BINANCE_FUTURES_API_KEY }
    });

    if (!orderRes.ok) {
      const text = await orderRes.text();
      return NextResponse.json({ error: `Binance Error (Order): ${text}` }, { status: orderRes.status });
    }

    const orderData = await orderRes.json();

    return NextResponse.json({ success: true, order: orderData });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
