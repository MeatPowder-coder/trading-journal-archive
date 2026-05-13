import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';

const DEFAULT_PAIRING_TTL_SECONDS = 10 * 60;
const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type DesktopTokenType = 'desktop_access' | 'desktop_refresh';

export interface DesktopTokenPayload extends jwt.JwtPayload {
  sub: string;
  sid: number;
  tokenType: DesktopTokenType;
  jti: string;
  email?: string | null;
  name?: string | null;
}

export interface DesktopAccessContext {
  userId: string;
  deviceSessionId: number;
  email: string | null;
  name: string | null;
  jti: string;
}

function clampTtl(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function getPairingTtlSeconds() {
  return clampTtl(
    process.env.DESKTOP_PAIRING_TTL_SECONDS,
    DEFAULT_PAIRING_TTL_SECONDS,
    60,
    3600
  );
}

export function getAccessTtlSeconds() {
  return clampTtl(
    process.env.DESKTOP_ACCESS_TTL_SECONDS,
    DEFAULT_ACCESS_TTL_SECONDS,
    60,
    3600
  );
}

export function getRefreshTtlSeconds() {
  return clampTtl(
    process.env.DESKTOP_REFRESH_TTL_SECONDS,
    DEFAULT_REFRESH_TTL_SECONDS,
    60 * 10,
    60 * 60 * 24 * 90
  );
}

function getDesktopJwtSecret() {
  const secret = (process.env.DESKTOP_AUTH_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
  if (!secret) {
    throw new Error('Missing DESKTOP_AUTH_SECRET or NEXTAUTH_SECRET');
  }
  return secret;
}

export function hashToken(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function generatePairingCode() {
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function createDesktopAccessToken(params: {
  userId: string;
  deviceSessionId: number;
  email?: string | null;
  name?: string | null;
}) {
  const ttl = getAccessTtlSeconds();
  const jti = crypto.randomUUID();
  const payload: DesktopTokenPayload = {
    sub: params.userId,
    sid: params.deviceSessionId,
    tokenType: 'desktop_access',
    jti,
    email: params.email || null,
    name: params.name || null,
  };

  const token = jwt.sign(payload, getDesktopJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: ttl,
  });

  return {
    token,
    jti,
    expiresInSeconds: ttl,
  };
}

export function createDesktopRefreshToken(params: {
  userId: string;
  deviceSessionId: number;
  email?: string | null;
  name?: string | null;
}) {
  const ttl = getRefreshTtlSeconds();
  const jti = crypto.randomUUID();
  const payload: DesktopTokenPayload = {
    sub: params.userId,
    sid: params.deviceSessionId,
    tokenType: 'desktop_refresh',
    jti,
    email: params.email || null,
    name: params.name || null,
  };

  const token = jwt.sign(payload, getDesktopJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: ttl,
  });

  return {
    token,
    jti,
    expiresInSeconds: ttl,
    expiresAtIso: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

export function verifyDesktopToken(token: string, expectedType: DesktopTokenType) {
  try {
    const decoded = jwt.verify(token, getDesktopJwtSecret(), {
      algorithms: ['HS256'],
    });

    if (!decoded || typeof decoded !== 'object') return null;
    const payload = decoded as Partial<DesktopTokenPayload>;
    if (payload.tokenType !== expectedType) return null;

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    const jti = typeof payload.jti === 'string' ? payload.jti : null;
    const sid = Number(payload.sid);
    if (!sub || !jti || !Number.isInteger(sid) || sid <= 0) return null;

    return {
      ...payload,
      sub,
      sid,
      jti,
      tokenType: expectedType,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    } as DesktopTokenPayload;
  } catch {
    return null;
  }
}

export function getBearerToken(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function resolveDesktopAccessContext(req: NextRequest): Promise<DesktopAccessContext | null> {
  const bearer = getBearerToken(req);
  if (!bearer) return null;

  const payload = verifyDesktopToken(bearer, 'desktop_access');
  if (!payload) return null;

  const result = await query(
    `SELECT id, user_id, user_email, user_name, status, revoked_at
     FROM desktop_device_sessions
     WHERE id = $1
     LIMIT 1`,
    [payload.sid]
  );

  if (!result.rows.length) return null;
  const session = result.rows[0];
  if (session.revoked_at) return null;
  if (String(session.status || '').toUpperCase() !== 'EXCHANGED') return null;
  if (String(session.user_id || '') !== payload.sub) return null;

  return {
    userId: payload.sub,
    deviceSessionId: payload.sid,
    email: typeof session.user_email === 'string' ? session.user_email : payload.email || null,
    name: typeof session.user_name === 'string' ? session.user_name : payload.name || null,
    jti: payload.jti,
  };
}
