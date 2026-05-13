import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'https://journal.agentame.xyz',
];

function allowedOrigins() {
  const env = (process.env.DESKTOP_ALLOWED_ORIGINS || '').trim();
  const custom = env
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...custom]);
}

function resolveCorsOrigin(req: NextRequest) {
  const origin = (req.headers.get('origin') || '').trim();
  if (!origin) return null;
  const origins = allowedOrigins();
  if (origins.has('*')) return '*';
  return origins.has(origin) ? origin : null;
}

function buildCorsHeaders(req: NextRequest) {
  const headers = new Headers();
  const allowOrigin = resolveCorsOrigin(req);
  if (!allowOrigin) return headers;

  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  return headers;
}

export function withDesktopCors<T>(req: NextRequest, payload: T, init?: { status?: number }) {
  const response = NextResponse.json(payload, { status: init?.status || 200 });
  const headers = buildCorsHeaders(req);
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export function desktopCorsPreflight(req: NextRequest) {
  const headers = buildCorsHeaders(req);
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
