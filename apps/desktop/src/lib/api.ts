import type {
  AIAnalysisInput,
  ChartSnapshotInput,
  ChatMessage,
  ChatSession,
  DesktopBootstrapResponse,
  DesktopCockpitResponse,
  DesktopEvent,
  DesktopPricesResponse,
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

function readEnvFlag(raw: unknown, defaultValue: boolean) {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return defaultValue;
}

function useDevProxy() {
  if (!import.meta.env.DEV) return false;
  return readEnvFlag(import.meta.env.VITE_USE_DEV_PROXY, true);
}

function useLocalApiFallback() {
  if (!import.meta.env.DEV) return false;
  return readEnvFlag(import.meta.env.VITE_ENABLE_LOCAL_API_FALLBACK, true);
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

  if (useLocalApiFallback()) {
    fallbacks.push('http://127.0.0.1:4000');
  }

  const primary = apiBaseUrl(baseUrl);
  return Array.from(new Set(fallbacks.filter((candidate) => candidate && candidate !== primary)));
}

function wsBaseUrl(baseUrl: string) {
  if (useDevProxy() && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
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

  if (useLocalApiFallback()) {
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

function normalizeTicker(raw: string) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function looksLikeBinancePair(ticker: string) {
  return /^(?:[A-Z0-9]{2,12})(USDT|USDC|BUSD|FDUSD)$/.test(ticker);
}

async function fetchBinancePublicPrice(symbol: string) {
  const normalized = normalizeTicker(symbol);
  if (!normalized) return null;

  const parsePrice = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null as any);
    const price = Number(payload?.price);
    return Number.isFinite(price) ? price : null;
  };

  const futures = await parsePrice(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(normalized)}`
  );
  if (futures != null) return futures;

  const spot = await parsePrice(
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(normalized)}`
  );
  if (spot != null) return spot;

  return null;
}

async function fetchYahooProxyPrice(baseUrl: string, ticker: string) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return null;
  const response = await fetch(
    useDevProxy()
      ? `/api/yahoo-price/${encodeURIComponent(normalized)}`
      : `${normalizeBaseUrl(baseUrl)}/api/yahoo-price/${encodeURIComponent(normalized)}`
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null as any);
  const closes = payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return null;
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const price = Number(closes[i]);
    if (Number.isFinite(price)) return price;
  }
  return null;
}

function shouldTryApiFallback(status: number) {
  return status === 404 || status === 405 || status === 500 || status === 501 || status === 502 || status === 503;
}

async function fetchApiJsonWithFallback<T>(params: {
  baseUrl: string;
  path: string;
  init?: RequestInit;
}) {
  const candidates: (string | null)[] = useDevProxy()
    ? [null, ...apiFallbackBaseUrls(params.baseUrl)]
    : [apiBaseUrl(params.baseUrl), ...apiFallbackBaseUrls(params.baseUrl)];
  let lastError: unknown = new Error('Request failed');

  for (let i = 0; i < candidates.length; i += 1) {
    const base = candidates[i];
    const url = base ? `${base}${params.path}` : params.path;
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
  const res = await fetch(useDevProxy() ? '/api/desktop/auth/start' : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/start`, {
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
  const res = await fetch(useDevProxy() ? '/api/desktop/auth/poll' : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/poll`, {
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
  const res = await fetch(useDevProxy() ? '/api/desktop/auth/refresh' : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/refresh`, {
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
  const res = await fetch(useDevProxy() ? '/api/desktop/auth/revoke' : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/auth/revoke`, {
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
    const legacy = await fetch(useDevProxy() ? '/api/desktop/session' : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/session`, {
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
    const legacy = await fetch(useDevProxy() ? '/api/desktop/cockpit' : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/cockpit`, {
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

  try {
    return await fetchApiJsonWithFallback<DesktopTradesResponse>({
      baseUrl: params.baseUrl,
      path: `/v1/desktop/trades${suffix}`,
      init: {
        headers: authHeaders(params.accessToken),
      },
    });
  } catch {
    const legacy = await fetch(
      useDevProxy() ? `/api/desktop/trades${suffix}` : `${normalizeBaseUrl(params.baseUrl)}/api/desktop/trades${suffix}`,
      {
      headers: authHeaders(params.accessToken),
      }
    );
    return parseJsonOrThrow<DesktopTradesResponse>(legacy);
  }
}

export async function fetchDesktopPrices(params: {
  baseUrl: string;
  accessToken: string;
  tickers: string[];
}) {
  const compact = Array.from(
    new Set(
      params.tickers
        .map((ticker) => String(ticker || '').trim().toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, 120);

  const qs = new URLSearchParams();
  if (compact.length) {
    qs.set('tickers', compact.join(','));
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  try {
    return await fetchApiJsonWithFallback<DesktopPricesResponse>({
      baseUrl: params.baseUrl,
      path: `/v1/desktop/prices${suffix}`,
      init: {
        headers: authHeaders(params.accessToken),
      },
    });
  } catch {
    // Fallback for environments where the new desktop API service is not redeployed yet.
    const prices: Record<string, number> = {};
    const unresolved: string[] = [];

    for (const ticker of compact) {
      let price: number | null = null;
      const normalized = normalizeTicker(ticker);

      if (looksLikeBinancePair(normalized)) {
        price = await fetchBinancePublicPrice(normalized);
      }

      if (price == null && /^[A-Z0-9]{2,12}$/.test(normalized) && !normalized.includes('=')) {
        price = await fetchBinancePublicPrice(`${normalized}USDT`);
      }

      if (price == null) {
        price = await fetchYahooProxyPrice(params.baseUrl, normalized);
      }

      if (price != null) {
        prices[normalized] = price;
      } else {
        unresolved.push(normalized);
      }
    }

    return {
      success: true,
      asOf: new Date().toISOString(),
      prices,
      unresolved,
    };
  }
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
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    const maxAttempts = Math.max(1, Number(import.meta.env.VITE_WS_MAX_RETRIES || 8));
    if (reconnectAttempts >= maxAttempts) {
      params.onStatus?.('Backend WSS unavailable');
      return;
    }
    const delay = Math.min(12_000, 600 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    clearReconnectTimer();
    params.onStatus?.(`Backend WSS reconnecting (${Math.ceil(delay / 1000)}s)`);
    reconnectTimer = setTimeout(() => {
      index = (index + 1) % bases.length;
      connect();
    }, delay);
  };

  const connect = () => {
    if (closedByCaller) return;

    const base = bases[index];
    const url = new URL(`${base}/v1/desktop/events`);
    url.searchParams.set('token', params.accessToken);

    const socket = new WebSocket(url.toString());
    activeSocket = socket;

    socket.addEventListener('open', () => {
      if (socket !== activeSocket) return;
      reconnectAttempts = 0;
      params.onStatus?.(`Backend WSS connected (${base})`);
    });
    socket.addEventListener('close', (event) => {
      if (socket !== activeSocket) return;
      if (closedByCaller) return;
      // Token rejection should not trigger an aggressive reconnect loop.
      if (event.code === 1008 || event.code === 4001 || event.code === 4401) {
        params.onStatus?.('Backend WSS rejected token');
        return;
      }
      scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      if (socket !== activeSocket) return;
      params.onStatus?.('Backend WSS error');
    });
    socket.addEventListener('message', (message) => {
      if (socket !== activeSocket) return;
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
    clearReconnectTimer();
    activeSocket?.close();
  };
}
