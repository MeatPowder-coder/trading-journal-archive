import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { query } from './db';

export interface DesktopAuthContext {
  userId: string;
  deviceSessionId: number;
  jti: string;
  email: string | null;
  name: string | null;
}

function getJwtSecrets() {
  const next = (process.env.NEXTAUTH_SECRET || '').trim();
  const desktop = (process.env.DESKTOP_AUTH_SECRET || '').trim();
  const secrets = [next, desktop].filter(Boolean);
  if (!secrets.length) throw new Error('Missing NEXTAUTH_SECRET or DESKTOP_AUTH_SECRET');
  return Array.from(new Set(secrets));
}

export function tokenFromRequest(req: FastifyRequest) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();

  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') || '';
}

function decodeDesktopAccessToken(token: string) {
  if (!token) return null;

  const secrets = getJwtSecrets();
  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (!decoded || typeof decoded !== 'object') continue;

      const payload = decoded as Record<string, unknown>;
      if (payload.tokenType !== 'desktop_access') continue;

      const userId = typeof payload.sub === 'string' ? payload.sub : '';
      const jti = typeof payload.jti === 'string' ? payload.jti : '';
      const deviceSessionId = Number(payload.sid);
      if (!userId || !jti || !Number.isInteger(deviceSessionId) || deviceSessionId <= 0) continue;

      return {
        userId,
        deviceSessionId,
        jti,
        email: typeof payload.email === 'string' ? payload.email : null,
        name: typeof payload.name === 'string' ? payload.name : null,
      };
    } catch {
      // try next secret
    }
  }

  return null;
}

export function resolveDesktopAuthToken(req: FastifyRequest) {
  return decodeDesktopAccessToken(tokenFromRequest(req));
}

export async function resolveDesktopAuth(req: FastifyRequest): Promise<DesktopAuthContext | null> {
  const decoded = resolveDesktopAuthToken(req);
  if (!decoded) return null;

  const sessionRes = await query(
    `SELECT id, user_id, user_email, user_name, status, revoked_at, access_token_jti
     FROM desktop_device_sessions
     WHERE id = $1
     LIMIT 1`,
    [decoded.deviceSessionId]
  );

  if (!sessionRes.rows.length) return null;
  const session = sessionRes.rows[0];

  if (session.revoked_at) return null;
  if (String(session.status || '').toUpperCase() !== 'EXCHANGED') return null;
  if (String(session.user_id || '') !== decoded.userId) return null;

  const activeJti = String(session.access_token_jti || '').trim();
  if (activeJti && activeJti !== decoded.jti) return null;

  return {
    ...decoded,
    email: typeof session.user_email === 'string' ? session.user_email : decoded.email,
    name: typeof session.user_name === 'string' ? session.user_name : decoded.name,
  };
}
