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
      `SELECT to_jsonb(t) AS trade
       FROM trades_activos t
       ORDER BY t.id DESC
       LIMIT $1`,
      [limit]
    );

    return withDesktopCors(req, {
      success: true,
      asOf: new Date().toISOString(),
      total: result.rows.length,
      trades: result.rows.map((row: any) => row.trade || {}),
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
