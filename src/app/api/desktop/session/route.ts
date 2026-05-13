import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { resolveDesktopAccessContext } from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

export async function GET(req: NextRequest) {
  try {
    const access = await resolveDesktopAccessContext(req);
    if (!access) {
      return withDesktopCors(req, { error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      `SELECT id, status, client_name, client_platform, created_at, approved_at, exchanged_at, revoked_at, updated_at
       FROM desktop_device_sessions
       WHERE id = $1
       LIMIT 1`,
      [access.deviceSessionId]
    );

    if (!result.rows.length) {
      return withDesktopCors(req, { error: 'Sesión desktop no encontrada' }, { status: 404 });
    }

    const row = result.rows[0];
    if (row.revoked_at || String(row.status || '').toUpperCase() !== 'EXCHANGED') {
      return withDesktopCors(req, { error: 'Sesión desktop inválida' }, { status: 403 });
    }

    await query(
      `UPDATE desktop_device_sessions
       SET access_token_jti = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, access.jti]
    ).catch(() => undefined);

    return withDesktopCors(req, {
      authenticated: true,
      user: {
        id: access.userId,
        email: access.email,
        name: access.name,
      },
      deviceSession: {
        id: row.id,
        status: row.status,
        clientName: row.client_name || null,
        clientPlatform: row.client_platform || null,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        exchangedAt: row.exchanged_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error consultando sesión desktop' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
