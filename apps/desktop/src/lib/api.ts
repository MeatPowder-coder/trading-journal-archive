import type {
  AIAnalysisInput,
  ChartSnapshotInput,
  ChatMessage,
  ChatSession,
  DesktopBootstrapResponse,
  DesktopCockpitResponse,
  DesktopEvent,
  DesktopSessionResponse,
  DesktopTradesResponse,
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

function apiFallbackBaseUrls(baseUrl: string) {
  const fallbacks: string[] = [];
  const explicit = (import.meta.env.VITE_API_FALLBACK_URL || '').trim();
  if (explicit) {
    fallbacks.push(normalizeBaseUrl(explicit));
  }

  if (import.meta.env.DEV) {
    fallbacks.push('http://127.0.0.1:4000');
  }

  const primary = apiBaseUrl(baseUrl);
  return Array.from(new Set(fallbacks.filter((candidate) => candidate && candidate !== primary)));
}

function wsBaseUrl(baseUrl: string) {
  const explicit = (import.meta.env.VITE_WS_URL || '').trim();
  const normalized = normalizeBaseUrl(explicit || baseUrl);
  if (normalized.startsWith('https://')) return `wss://${normalized.slice('https://'.length)}`;
  if (normalized.startsWith('http://')) return `ws://${normalized.slice('http://'.length)}`;
  return normalized;
}

function wsFallbackBaseUrls(baseUrl: string) {
  const fallbacks: string[] = [];
  const explicit = (import.meta.env.VITE_WS_FALLBACK_URL || '').trim();
  if (explicit) {
    fallbacks.push(normalizeBaseUrl(explicit));
  }

  if (import.meta.env.DEV) {
    fallbacks.push('ws://127.0.0.1:4000');
  }

  const primary = wsBaseUrl(baseUrl);
  return Array.from(new Set(fallbacks.filter((candidate) => candidate && candidate !== primary)));
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

function shouldTryApiFallback(status: number) {
  return status === 404 || status === 405 || status === 500 || status === 501 || status === 502 || status === 503;
}

async function fetchApiJsonWithFallback<T>(params: {
  baseUrl: string;
  path: string;
  init?: RequestInit;
}) {
  const candidates = [apiBaseUrl(params.baseUrl), ...apiFallbackBaseUrls(params.baseUrl)];
  let lastError: unknown = new Error('Request failed');

  for (let i = 0; i < candidates.length; i += 1) {
    const url = `${candidates[i]}${params.path}`;
    try {
      const response = await fetch(url, params.init);
      if (i < candidates.length - 1 && shouldTryApiFallback(response.status)) {
        continue;
      }
      return parseJsonOrThrow<T>(response);
    } catch (error) {
      lastError = error;
      if (i < candidates.length - 1) continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
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
  try {
    return await fetchApiJsonWithFallback<DesktopSessionResponse>({
      baseUrl: params.baseUrl,
      path: '/v1/desktop/session',
      init: {
        headers: authHeaders(params.accessToken),
      },
    });
  } catch {
    const legacy = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/session`, {
      headers: authHeaders(params.accessToken),
    });
    return parseJsonOrThrow<DesktopSessionResponse>(legacy);
  }
}

export async function fetchDesktopCockpit(params: {
  baseUrl: string;
  accessToken: string;
}) {
  try {
    return await fetchApiJsonWithFallback<DesktopCockpitResponse>({
      baseUrl: params.baseUrl,
      path: '/v1/desktop/cockpit',
      init: {
        headers: authHeaders(params.accessToken),
      },
    });
  } catch {
    const legacy = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/desktop/cockpit`, {
      headers: authHeaders(params.accessToken),
    });
    return parseJsonOrThrow<DesktopCockpitResponse>(legacy);
  }
}

export async function fetchDesktopBootstrap(params: {
  baseUrl: string;
  accessToken: string;
}) {
  return fetchApiJsonWithFallback<DesktopBootstrapResponse>({
    baseUrl: params.baseUrl,
    path: '/v1/desktop/bootstrap',
    init: {
      headers: authHeaders(params.accessToken),
    },
  });
}

export async function fetchDesktopTrades(params: {
  baseUrl: string;
  accessToken: string;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.limit && Number.isFinite(params.limit)) {
    qs.set('limit', String(Math.max(30, Math.min(1000, Math.floor(params.limit)))));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return fetchApiJsonWithFallback<DesktopTradesResponse>({
    baseUrl: params.baseUrl,
    path: `/v1/desktop/trades${suffix}`,
    init: {
      headers: authHeaders(params.accessToken),
    },
  });
}

export async function createSLTPMove(params: {
  baseUrl: string;
  accessToken: string;
  tradeId: string | number;
  input: SLTPMoveInput;
}) {
  return fetchApiJsonWithFallback<{ success: boolean; move: Record<string, unknown> }>({
    baseUrl: params.baseUrl,
    path: `/v1/trades/${params.tradeId}/sltp-moves`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.input),
    },
  });
}

export async function createChartSnapshot(params: {
  baseUrl: string;
  accessToken: string;
  tradeId: string | number;
  input: ChartSnapshotInput;
}) {
  return fetchApiJsonWithFallback<{ success: boolean; snapshot: Record<string, unknown> }>({
    baseUrl: params.baseUrl,
    path: `/v1/trades/${params.tradeId}/snapshots`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.input),
    },
  });
}

export async function requestAIAnalysis(params: {
  baseUrl: string;
  accessToken: string;
  tradeId: string | number;
  input: AIAnalysisInput;
}) {
  return fetchApiJsonWithFallback<{ success: boolean; analysis: Record<string, unknown> }>({
    baseUrl: params.baseUrl,
    path: `/v1/trades/${params.tradeId}/ai-analysis`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.input),
    },
  });
}

export async function placeMarketOrder(params: {
  baseUrl: string;
  accessToken: string;
  body: Record<string, unknown>;
}) {
  return fetchApiJsonWithFallback<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    path: '/v1/orders/market',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.body),
    },
  });
}

export async function placeLimitOrder(params: {
  baseUrl: string;
  accessToken: string;
  body: Record<string, unknown>;
}) {
  return fetchApiJsonWithFallback<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    path: '/v1/orders/limit',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.body),
    },
  });
}

export async function editLimitOrder(params: {
  baseUrl: string;
  accessToken: string;
  orderId: number;
  body: Record<string, unknown>;
}) {
  return fetchApiJsonWithFallback<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    path: `/v1/orders/${params.orderId}`,
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.body),
    },
  });
}

export async function cancelLimitOrder(params: {
  baseUrl: string;
  accessToken: string;
  orderId: number;
  reason?: string;
}) {
  return fetchApiJsonWithFallback<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    path: `/v1/orders/${params.orderId}`,
    init: {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify({ reason: params.reason || null }),
    },
  });
}

export async function closePosition(params: {
  baseUrl: string;
  accessToken: string;
  symbol: string;
  tradeId?: number;
  closePercent?: number;
}) {
  return fetchApiJsonWithFallback<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    path: `/v1/positions/${encodeURIComponent(params.symbol)}/close`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify({
        tradeId: params.tradeId,
        closePercent: params.closePercent ?? 100,
      }),
    },
  });
}

export async function updatePositionProtection(params: {
  baseUrl: string;
  accessToken: string;
  symbol: string;
  body: Record<string, unknown>;
}) {
  return fetchApiJsonWithFallback<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    path: `/v1/positions/${encodeURIComponent(params.symbol)}/sltp`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.body),
    },
  });
}

export async function listChatSessions(params: {
  baseUrl: string;
  accessToken: string;
  tradeId?: number;
  pendingOrderId?: number;
}) {
  const qs = new URLSearchParams();
  if (params.tradeId) qs.set('tradeId', String(params.tradeId));
  if (params.pendingOrderId) qs.set('pendingOrderId', String(params.pendingOrderId));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return fetchApiJsonWithFallback<{ success: boolean; sessions: ChatSession[] }>({
    baseUrl: params.baseUrl,
    path: `/v1/chat/sessions${suffix}`,
    init: {
      headers: authHeaders(params.accessToken),
    },
  });
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
  return fetchApiJsonWithFallback<{ success: boolean; session: ChatSession }>({
    baseUrl: params.baseUrl,
    path: '/v1/chat/sessions',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.body),
    },
  });
}

export async function listChatMessages(params: {
  baseUrl: string;
  accessToken: string;
  sessionId: number;
}) {
  const qs = new URLSearchParams({ sessionId: String(params.sessionId) });
  return fetchApiJsonWithFallback<{ success: boolean; messages: ChatMessage[] }>({
    baseUrl: params.baseUrl,
    path: `/v1/chat/messages?${qs.toString()}`,
    init: {
      headers: authHeaders(params.accessToken),
    },
  });
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
  return fetchApiJsonWithFallback<{ success: boolean; message: ChatMessage }>({
    baseUrl: params.baseUrl,
    path: '/v1/chat/messages',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(params.accessToken),
      },
      body: JSON.stringify(params.body),
    },
  });
}

export async function streamChatMessage(params: {
  baseUrl: string;
  accessToken: string;
  sessionId: number;
  message: string;
  model?: string;
}) {
  return fetchApiJsonWithFallback<{ success: boolean; model: string; assistantMessage: ChatMessage }>({
    baseUrl: params.baseUrl,
    path: '/v1/chat/stream',
    init: {
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
    },
  });
}

export function connectDesktopEvents(params: {
  baseUrl: string;
  accessToken: string;
  onEvent: (event: DesktopEvent) => void;
  onStatus?: (status: string) => void;
}) {
  const bases = [wsBaseUrl(params.baseUrl), ...wsFallbackBaseUrls(params.baseUrl)];
  let activeSocket: WebSocket | null = null;
  let closedByCaller = false;
  let index = 0;

  const connect = () => {
    if (closedByCaller) return;
    if (index >= bases.length) {
      params.onStatus?.('Backend WSS unavailable');
      return;
    }

    const base = bases[index];
    const url = new URL(`${base}/v1/desktop/events`);
    url.searchParams.set('token', params.accessToken);

    const socket = new WebSocket(url.toString());
    activeSocket = socket;

    socket.addEventListener('open', () => params.onStatus?.(`Backend WSS connected (${base})`));
    socket.addEventListener('close', () => {
      if (closedByCaller) return;
      index += 1;
      params.onStatus?.('Backend WSS reconnecting');
      connect();
    });
    socket.addEventListener('error', () => params.onStatus?.('Backend WSS error'));
    socket.addEventListener('message', (message) => {
      try {
        params.onEvent(JSON.parse(String(message.data)) as DesktopEvent);
      } catch {
        params.onStatus?.('Ignored invalid backend event');
      }
    });
  };

  connect();

  return () => {
    closedByCaller = true;
    activeSocket?.close();
  };
}
