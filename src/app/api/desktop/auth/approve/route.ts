import { NextRequest } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

function normalizePairingCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthSession();
    if (!auth) {
      return withDesktopCors(req, { error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const pairingCode = normalizePairingCode(body?.pairingCode);
    if (!pairingCode) {
      return withDesktopCors(req, { error: 'pairingCode requerido' }, { status: 400 });
    }

    const found = await query(
      `SELECT id, pairing_id, status, expires_at
       FROM desktop_device_sessions
       WHERE pairing_code = $1
       LIMIT 1`,
      [pairingCode]
    );

    if (!found.rows.length) {
      return withDesktopCors(req, { error: 'Pairing code no encontrado' }, { status: 404 });
    }

    const row = found.rows[0];
    const status = String(row.status || '').toUpperCase();
    const now = Date.now();
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;

    if (status === 'REVOKED' || status === 'EXPIRED') {
      return withDesktopCors(req, { error: `Pairing code ${status.toLowerCase()}` }, { status: 410 });
    }

    if (expiresAt > 0 && expiresAt <= now) {
      await query(
        `UPDATE desktop_device_sessions
         SET status = 'EXPIRED',
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      return withDesktopCors(req, { error: 'Pairing code expirado' }, { status: 410 });
    }

    if (status === 'EXCHANGED') {
      return withDesktopCors(req, { error: 'Pairing code ya fue usado' }, { status: 409 });
    }

    if (status !== 'PENDING' && status !== 'APPROVED') {
      return withDesktopCors(req, { error: `Estado inválido: ${status}` }, { status: 409 });
    }

    await query(
      `UPDATE desktop_device_sessions
       SET status = 'APPROVED',
           user_id = $2,
           user_email = $3,
           user_name = $4,
           approved_at = COALESCE(approved_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, auth.userId, auth.email || null, auth.name || null]
    );

    return withDesktopCors(req, {
      success: true,
      pairingId: row.pairing_id,
      status: 'APPROVED',
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error aprobando pairing' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
