import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST() {
  try {
    const res = await query(
      `SELECT id FROM trades_activos
       WHERE estado = 'OPEN'
         AND (broker = 'BINANCE_FUTURES')
         AND (stop_loss IS NULL)`
    );

    const ids = res.rows.map((r: any) => r.id);
    const results: any[] = [];

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    for (const id of ids) {
      try {
        const resp = await fetch(`${baseUrl}/api/binance/auto-stop-loss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tradeId: id })
        });
        const data = await resp.json();
        results.push({ id, ok: resp.ok, data });
      } catch (err: any) {
        results.push({ id, ok: false, error: err.message });
      }
    }

    return NextResponse.json({ success: true, count: ids.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error desconocido' }, { status: 500 });
  }
}
