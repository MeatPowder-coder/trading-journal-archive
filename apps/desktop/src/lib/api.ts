import type {
  DesktopCockpitResponse,
  DesktopSessionResponse,
  PairingPollResponse,
  PairingStartResponse,
} from '../types';

export function defaultBackendUrl() {
  const envUrl = (import.meta.env.VITE_BACKEND_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  return 'https://journal.agentame.xyz';
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    const message =
      typeof (payload as any)?.error === 'string'
        ? (payload as any).error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function startDesktopPairing(params: {
  baseUrl: string;
  clientName: string;
  clientPlatform: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientName: params.clientName,
      clientPlatform: params.clientPlatform,
    }),
  });
  return parseJsonOrThrow<PairingStartResponse>(res);
}

export async function pollDesktopPairing(params: {
  baseUrl: string;
  pairingId: string;
  pollToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingId: params.pairingId,
      pollToken: params.pollToken,
    }),
  });
  return parseJsonOrThrow<PairingPollResponse>(res);
}

export async function refreshDesktopTokens(params: {
  baseUrl: string;
  refreshToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: params.refreshToken,
    }),
  });
  return parseJsonOrThrow<{
    success: boolean;
    accessToken: string;
    refreshToken: string;
  }>(res);
}

export async function revokeDesktopSession(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/revoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  return parseJsonOrThrow<{ success: boolean; status: string }>(res);
}

export async function fetchDesktopSession(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/session`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  return parseJsonOrThrow<DesktopSessionResponse>(res);
}

export async function fetchDesktopCockpit(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/cockpit`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  return parseJsonOrThrow<DesktopCockpitResponse>(res);
}
