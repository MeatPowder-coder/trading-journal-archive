import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import {
  createOpaqueToken,
  generatePairingCode,
  getPairingTtlSeconds,
  hashToken,
} from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

function sanitizeClientName(value: unknown) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  return v.slice(0, 120);
}

function sanitizeClientPlatform(value: unknown) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return v.slice(0, 40);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientName = sanitizeClientName(body?.clientName);
    const clientPlatform = sanitizeClientPlatform(body?.clientPlatform);
    const ttlSeconds = getPairingTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const pollToken = createOpaqueToken(32);
    const pollTokenHash = hashToken(pollToken);

    let created: {
      id: number;
      pairing_id: string;
      pairing_code: string;
      expires_at: string;
    } | null = null;

    for (let i = 0; i < 5; i += 1) {
      const pairingCode = generatePairingCode();
      const pairingId = crypto.randomUUID();

      try {
        const result = await query(
          `INSERT INTO desktop_device_sessions (
             pairing_id, pairing_code, poll_token_hash, status,
             client_name, client_platform, expires_at, metadata, created_at, updated_at
           ) VALUES (
             $1, $2, $3, 'PENDING',
             $4, $5, $6, $7::jsonb, NOW(), NOW()
           )
           RETURNING id, pairing_id, pairing_code, expires_at`,
          [
            pairingId,
            pairingCode,
            pollTokenHash,
            clientName,
            clientPlatform,
            expiresAt,
            JSON.stringify({
              requestIp: req.headers.get('x-forwarded-for') || null,
              userAgent: req.headers.get('user-agent') || null,
            }),
          ]
        );
        created = result.rows[0] || null;
        if (created) break;
      } catch (error: any) {
        if (String(error?.code || '') === '23505') {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      return withDesktopCors(
        req,
        { error: 'No se pudo generar pairing code. Intenta de nuevo.' },
        { status: 500 }
      );
    }

    return withDesktopCors(req, {
      success: true,
      pairingId: created.pairing_id,
      pairingCode: created.pairing_code,
      pollToken,
      expiresAt: created.expires_at,
      pollIntervalMs: 2000,
      approveHint: 'Aprueba este código desde tu sesión web autenticada.',
    });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error iniciando pairing desktop' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
