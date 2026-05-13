"use client";

import { useEffect, useMemo, useState } from "react";

interface Trade {
  id: number | string;
  ticker_api: string;
  simbolo: string;
  precio_entrada: number;
  direccion: string;
  apalancamiento: number;
  monto_margin: number;
  estado: string;
  broker?: string | null;
  order_type?: string | null;
  entry_order_status?: string | null;
}

interface PriceData {
  [ticker: string]: number;
}

interface TradeExtremesMap {
  [tradeId: string]: {
    mae: number;
    mfe: number;
  };
}

function resolveTicker(trade: Trade) {
  const apiTicker = String(trade.ticker_api || "").trim().toUpperCase();
  if (apiTicker) return apiTicker;
  return String(trade.simbolo || "").trim().toUpperCase();
}

function isLivePosition(trade: Trade) {
  if (trade.estado !== "OPEN") return false;
  const orderType = String(trade.order_type || "MARKET").toUpperCase();
  const entryStatus = String(trade.entry_order_status || "FILLED").toUpperCase();
  if (orderType !== "LIMIT") return true;
  return entryStatus === "FILLED" || entryStatus === "PARTIALLY_FILLED";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function createReconnectableSocket(params: {
  urls: string[];
  onPayload: (payload: any) => void;
}) {
  const { urls, onPayload } = params;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closedByUser = false;
  let currentUrlIndex = 0;
  let receivedMessageOnThisUrl = false;

  const connect = () => {
    if (closedByUser) return;
    const url = urls[Math.min(currentUrlIndex, urls.length - 1)];
    receivedMessageOnThisUrl = false;
    socket = new WebSocket(url);

    socket.onmessage = (event) => {
      receivedMessageOnThisUrl = true;
      try {
        const payload = JSON.parse(event.data);
        onPayload(payload);
      } catch {
        // Ignore malformed messages
      }
    };

    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        // no-op
      }
    };

    socket.onclose = () => {
      if (closedByUser) return;

      if (!receivedMessageOnThisUrl && currentUrlIndex < urls.length - 1) {
        currentUrlIndex += 1;
      }

      reconnectTimer = window.setTimeout(connect, 1200);
    };
  };

  connect();

  return () => {
    closedByUser = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    try {
      socket?.close();
    } catch {
      // no-op
    }
  };
}

export function useRealTimePnL(trades: Trade[] = [], extraTickers: string[] = []) {
  const [prices, setPrices] = useState<PriceData>({});
  const [loading, setLoading] = useState(true);
  const [binancePrices, setBinancePrices] = useState<PriceData>({});
  const [tradeExtremes, setTradeExtremes] = useState<TradeExtremesMap>({});

  const liveTrades = useMemo(
    () => (trades || []).filter((t) => isLivePosition(t)),
    [trades]
  );

  const { futuresTickers, spotTickers, yahooTickers } = useMemo(() => {
    const binanceTrades = liveTrades.filter((t) => String(t.broker || "").toUpperCase().startsWith("BINANCE"));
    const futuresTrades = binanceTrades.filter((t) => String(t.broker || "").toUpperCase().includes("FUTURES"));
    const spotTrades = binanceTrades.filter((t) => !String(t.broker || "").toUpperCase().includes("FUTURES"));
    const nonBinanceTrades = liveTrades.filter((t) => !String(t.broker || "").toUpperCase().startsWith("BINANCE"));

    return {
      futuresTickers: unique(futuresTrades.map((t) => resolveTicker(t))),
      spotTickers: unique(spotTrades.map((t) => resolveTicker(t))),
      yahooTickers: unique([
        ...nonBinanceTrades.map((t) => resolveTicker(t)),
        ...extraTickers.map((t) => String(t || "").trim().toUpperCase()),
      ]),
    };
  }, [liveTrades, extraTickers]);

  const futuresKey = futuresTickers.join("|");
  const spotKey = spotTickers.join("|");
  const yahooKey = yahooTickers.join("|");

  // Yahoo-like symbols: one-shot fetch (no polling).
  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      if (yahooTickers.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const results = await Promise.all(
          yahooTickers.map(async (ticker) => {
            try {
              const controller = new AbortController();
              const timeoutId = window.setTimeout(() => controller.abort(), 10000);
              const res = await fetch(`/api/yahoo-price/${encodeURIComponent(ticker)}`, {
                signal: controller.signal,
                cache: "no-store",
              });
              window.clearTimeout(timeoutId);
              if (!res.ok) return null;
              const rawData = await res.json().catch(() => ({}));
              const data = Array.isArray(rawData) ? rawData[0] : rawData;
              const quote = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
              if (!Number.isFinite(quote) || quote <= 0) return null;
              return { ticker, quote };
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;
        const next: PriceData = {};
        for (const row of results) {
          if (!row) continue;
          next[row.ticker] = row.quote;
        }
        if (Object.keys(next).length > 0) {
          setPrices((prev) => ({ ...prev, ...next }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchOnce();
    return () => {
      cancelled = true;
    };
  }, [yahooKey]);

  // Spot prices via WebSocket.
  useEffect(() => {
    if (!spotTickers.length) return;
    const streams = spotTickers.map((t) => `${t.toLowerCase()}@miniTicker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    return createReconnectableSocket({
      urls: [url],
      onPayload: (payload) => {
        const data = payload?.data || payload;
        const symbol = String(data?.s || "").toUpperCase();
        const lastPrice = Number(data?.c || 0);
        if (!symbol || !Number.isFinite(lastPrice) || lastPrice <= 0) return;
        setBinancePrices((prev) => ({ ...prev, [symbol]: lastPrice }));
      },
    });
  }, [spotKey]);

  // Futures prices via WebSocket only (no polling).
  useEffect(() => {
    if (!futuresTickers.length) return;

    const streams = futuresTickers.map((t) => `${t.toLowerCase()}@markPrice@1s`).join("/");
    const urls = [
      `wss://fstream.binance.com/market/stream?streams=${streams}`,
      `wss://fstream.binance.com/stream?streams=${streams}`,
    ];

    return createReconnectableSocket({
      urls,
      onPayload: (payload) => {
        const data = payload?.data || payload;
        const symbol = String(data?.s || "").toUpperCase();
        const markPrice = Number(data?.p || 0);
        if (!symbol || !Number.isFinite(markPrice) || markPrice <= 0) return;
        setBinancePrices((prev) => ({ ...prev, [symbol]: markPrice }));
      },
    });
  }, [futuresKey]);

  useEffect(() => {
    setTradeExtremes((prev) => {
      const next: TradeExtremesMap = { ...prev };
      const openIds = new Set(liveTrades.map((t) => String(t.id)));

      for (const tradeId of Object.keys(next)) {
        if (!openIds.has(tradeId)) delete next[tradeId];
      }

      for (const trade of liveTrades) {
        const tradeId = String(trade.id);
        const ticker = resolveTicker(trade);
        if (!ticker) continue;

        const broker = String(trade.broker || "").toUpperCase();
        const currentPrice = broker.startsWith("BINANCE")
          ? binancePrices[ticker]
          : prices[ticker];

        if (!Number.isFinite(Number(currentPrice)) || Number(currentPrice) <= 0) continue;

        const price = Number(currentPrice);
        const entry = Number(trade.precio_entrada || 0);
        const startPrice = entry > 0 ? entry : price;
        const existing = next[tradeId] || { mae: startPrice, mfe: startPrice };

        if (trade.direccion === "SHORT") {
          existing.mae = Math.max(existing.mae, price);
          existing.mfe = Math.min(existing.mfe, price);
        } else {
          existing.mae = Math.min(existing.mae, price);
          existing.mfe = Math.max(existing.mfe, price);
        }

        next[tradeId] = existing;
      }

      return next;
    });
  }, [liveTrades, prices, binancePrices]);

  const calculateRealTimePnL = (trade: Trade): number => {
    if (!isLivePosition(trade)) return 0;

    const ticker = resolveTicker(trade);
    if (!ticker) return 0;

    const broker = String(trade.broker || "").toUpperCase();
    const currentPrice = broker.startsWith("BINANCE")
      ? binancePrices[ticker]
      : prices[ticker];

    if (!Number.isFinite(Number(currentPrice)) || Number(currentPrice) <= 0) return 0;

    const entryPrice = Number(trade.precio_entrada);
    const margin = Number(trade.monto_margin);
    const leverage = Number(trade.apalancamiento);
    const price = Number(currentPrice);

    if (!Number.isFinite(entryPrice) || !Number.isFinite(margin) || !Number.isFinite(leverage) || entryPrice <= 0) {
      return 0;
    }

    const priceDiff = price - entryPrice;
    const directionalDiff = trade.direccion === "LONG" ? priceDiff : -priceDiff;
    return (directionalDiff / entryPrice) * margin * leverage;
  };

  const totalUnrealizedPnL = liveTrades.reduce((sum, trade) => sum + calculateRealTimePnL(trade), 0);

  return {
    prices: { ...prices, ...binancePrices },
    loading,
    calculateRealTimePnL,
    totalUnrealizedPnL,
    tradeExtremes,
  };
}
