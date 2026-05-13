import crypto from 'crypto';
import { query } from '@/lib/db';

const BASE_URL = 'https://fapi.binance.com';
const BINANCE_FUTURES_API_KEY = process.env.BINANCE_FUTURES_API_KEY || '';
const BINANCE_FUTURES_API_SECRET = process.env.BINANCE_FUTURES_API_SECRET || '';

export type FuturesRequestMethod = 'GET' | 'POST' | 'DELETE';
export type ProtectiveOrderType = 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';

const PROTECTIVE_ORDER_TYPES = new Set(['STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET']);

export class BinanceFuturesError extends Error {
  status: number;
  binanceCode: number | null;
  binanceMessage: string | null;
  path: string;
  method: FuturesRequestMethod;
  raw: string | null;

  constructor(message: string, options: {
    status?: number;
    binanceCode?: number | null;
    binanceMessage?: string | null;
    path?: string;
    method?: FuturesRequestMethod;
    raw?: string | null;
  } = {}) {
    super(message);
    this.name = 'BinanceFuturesError';
    this.status = options.status || 502;
    this.binanceCode = options.binanceCode ?? null;
    this.binanceMessage = options.binanceMessage ?? null;
    this.path = options.path || '';
    this.method = options.method || 'GET';
    this.raw = options.raw ?? null;
  }
}

export function asFiniteNumber(value: unknown, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sign(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function parseBinanceErrorPayload(rawText: string) {
  try {
    const parsed = JSON.parse(rawText);
    const code = Number(parsed?.code);
    const msg = typeof parsed?.msg === 'string' ? parsed.msg : null;
    return {
      code: Number.isFinite(code) ? code : null,
      msg,
    };
  } catch {
    return {
      code: null,
      msg: null,
    };
  }
}

export function ensureFuturesCredentials() {
  if (!BINANCE_FUTURES_API_KEY || !BINANCE_FUTURES_API_SECRET) {
    throw new BinanceFuturesError('Missing Binance Futures API keys', {
      status: 500,
      path: '/credentials',
      method: 'GET',
    });
  }

  return {
    apiKey: BINANCE_FUTURES_API_KEY,
    secret: BINANCE_FUTURES_API_SECRET,
  };
}

export async function futuresPublicRequest(path: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;

  const response = await fetch(url);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const payload = parseBinanceErrorPayload(text || '');
    throw new BinanceFuturesError(
      `Binance public API error (${response.status})${payload.msg ? `: ${payload.msg}` : ''}`,
      {
        status: 502,
        binanceCode: payload.code,
        binanceMessage: payload.msg,
        path,
        method: 'GET',
        raw: text || null,
      }
    );
  }

  return parsed;
}

export async function futuresSignedRequest<T = any>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  method: FuturesRequestMethod = 'GET'
): Promise<T> {
  const { apiKey, secret } = ensureFuturesCredentials();

  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    normalized[k] = String(v);
  }
  if (!normalized.timestamp) normalized.timestamp = String(Date.now());

  const qs = new URLSearchParams(normalized).toString();
  const signature = sign(qs, secret);
  const url = `${BASE_URL}${path}?${qs}&signature=${signature}`;

  const response = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey },
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const payload = parseBinanceErrorPayload(text || '');
    throw new BinanceFuturesError(
      `Binance signed API error (${response.status})${payload.msg ? `: ${payload.msg}` : ''}`,
      {
        status: 502,
        binanceCode: payload.code,
        binanceMessage: payload.msg,
        path,
        method,
        raw: text || null,
      }
    );
  }

  return (parsed as T) ?? ({} as T);
}

export function isOrderTypeUnsupported(error: unknown) {
  if (!(error instanceof BinanceFuturesError)) return false;
  if (error.binanceCode === -4120) return true;

  const haystack = `${error.message || ''} ${error.binanceMessage || ''}`.toLowerCase();
  return haystack.includes('order type not supported') || haystack.includes('algo order');
}

export async function getSymbolRules(symbol: string) {
  const data = await futuresPublicRequest('/fapi/v1/exchangeInfo');
  const symbolInfo = Array.isArray((data as any)?.symbols)
    ? (data as any).symbols.find((s: any) => s.symbol === symbol)
    : null;

  if (!symbolInfo) {
    throw new BinanceFuturesError(`Symbol not found on Binance Futures: ${symbol}`, {
      status: 404,
      path: '/fapi/v1/exchangeInfo',
      method: 'GET',
    });
  }

  const lotSizeFilter = Array.isArray(symbolInfo.filters)
    ? symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE')
    : null;
  const priceFilter = Array.isArray(symbolInfo.filters)
    ? symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER')
    : null;

  return {
    stepSize: asFiniteNumber(lotSizeFilter?.stepSize, 0.001),
    precision: Number(symbolInfo.quantityPrecision || 3),
    tickSize: asFiniteNumber(priceFilter?.tickSize, 0.01),
  };
}

export function roundToTick(value: number, tickSize: number) {
  if (!Number.isFinite(value) || !Number.isFinite(tickSize) || tickSize <= 0) return value;
  const rounded = Math.round(value / tickSize) * tickSize;
  return Number(rounded.toFixed(8));
}

export async function fetchCurrentFuturesPrice(symbol: string) {
  const data = await futuresPublicRequest('/fapi/v1/ticker/price', { symbol });
  const price = asFiniteNumber((data as any)?.price, NaN);
  if (!Number.isFinite(price) || price <= 0) {
    throw new BinanceFuturesError('No se pudo obtener precio válido de Binance Futures.', {
      status: 502,
      path: '/fapi/v1/ticker/price',
      method: 'GET',
      raw: JSON.stringify(data || {}),
    });
  }
  return price;
}

export async function setFuturesLeverage(symbol: string, leverage: number) {
  return futuresSignedRequest('/fapi/v1/leverage', { symbol, leverage }, 'POST');
}

export async function placeEntryOrder(params: {
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}) {
  const payload: Record<string, string | number | boolean> = {
    symbol: params.symbol,
    side: params.side,
    type: params.orderType,
    quantity: params.quantity,
  };

  if (params.orderType === 'LIMIT') {
    payload.price = params.price || 0;
    payload.timeInForce = params.timeInForce || 'GTC';
  }

  return futuresSignedRequest('/fapi/v1/order', payload, 'POST');
}

export async function fetchOpenOrders(symbol: string) {
  const orders = await futuresSignedRequest<any[]>('/fapi/v1/openOrders', { symbol }, 'GET');
  return Array.isArray(orders) ? orders : [];
}

async function fetchOpenAlgoOrders(symbol: string) {
  try {
    const orders = await futuresSignedRequest<any[]>('/fapi/v1/openAlgoOrders', { symbol }, 'GET');
    return Array.isArray(orders) ? orders : [];
  } catch {
    return [];
  }
}

export async function cancelProtectiveOrders(symbol: string) {
  const openOrders = await fetchOpenOrders(symbol);
  let canceledRegular = 0;
  let canceledAlgo = 0;

  for (const order of openOrders) {
    const type = String(order?.type || '').toUpperCase();
    const orderId = Number(order?.orderId || 0);
    if (!PROTECTIVE_ORDER_TYPES.has(type) || !(orderId > 0)) continue;

    await futuresSignedRequest('/fapi/v1/order', { symbol, orderId }, 'DELETE');
    canceledRegular += 1;
  }

  const openAlgoOrders = await fetchOpenAlgoOrders(symbol);
  if (openAlgoOrders.length > 0) {
    try {
      await futuresSignedRequest('/fapi/v1/algoOpenOrders', { symbol }, 'DELETE');
      canceledAlgo = openAlgoOrders.length;
    } catch {
      // Best effort; continue.
    }
  }

  return {
    canceledRegular,
    canceledAlgo,
  };
}

export async function placeProtectiveOrderWithFallback(params: {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: ProtectiveOrderType;
  stopPrice: number;
  closePosition?: boolean;
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  reduceOnly?: boolean;
  quantity?: number;
}) {
  const payload: Record<string, string | number | boolean> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    stopPrice: params.stopPrice,
    workingType: params.workingType || 'MARK_PRICE',
  };

  if (params.closePosition !== false) payload.closePosition = true;
  if (params.reduceOnly === true) payload.reduceOnly = true;
  if (Number.isFinite(params.quantity as number) && (params.quantity as number) > 0) {
    payload.quantity = Number(params.quantity);
  }

  try {
    const data = await futuresSignedRequest('/fapi/v1/order', payload, 'POST');
    return {
      success: true,
      endpoint: 'order' as const,
      fallbackUsed: false,
      data,
    };
  } catch (primaryError: any) {
    if (!isOrderTypeUnsupported(primaryError)) {
      throw primaryError;
    }

    const algoPayload: Record<string, string | number | boolean> = {
      symbol: params.symbol,
      side: params.side,
      // Binance USDT-M futures algo endpoint requires algoType=CONDITIONAL.
      algoType: 'CONDITIONAL',
      type: params.type,
      triggerPrice: params.stopPrice,
      workingType: params.workingType || 'MARK_PRICE',
    };
    if (params.closePosition !== false) algoPayload.closePosition = true;
    if (params.reduceOnly === true && params.closePosition === false) algoPayload.reduceOnly = true;
    if (Number.isFinite(params.quantity as number) && (params.quantity as number) > 0 && params.closePosition === false) {
      algoPayload.quantity = Number(params.quantity);
    }

    try {
      const data = await futuresSignedRequest('/fapi/v1/algoOrder', algoPayload, 'POST');
      return {
        success: true,
        endpoint: 'algoOrder' as const,
        fallbackUsed: true,
        data,
        primaryError,
      };
    } catch (fallbackError: any) {
      throw new BinanceFuturesError(
        `Error colocando orden de protección (${params.type}) en endpoint estándar y algo endpoint.`,
        {
          status: 502,
          binanceCode: fallbackError?.binanceCode ?? primaryError?.binanceCode ?? null,
          binanceMessage: fallbackError?.binanceMessage ?? primaryError?.binanceMessage ?? null,
          path: '/fapi/v1/order|/fapi/v1/algoOrder',
          method: 'POST',
          raw: JSON.stringify({
            primary: primaryError?.raw || primaryError?.message,
            fallback: fallbackError?.raw || fallbackError?.message,
          }),
        }
      );
    }
  }
}

export async function recordProtectionAudit(params: {
  tradeId?: number | null;
  symbol: string;
  action: string;
  orderKind: 'SL' | 'TP';
  attemptedEndpoint: 'order' | 'algoOrder';
  fallbackUsed?: boolean;
  success: boolean;
  binanceCode?: number | null;
  binanceMessage?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    await query(
      `INSERT INTO binance_protection_audit (
         trade_id,
         symbol,
         action,
         order_kind,
         attempted_endpoint,
         fallback_used,
         success,
         binance_code,
         binance_message,
         details,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())`,
      [
        params.tradeId || null,
        params.symbol,
        params.action,
        params.orderKind,
        params.attemptedEndpoint,
        Boolean(params.fallbackUsed),
        Boolean(params.success),
        params.binanceCode ?? null,
        params.binanceMessage ?? null,
        JSON.stringify(params.details || {}),
      ]
    );
  } catch {
    // Best effort audit logging.
  }
}
