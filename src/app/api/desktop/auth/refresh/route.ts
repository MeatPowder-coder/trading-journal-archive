import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  createDesktopAccessToken,
  createDesktopRefreshToken,
  hashToken,
  verifyDesktopToken,
} from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

function asText(value: unknown, max = 4096) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refreshToken = asText(body?.refreshToken);
    if (!refreshToken) {
      return withDesktopCors(req, { error: 'refreshToken requerido' }, { status: 400 });
    }

    const payload = verifyDesktopToken(refreshToken, 'desktop_refresh');
    if (!payload) {
      return withDesktopCors(req, { error: 'refreshToken inválido' }, { status: 401 });
    }

    const result = await query(
      `SELECT id, status, user_id, user_email, user_name, refresh_token_hash, refresh_expires_at, revoked_at
       FROM desktop_device_sessions
       WHERE id = $1
       LIMIT 1`,
      [payload.sid]
    );

    if (!result.rows.length) {
      return withDesktopCors(req, { error: 'Sesión desktop no encontrada' }, { status: 401 });
    }

    const row = result.rows[0];
    if (row.revoked_at || String(row.status || '').toUpperCase() !== 'EXCHANGED') {
      return withDesktopCors(req, { error: 'Sesión desktop revocada o inválida' }, { status: 403 });
    }

    if (String(row.user_id || '') !== payload.sub) {
      return withDesktopCors(req, { error: 'Token no corresponde al usuario' }, { status: 401 });
    }

    const expectedHash = String(row.refresh_token_hash || '');
    const receivedHash = hashToken(refreshToken);
    if (!expectedHash || expectedHash !== receivedHash) {
      return withDesktopCors(req, { error: 'refreshToken no coincide' }, { status: 401 });
    }

    const refreshExpiresAt = row.refresh_expires_at ? new Date(row.refresh_expires_at).getTime() : 0;
    if (refreshExpiresAt > 0 && refreshExpiresAt <= Date.now()) {
      return withDesktopCors(req, { error: 'refreshToken expirado' }, { status: 401 });
    }

    const access = createDesktopAccessToken({
      userId: payload.sub,
      deviceSessionId: Number(row.id),
      email: row.user_email || null,
      name: row.user_name || null,
    });
    const refresh = createDesktopRefreshToken({
      userId: payload.sub,
      deviceSessionId: Number(row.id),
      email: row.user_email || null,
      name: row.user_name || null,
    });

    await query(
      `UPDATE desktop_device_sessions
       SET access_token_jti = $2,
           refresh_token_hash = $3,
           refresh_expires_at = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, access.jti, hashToken(refresh.token), refresh.expiresAtIso]
    );

    return withDesktopCors(req, {
      success: true,
      tokenType: 'Bearer',
      accessToken: access.token,
      refreshToken: refresh.token,
      accessExpiresInSeconds: access.expiresInSeconds,
      refreshExpiresInSeconds: refresh.expiresInSeconds,
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error refrescando token desktop' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
