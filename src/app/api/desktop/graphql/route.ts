import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { resolveDesktopAccessContext } from '@/lib/desktop-auth';

function hasuraHttpUrl() {
  const raw = (process.env.HASURA_HTTP_URL || process.env.NEXT_PUBLIC_HASURA_HTTP_URL || '').trim();
  return raw || 'https://hasura.agentame.xyz/v1/graphql';
}

function signingSecret() {
  const raw = (process.env.NEXTAUTH_SECRET || process.env.DESKTOP_AUTH_SECRET || '').trim();
  if (!raw) {
    throw new Error('Missing NEXTAUTH_SECRET or DESKTOP_AUTH_SECRET');
  }
  return raw;
}

function issueHasuraProxyToken(params: { userId: string; email: string | null; name: string | null }) {
  const payload: Record<string, unknown> = {
    sub: params.userId,
    email: params.email,
    name: params.name,
    'https://hasura.io/jwt/claims': {
      'x-hasura-allowed-roles': ['user'],
      'x-hasura-default-role': 'user',
      'x-hasura-user-id': params.userId,
    },
  };

  return jwt.sign(payload, signingSecret(), {
    algorithm: 'HS256',
    expiresIn: 300,
  });
}

export async function POST(req: NextRequest) {
  try {
    const access = await resolveDesktopAccessContext(req);
    if (!access) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid GraphQL payload' }, { status: 400 });
    }

    const proxyToken = issueHasuraProxyToken({
      userId: access.userId,
      email: access.email,
      name: access.name,
    });

    const upstream = await fetch(hasuraHttpUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${proxyToken}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Desktop GraphQL proxy failed' }, { status: 500 });
  }
}

