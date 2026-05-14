import type {
  AIAnalysisInput,
  ChartSnapshotInput,
  DesktopCockpitResponse,
  DesktopEvent,
  DesktopSessionResponse,
  PairingPollResponse,
  PairingStartResponse,
  SLTPMoveInput,
} from '../types';

export function defaultBackendUrl() {
  const envUrl = (import.meta.env.VITE_BACKEND_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  return 'https://journal.agentame.xyz';
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

function apiBaseUrl(baseUrl: string) {
  const explicit = (import.meta.env.VITE_API_URL || '').trim();
  return normalizeBaseUrl(explicit || baseUrl);
}

function wsBaseUrl(baseUrl: string) {
  const explicit = (import.meta.env.VITE_WS_URL || '').trim();
  const normalized = normalizeBaseUrl(explicit || baseUrl);
  if (normalized.startsWith('https://')) return `wss://${normalized.slice('https://'.length)}`;
  if (normalized.startsWith('http://')) return `ws://${normalized.slice('http://'.length)}`;
  return normalized;
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

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
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
    body: JSON.stringify({ refreshToken: params.refreshToken }),
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
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<{ success: boolean; status: string }>(res);
}

export async function fetchDesktopSession(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/session`, {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<DesktopSessionResponse>(res);
}

export async function fetchDesktopCockpit(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/cockpit`, {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<DesktopCockpitResponse>(res);
}

export async function createSLTPMove(params: {
  baseUrl: string;
  accessToken: string;
  tradeId: string | number;
  input: SLTPMoveInput;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/trades/${params.tradeId}/sltp-moves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.input),
  });
  return parseJsonOrThrow<{ success: boolean; move: Record<string, unknown> }>(res);
}

export async function createChartSnapshot(params: {
  baseUrl: string;
  accessToken: string;
  tradeId: string | number;
  input: ChartSnapshotInput;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/trades/${params.tradeId}/snapshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.input),
  });
  return parseJsonOrThrow<{ success: boolean; snapshot: Record<string, unknown> }>(res);
}

export async function requestAIAnalysis(params: {
  baseUrl: string;
  accessToken: string;
  tradeId: string | number;
  input: AIAnalysisInput;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/trades/${params.tradeId}/ai-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.input),
  });
  return parseJsonOrThrow<{ success: boolean; analysis: Record<string, unknown> }>(res);
}

export function connectDesktopEvents(params: {
  baseUrl: string;
  accessToken: string;
  onEvent: (event: DesktopEvent) => void;
  onStatus?: (status: string) => void;
}) {
  const url = new URL(`${wsBaseUrl(params.baseUrl)}/v1/desktop/events`);
  url.searchParams.set('token', params.accessToken);

  const socket = new WebSocket(url.toString());
  socket.addEventListener('open', () => params.onStatus?.('Backend WSS connected'));
  socket.addEventListener('close', () => params.onStatus?.('Backend WSS disconnected'));
  socket.addEventListener('error', () => params.onStatus?.('Backend WSS error'));
  socket.addEventListener('message', (message) => {
    try {
      params.onEvent(JSON.parse(String(message.data)) as DesktopEvent);
    } catch {
      params.onStatus?.('Ignored invalid backend event');
    }
  });

  return () => socket.close();
}
