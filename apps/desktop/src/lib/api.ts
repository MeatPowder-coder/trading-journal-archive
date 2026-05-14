import type {
  AIAnalysisInput,
  ChartSnapshotInput,
  ChatMessage,
  ChatSession,
  DesktopBootstrapResponse,
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
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/desktop/session`, {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<DesktopSessionResponse>(res);
}

export async function fetchDesktopCockpit(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/desktop/cockpit`, {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<DesktopCockpitResponse>(res);
}

export async function fetchDesktopBootstrap(params: {
  baseUrl: string;
  accessToken: string;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/desktop/bootstrap`, {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<DesktopBootstrapResponse>(res);
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

export async function placeMarketOrder(params: {
  baseUrl: string;
  accessToken: string;
  body: Record<string, unknown>;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/orders/market`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.body),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function placeLimitOrder(params: {
  baseUrl: string;
  accessToken: string;
  body: Record<string, unknown>;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/orders/limit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.body),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function editLimitOrder(params: {
  baseUrl: string;
  accessToken: string;
  orderId: number;
  body: Record<string, unknown>;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/orders/${params.orderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.body),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function cancelLimitOrder(params: {
  baseUrl: string;
  accessToken: string;
  orderId: number;
  reason?: string;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/orders/${params.orderId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify({ reason: params.reason || null }),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function closePosition(params: {
  baseUrl: string;
  accessToken: string;
  symbol: string;
  tradeId?: number;
  closePercent?: number;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/positions/${encodeURIComponent(params.symbol)}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify({
      tradeId: params.tradeId,
      closePercent: params.closePercent ?? 100,
    }),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function updatePositionProtection(params: {
  baseUrl: string;
  accessToken: string;
  symbol: string;
  body: Record<string, unknown>;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/positions/${encodeURIComponent(params.symbol)}/sltp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.body),
  });
  return parseJsonOrThrow<Record<string, unknown>>(res);
}

export async function listChatSessions(params: {
  baseUrl: string;
  accessToken: string;
  tradeId?: number;
  pendingOrderId?: number;
}) {
  const url = new URL(`${apiBaseUrl(params.baseUrl)}/v1/chat/sessions`);
  if (params.tradeId) url.searchParams.set('tradeId', String(params.tradeId));
  if (params.pendingOrderId) url.searchParams.set('pendingOrderId', String(params.pendingOrderId));
  const res = await fetch(url.toString(), {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<{ success: boolean; sessions: ChatSession[] }>(res);
}

export async function createChatSession(params: {
  baseUrl: string;
  accessToken: string;
  body: {
    title?: string | null;
    tradeId?: number | null;
    pendingOrderId?: number | null;
    agentType?: string;
  };
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/chat/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.body),
  });
  return parseJsonOrThrow<{ success: boolean; session: ChatSession }>(res);
}

export async function listChatMessages(params: {
  baseUrl: string;
  accessToken: string;
  sessionId: number;
}) {
  const url = new URL(`${apiBaseUrl(params.baseUrl)}/v1/chat/messages`);
  url.searchParams.set('sessionId', String(params.sessionId));
  const res = await fetch(url.toString(), {
    headers: authHeaders(params.accessToken),
  });
  return parseJsonOrThrow<{ success: boolean; messages: ChatMessage[] }>(res);
}

export async function createChatMessage(params: {
  baseUrl: string;
  accessToken: string;
  body: {
    sessionId: number;
    role?: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    fileUrl?: string | null;
    fileType?: string | null;
  };
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify(params.body),
  });
  return parseJsonOrThrow<{ success: boolean; message: ChatMessage }>(res);
}

export async function streamChatMessage(params: {
  baseUrl: string;
  accessToken: string;
  sessionId: number;
  message: string;
  model?: string;
}) {
  const res = await fetch(`${apiBaseUrl(params.baseUrl)}/v1/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.accessToken),
    },
    body: JSON.stringify({
      sessionId: params.sessionId,
      message: params.message,
      model: params.model,
    }),
  });
  return parseJsonOrThrow<{ success: boolean; model: string; assistantMessage: ChatMessage }>(res);
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
