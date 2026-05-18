import type { FastifyInstance } from 'fastify';
import { resolveDesktopAuth } from '../auth';
import { query } from '../db';
import { addEventClient } from '../events';

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getMaxRiskAmount(balanceUsdt: number) {
  const twoPercent = balanceUsdt * 0.02;
  if (twoPercent < 5) {
    return {
      amount: twoPercent,
      warning: `Con $${balanceUsdt.toFixed(2)} de capital, el 2% es $${twoPercent.toFixed(2)}.`,
      blocking: false,
    };
  }
  return {
    amount: twoPercent,
    warning: null as string | null,
    blocking: true,
  };
}

async function getLatestBalanceUsdt() {
  const snapshot = await query(
    `SELECT balance_usdt
     FROM account_snapshots
     ORDER BY recorded_at DESC
     LIMIT 1`
  );
  if (snapshot.rows.length > 0) return toNumber(snapshot.rows[0].balance_usdt, 0);

  const account = await query(
    `SELECT saldo_actual
     FROM cuentas
     WHERE id = 1
     LIMIT 1`
  );
  if (account.rows.length > 0) return toNumber(account.rows[0].saldo_actual, 0);
  return 0;
}

async function getTradingBlockInfo(now = new Date()) {
  const isoDate = now.toISOString().slice(0, 10);
  const session = await query(
    `SELECT *
     FROM trading_sessions
     WHERE session_date = $1
     LIMIT 1`,
    [isoDate]
  );

  const row = session.rows[0] || null;
  if (!row?.blocked_until) {
    return {
      blocked: false,
      blockedUntil: null as string | null,
      remainingSeconds: 0,
      session: row,
    };
  }

  const blockedUntil = new Date(row.blocked_until);
  if (blockedUntil.getTime() <= now.getTime()) {
    return {
      blocked: false,
      blockedUntil: row.blocked_until,
      remainingSeconds: 0,
      session: row,
    };
  }

  return {
    blocked: true,
    blockedUntil: row.blocked_until,
    remainingSeconds: Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000),
    session: row,
  };
}

function normalizeTicker(raw: unknown) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function isBinanceStyleSymbol(ticker: string) {
  return /^(?:[A-Z0-9]{2,12})(USDT|USDC|BUSD|FDUSD)$/.test(ticker);
}

function isLikelyCryptoBase(ticker: string) {
  return /^[A-Z0-9]{2,12}$/.test(ticker) && !ticker.includes('=');
}

async function fetchBinancePublicPrice(symbol: string) {
  const normalized = normalizeTicker(symbol);
  if (!normalized) return null;

  const tryParsePrice = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null as any);
    const price = Number(payload?.price);
    return Number.isFinite(price) ? price : null;
  };

  const futures = await tryParsePrice(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(normalized)}`
  );
  if (futures != null) return futures;

  const spot = await tryParsePrice(
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(normalized)}`
  );
  if (spot != null) return spot;

  return null;
}

async function fetchYahooPrice(ticker: string) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return null;

  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?interval=1m&range=1d`
  );
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null as any);
  const result = payload?.chart?.result?.[0];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const price = Number(closes[i]);
    if (Number.isFinite(price)) return price;
  }
  return null;
}

async function resolveTickerPrice(ticker: string) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return null;

  if (isBinanceStyleSymbol(normalized)) {
    const direct = await fetchBinancePublicPrice(normalized);
    if (direct != null) return direct;
  }

  // Try Yahoo directly first for equities and custom tickers (e.g. VOO, AAPL, USDCOP=X).
  const yahooDirect = await fetchYahooPrice(normalized);
  if (yahooDirect != null) return yahooDirect;

  // If ticker looks like a crypto base (e.g. ETH), try Binance pair + Yahoo "-USD".
  if (isLikelyCryptoBase(normalized)) {
    const binanceUsdt = await fetchBinancePublicPrice(`${normalized}USDT`);
    if (binanceUsdt != null) return binanceUsdt;

    const yahooUsd = await fetchYahooPrice(`${normalized}-USD`);
    if (yahooUsd != null) return yahooUsd;
  }

  return null;
}

export async function registerDesktopRoutes(instance: FastifyInstance) {
  instance.get('/health', async () => ({
    ok: true,
    service: 'trading-journal-api',
    timestamp: new Date().toISOString(),
  }));

  instance.get('/v1/desktop/session', async (request, reply) => {
    const auth = await resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    const result = await query(
      `SELECT id, status, client_name, client_platform, created_at, approved_at, exchanged_at, revoked_at, updated_at
       FROM desktop_device_sessions
       WHERE id = $1
       LIMIT 1`,
      [auth.deviceSessionId]
    );

    if (!result.rows.length) {
      return reply.code(404).send({ error: 'Desktop device session not found' });
    }

    const row = result.rows[0];
    if (row.revoked_at || String(row.status || '').toUpperCase() !== 'EXCHANGED') {
      return reply.code(403).send({ error: 'Desktop device session is not active' });
    }

    return {
      authenticated: true,
      user: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
      },
      deviceSession: {
        id: row.id,
        status: row.status,
        clientName: row.client_name || null,
        clientPlatform: row.client_platform || null,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        exchangedAt: row.exchanged_at,
        updatedAt: row.updated_at,
      },
    };
  });

  instance.get('/v1/desktop/cockpit', async (request, reply) => {
    const auth = await resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    const now = new Date();
    const [balanceUsdt, blockInfo, openTrades, pendingOrders, recentTrades] = await Promise.all([
      getLatestBalanceUsdt(),
      getTradingBlockInfo(now),
      query(
        `SELECT id, simbolo, direccion, estado, broker, exchange_type,
                precio_entrada, stop_loss, take_profit, sl_status, sl_was_moved,
                apalancamiento, monto_margin, risk_amount_usdt, risk_percent,
                rr_estimated, protection_required, protection_last_error,
                entry_order_status, order_type, fecha_apertura
         FROM trades_activos
         WHERE estado = 'OPEN'
         ORDER BY fecha_apertura DESC, id DESC
         LIMIT 80`
      ),
      query(
        `SELECT id, simbolo, direccion, order_status, broker, exchange_type,
                entry_price, stop_loss, take_profit, margin, leverage,
                checklist_confirmed, checklist_checked_count, checklist_total,
                created_at, updated_at, screenshot_url, setup_tag, timeframe
         FROM pending_limit_orders
         WHERE order_status IN ('NEW', 'PARTIALLY_FILLED')
         ORDER BY created_at DESC, id DESC
         LIMIT 80`
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT to_jsonb(t) AS trade
         FROM trades_activos t
         ORDER BY t.id DESC
         LIMIT 600`
      ).catch(() => ({ rows: [] })),
    ]);

    return {
      success: true,
      user: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
      },
      asOf: now.toISOString(),
      account: {
        balanceUsdt,
        maxRisk: getMaxRiskAmount(balanceUsdt),
      },
      discipline: {
        blocked: blockInfo.blocked,
        blockedUntil: blockInfo.blockedUntil,
        remainingSeconds: blockInfo.remainingSeconds,
        session: blockInfo.session,
      },
      openTrades: openTrades.rows,
      pendingOrders: pendingOrders.rows,
      recentTrades: recentTrades.rows.map((row: any) => row.trade || {}),
    };
  });

  instance.get('/v1/desktop/trades', async (request, reply) => {
    const auth = await resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    const parsed = new URL(request.url, 'http://localhost');
    const requestedLimit = Number(parsed.searchParams.get('limit') || '300');
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(30, Math.min(1000, Math.floor(requestedLimit)))
      : 300;

    const trades = await query(
      `SELECT to_jsonb(t) AS trade
       FROM trades_activos t
       ORDER BY t.id DESC
       LIMIT $1`,
      [limit]
    );

    return {
      success: true,
      asOf: new Date().toISOString(),
      total: trades.rows.length,
      trades: trades.rows.map((row: any) => row.trade || {}),
    };
  });

  instance.get('/v1/desktop/prices', async (request, reply) => {
    const auth = await resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    const parsed = new URL(request.url, 'http://localhost');
    const rawTickers = parsed.searchParams.get('tickers') || '';
    const tickers = Array.from(
      new Set(
        rawTickers
          .split(',')
          .map((value) => normalizeTicker(value))
          .filter(Boolean)
      )
    ).slice(0, 120);

    if (!tickers.length) {
      return {
        success: true,
        asOf: new Date().toISOString(),
        prices: {},
        unresolved: [],
      };
    }

    const settled = await Promise.allSettled(
      tickers.map(async (ticker) => ({
        ticker,
        price: await resolveTickerPrice(ticker),
      }))
    );

    const prices: Record<string, number> = {};
    const unresolved: string[] = [];

    settled.forEach((result, index) => {
      const ticker = tickers[index];
      if (result.status === 'fulfilled' && typeof result.value.price === 'number' && Number.isFinite(result.value.price)) {
        prices[ticker] = result.value.price;
      } else {
        unresolved.push(ticker);
      }
    });

    return {
      success: true,
      asOf: new Date().toISOString(),
      prices,
      unresolved,
    };
  });

  instance.get('/v1/desktop/bootstrap', async (request, reply) => {
    const auth = await resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    const now = new Date();
    const [sessionResult, cockpit] = await Promise.all([
      query(
        `SELECT id, status, client_name, client_platform, created_at, approved_at, exchanged_at, revoked_at, updated_at
         FROM desktop_device_sessions
         WHERE id = $1
         LIMIT 1`,
        [auth.deviceSessionId]
      ),
      (async () => {
        const [balanceUsdt, blockInfo, openTrades, pendingOrders, recentTrades] = await Promise.all([
          getLatestBalanceUsdt(),
          getTradingBlockInfo(now),
          query(
            `SELECT id, simbolo, direccion, estado, broker, exchange_type,
                    precio_entrada, stop_loss, take_profit, sl_status, sl_was_moved,
                    apalancamiento, monto_margin, risk_amount_usdt, risk_percent,
                    rr_estimated, protection_required, protection_last_error,
                    entry_order_status, order_type, fecha_apertura
             FROM trades_activos
             WHERE estado = 'OPEN'
             ORDER BY fecha_apertura DESC, id DESC
             LIMIT 80`
          ),
          query(
            `SELECT id, simbolo, direccion, order_status, broker, exchange_type,
                    entry_price, stop_loss, take_profit, margin, leverage,
                    checklist_confirmed, checklist_checked_count, checklist_total,
                    created_at, updated_at, screenshot_url, setup_tag, timeframe
             FROM pending_limit_orders
             WHERE order_status IN ('NEW', 'PARTIALLY_FILLED')
             ORDER BY created_at DESC, id DESC
             LIMIT 80`
          ).catch(() => ({ rows: [] })),
          query(
            `SELECT to_jsonb(t) AS trade
             FROM trades_activos t
             ORDER BY t.id DESC
             LIMIT 600`
          ).catch(() => ({ rows: [] })),
        ]);

        return {
          success: true,
          user: {
            id: auth.userId,
            email: auth.email,
            name: auth.name,
          },
          asOf: now.toISOString(),
          account: {
            balanceUsdt,
            maxRisk: getMaxRiskAmount(balanceUsdt),
          },
          discipline: {
            blocked: blockInfo.blocked,
            blockedUntil: blockInfo.blockedUntil,
            remainingSeconds: blockInfo.remainingSeconds,
            session: blockInfo.session,
          },
          openTrades: openTrades.rows,
          pendingOrders: pendingOrders.rows,
          recentTrades: recentTrades.rows.map((row: any) => row.trade || {}),
        };
      })(),
    ]);

    const row = sessionResult.rows[0] || null;
    return {
      success: true,
      asOf: now.toISOString(),
      session: {
        authenticated: true,
        user: {
          id: auth.userId,
          email: auth.email,
          name: auth.name,
        },
        deviceSession: row
          ? {
              id: row.id,
              status: row.status,
              clientName: row.client_name || null,
              clientPlatform: row.client_platform || null,
              createdAt: row.created_at,
              approvedAt: row.approved_at,
              exchangedAt: row.exchanged_at,
              updatedAt: row.updated_at,
            }
          : null,
      },
      cockpit,
      uiConfig: {
        defaultSymbol: process.env.DESKTOP_DEFAULT_SYMBOL || 'ETHUSDT',
        defaultTimeframe: process.env.DESKTOP_DEFAULT_TIMEFRAME || '5m',
        tabs: ['trading-desk', 'dashboard', 'live-market', 'chat', 'portfolio', 'cuentas', 'transacciones', 'alertas'],
      },
    };
  });

  instance.get('/v1/desktop/events', { websocket: true }, (socket, request) => {
    resolveDesktopAuth(request)
      .then((auth) => {
        if (!auth) {
          socket.close(1008, 'Desktop access token required');
          return;
        }

        addEventClient(socket);
        socket.send(JSON.stringify({
          type: 'risk.updated',
          timestamp: Date.now(),
          payload: {
            connected: true,
            deviceSessionId: auth.deviceSessionId,
          },
        }));
      })
      .catch(() => socket.close(1011, 'Desktop auth check failed'));
  });
}
