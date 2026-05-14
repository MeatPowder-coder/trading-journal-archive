import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';

export interface DesktopAuthContext {
  userId: string;
  deviceSessionId: number;
  email: string | null;
  name: string | null;
}

function getJwtSecret() {
  const secret = (process.env.DESKTOP_AUTH_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
  if (!secret) throw new Error('Missing DESKTOP_AUTH_SECRET or NEXTAUTH_SECRET');
  return secret;
}

export function tokenFromRequest(req: FastifyRequest) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();

  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') || '';
}

export function resolveDesktopAuth(req: FastifyRequest): DesktopAuthContext | null {
  const token = tokenFromRequest(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (!decoded || typeof decoded !== 'object') return null;

    const payload = decoded as Record<string, unknown>;
    if (payload.tokenType !== 'desktop_access') return null;

    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const deviceSessionId = Number(payload.sid);
    if (!userId || !Number.isInteger(deviceSessionId) || deviceSessionId <= 0) return null;

    return {
      userId,
      deviceSessionId,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch {
    return null;
  }
}
