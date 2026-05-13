import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  createDesktopAccessToken,
  createDesktopRefreshToken,
  hashToken,
} from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

function asText(value: unknown, max = 255) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const pairingId = asText(body?.pairingId, 80);
    const pollToken = asText(body?.pollToken, 500);

    if (!pairingId || !pollToken) {
      return withDesktopCors(
        req,
        { error: 'pairingId y pollToken son requeridos' },
        { status: 400 }
      );
    }

    const result = await query(
      `SELECT id, pairing_id, pairing_code, poll_token_hash, status, user_id, user_email, user_name, expires_at, revoked_at
       FROM desktop_device_sessions
       WHERE pairing_id = $1
       LIMIT 1`,
      [pairingId]
    );

    if (!result.rows.length) {
      return withDesktopCors(req, { error: 'Pairing no encontrado' }, { status: 404 });
    }

    const row = result.rows[0];
    const expectedHash = String(row.poll_token_hash || '');
    const receivedHash = hashToken(pollToken);
    if (!expectedHash || expectedHash !== receivedHash) {
      return withDesktopCors(req, { error: 'pollToken inválido' }, { status: 401 });
    }

    const status = String(row.status || '').toUpperCase();
    if (row.revoked_at || status === 'REVOKED') {
      return withDesktopCors(req, { error: 'Sesión revocada' }, { status: 403 });
    }

    const now = Date.now();
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (expiresAt > 0 && expiresAt <= now && status === 'PENDING') {
      await query(
        `UPDATE desktop_device_sessions
         SET status = 'EXPIRED',
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      return withDesktopCors(req, { error: 'Pairing expirado' }, { status: 410 });
    }

    if (status === 'PENDING') {
      await query(
        `UPDATE desktop_device_sessions
         SET updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      return withDesktopCors(req, {
        success: true,
        status: 'PENDING',
        retryAfterMs: 2000,
      });
    }

    if (status !== 'APPROVED') {
      return withDesktopCors(req, { error: `Estado inválido: ${status}` }, { status: 409 });
    }

    const userId = asText(row.user_id, 120);
    if (!userId) {
      return withDesktopCors(req, { error: 'Pairing aprobado sin usuario' }, { status: 409 });
    }

    const access = createDesktopAccessToken({
      userId,
      deviceSessionId: Number(row.id),
      email: row.user_email || null,
      name: row.user_name || null,
    });
    const refresh = createDesktopRefreshToken({
      userId,
      deviceSessionId: Number(row.id),
      email: row.user_email || null,
      name: row.user_name || null,
    });

    await query(
      `UPDATE desktop_device_sessions
       SET status = 'EXCHANGED',
           access_token_jti = $2,
           refresh_token_hash = $3,
           refresh_expires_at = $4,
           exchanged_at = NOW(),
           poll_token_hash = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, access.jti, hashToken(refresh.token), refresh.expiresAtIso]
    );

    return withDesktopCors(req, {
      success: true,
      status: 'EXCHANGED',
      tokenType: 'Bearer',
      accessToken: access.token,
      refreshToken: refresh.token,
      accessExpiresInSeconds: access.expiresInSeconds,
      refreshExpiresInSeconds: refresh.expiresInSeconds,
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error en polling de pairing' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
