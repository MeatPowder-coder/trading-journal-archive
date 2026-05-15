import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  CvdPoint,
  FootprintBin,
  LiquidationEvent,
  MarketType,
  MarketAggTrade,
  MarketCandle,
  Timeframe,
  TradingWorkspaceState,
} from '../types';

const MAX_CANDLES = 240;
const MAX_CVD = 800;
const MAX_FOOTPRINT = 900;
const MAX_LIQUIDATIONS = 120;
const FOOTPRINT_BUCKET_SIZE = 10;

function trim<T>(items: T[], max: number) {
  return items.length > max ? items.slice(items.length - max) : items;
}

function createInitialState(symbol: string, timeframe: Timeframe, marketType: MarketType): TradingWorkspaceState {
  return { symbol, marketType, timeframe, candles: [], cvd: [], footprint: [], liquidations: [] };
}

function timeframeToMs(timeframe: Timeframe) {
  switch (timeframe) {
    case '1m': return 60_000;
    case '3m': return 180_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '30m': return 1_800_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1d': return 86_400_000;
    default: return 60_000;
  }
}

function bucketPrice(price: number) {
  return Math.round(price / FOOTPRINT_BUCKET_SIZE) * FOOTPRINT_BUCKET_SIZE;
}

export function useMarketData(symbol: string, timeframe: Timeframe, marketType: MarketType, enabled: boolean) {
  const [state, setState] = useState<TradingWorkspaceState>(() => createInitialState(symbol, timeframe, marketType));
  const [status, setStatus] = useState('Market stream idle');

  useEffect(() => {
    setState(createInitialState(symbol, timeframe, marketType));
  }, [symbol, timeframe, marketType]);

  useEffect(() => {
    if (!enabled) {
      setStatus('Market stream paused');
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];
    let fallbackSocket: WebSocket | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSignalAt = 0;
    let fallbackActive = false;

    const markSignal = () => {
      lastSignalAt = Date.now();
    };

    const addCvdAndFootprint = (trade: MarketAggTrade) => {
      markSignal();
      setState((current) => {
        const delta = trade.buyerMaker ? -trade.quantity : trade.quantity;
        const cumulative = (current.cvd[current.cvd.length - 1]?.cumulative || 0) + delta;
        const cvdPoint: CvdPoint = {
          symbol: trade.symbol,
          timestamp: trade.eventTime,
          delta,
          cumulative,
        };

        const candleMs = timeframeToMs(timeframe);
        const candleOpenTime = trade.eventTime - (trade.eventTime % candleMs);
        const priceBucket = bucketPrice(trade.price);
        const footprintIndex = current.footprint.findIndex(
          (item) => item.candleOpenTime === candleOpenTime && item.priceBucket === priceBucket
        );

        const baseBin: FootprintBin = footprintIndex >= 0
          ? current.footprint[footprintIndex]
          : {
              symbol: trade.symbol,
              candleOpenTime,
              priceBucket,
              bidVolume: 0,
              askVolume: 0,
              delta: 0,
              totalVolume: 0,
              imbalance: 0,
            };

        const bidVolume = baseBin.bidVolume + (trade.buyerMaker ? trade.quantity : 0);
        const askVolume = baseBin.askVolume + (trade.buyerMaker ? 0 : trade.quantity);
        const totalVolume = bidVolume + askVolume;
        const nextBin: FootprintBin = {
          ...baseBin,
          bidVolume,
          askVolume,
          totalVolume,
          delta: askVolume - bidVolume,
          imbalance: totalVolume > 0 ? (askVolume - bidVolume) / totalVolume : 0,
        };

        const nextFootprint = footprintIndex >= 0
          ? current.footprint.map((item, index) => (index === footprintIndex ? nextBin : item))
          : [...current.footprint, nextBin];

        return {
          ...current,
          cvd: trim([...current.cvd, cvdPoint], MAX_CVD),
          footprint: trim(nextFootprint, MAX_FOOTPRINT),
        };
      });
    };

    const upsertCandle = (candle: MarketCandle) => {
      markSignal();
      setState((current) => {
        const existingIndex = current.candles.findIndex((item) => item.openTime === candle.openTime);
        const candles = existingIndex >= 0
          ? current.candles.map((item, index) => (index === existingIndex ? candle : item))
          : [...current.candles, candle];
        return { ...current, candles: trim(candles, MAX_CANDLES) };
      });
    };

    const appendLiquidation = (liquidation: LiquidationEvent) => {
      markSignal();
      setState((current) => ({
        ...current,
        liquidations: trim([...current.liquidations, liquidation], MAX_LIQUIDATIONS),
      }));
    };

    const closeFallback = () => {
      if (fallbackSocket) {
        fallbackSocket.close();
        fallbackSocket = null;
      }
      fallbackActive = false;
    };

    const startBrowserFallback = () => {
      if (fallbackActive || disposed) return;
      fallbackActive = true;
      setStatus(`Live ${symbol} ${timeframe} (${marketType}) via browser fallback`);

      const lower = symbol.toLowerCase();
      const streamPath = marketType === 'futures'
        ? `${lower}@kline_${timeframe}/${lower}@aggTrade/${lower}@forceOrder`
        : `${lower}@kline_${timeframe}/${lower}@aggTrade`;
      const wsBase = marketType === 'futures'
        ? 'wss://fstream.binance.com/stream'
        : 'wss://stream.binance.com:9443/stream';
      const ws = new WebSocket(`${wsBase}?streams=${streamPath}`);
      fallbackSocket = ws;

      ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(String(event.data));
          const data = envelope?.data || envelope;
          const eventType = String(data?.e || '');

          if (eventType === 'kline') {
            const k = data.k || data;
            const candle: MarketCandle = {
              symbol: String(k?.s || symbol).toUpperCase(),
              timeframe: String(k?.i || timeframe),
              openTime: Number(k?.t || 0),
              closeTime: Number(k?.T || 0),
              open: Number(k?.o || 0),
              high: Number(k?.h || 0),
              low: Number(k?.l || 0),
              close: Number(k?.c || 0),
              volume: Number(k?.v || 0),
              closed: Boolean(k?.x),
            };
            if (candle.symbol === symbol && candle.timeframe === timeframe) {
              upsertCandle(candle);
            }
            return;
          }

          if (eventType === 'aggTrade') {
            const trade: MarketAggTrade = {
              symbol: String(data?.s || symbol).toUpperCase(),
              eventTime: Number(data?.E || Date.now()),
              price: Number(data?.p || 0),
              quantity: Number(data?.q || 0),
              buyerMaker: Boolean(data?.m),
            };
            if (trade.symbol === symbol) {
              addCvdAndFootprint(trade);
            }
            return;
          }

          if (eventType === 'forceOrder') {
            const order = data?.o || data;
            const liquidation: LiquidationEvent = {
              symbol: String(order?.s || symbol).toUpperCase(),
              eventTime: Number(data?.E || Date.now()),
              side: String(order?.S || 'SELL') === 'BUY' ? 'BUY' : 'SELL',
              price: Number(order?.p || 0),
              quantity: Number(order?.q || 0),
              source: 'Binance forceOrder',
            };
            if (liquidation.symbol === symbol) {
              appendLiquidation(liquidation);
            }
          }
        } catch {
          // Ignore malformed websocket events.
        }
      };

      ws.onerror = () => {
        if (!disposed) {
          setStatus(`Market fallback stream error for ${symbol}`);
        }
      };
      ws.onclose = () => {
        if (!disposed && fallbackActive) {
          setStatus('Market fallback disconnected');
        }
      };
    };

    async function attach() {
      try {
        unlisteners.push(await listen<MarketCandle>('market:candle', (event) => {
          const candle = event.payload;
          if (candle.symbol !== symbol || candle.timeframe !== timeframe) return;
          upsertCandle(candle);
          if (fallbackActive) closeFallback();
        }));

        unlisteners.push(await listen<MarketAggTrade>('market:aggTrade', () => {
          // Raw aggTrades are intentionally not stored in React state; Rust emits normalized CVD/footprint.
        }));

        unlisteners.push(await listen<CvdPoint>('market:cvd', (event) => {
          const point = event.payload;
          if (point.symbol !== symbol) return;
          markSignal();
          setState((current) => ({ ...current, cvd: trim([...current.cvd, point], MAX_CVD) }));
          if (fallbackActive) closeFallback();
        }));

        unlisteners.push(await listen<FootprintBin>('market:footprint', (event) => {
          const bin = event.payload;
          if (bin.symbol !== symbol) return;
          markSignal();
          setState((current) => {
            const index = current.footprint.findIndex(
              (item) => item.candleOpenTime === bin.candleOpenTime && item.priceBucket === bin.priceBucket
            );
            const footprint = index >= 0
              ? current.footprint.map((item, itemIndex) => (itemIndex === index ? bin : item))
              : [...current.footprint, bin];
            return { ...current, footprint: trim(footprint, MAX_FOOTPRINT) };
          });
          if (fallbackActive) closeFallback();
        }));

        unlisteners.push(await listen<LiquidationEvent>('market:liquidation', (event) => {
          const liquidation = event.payload;
          if (liquidation.symbol !== symbol) return;
          appendLiquidation(liquidation);
          if (fallbackActive) closeFallback();
        }));

        await invoke('subscribe_market_data', { symbol, timeframe, marketType });
        markSignal();
        if (!disposed) setStatus(`Live ${symbol} ${timeframe} ${marketType === 'futures' ? 'Futures' : 'Spot'}`);
        fallbackTimer = setTimeout(() => {
          if (disposed) return;
          const elapsed = Date.now() - lastSignalAt;
          if (elapsed > 4_000) {
            startBrowserFallback();
          }
        }, 4_500);
      } catch (error) {
        if (!disposed) {
          const reason = error instanceof Error ? error.message : 'Market stream unavailable';
          setStatus(`${reason}. Trying browser fallback...`);
          startBrowserFallback();
        }
      }
    }

    attach();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
      if (fallbackTimer) clearTimeout(fallbackTimer);
      closeFallback();
      invoke('unsubscribe_market_data', { symbol, marketType }).catch(() => undefined);
    };
  }, [enabled, marketType, symbol, timeframe]);

  const latestCandle = state.candles[state.candles.length - 1] || null;
  const latestCvd = state.cvd[state.cvd.length - 1] || null;

  const summary = useMemo(() => ({
    latestPrice: latestCandle?.close ?? null,
    cvd: latestCvd?.cumulative ?? 0,
    candleCount: state.candles.length,
    liquidationCount: state.liquidations.length,
  }), [latestCandle?.close, latestCvd?.cumulative, state.candles.length, state.liquidations.length]);

  const captureSnapshot = useCallback(() => ({
    symbol,
    marketType,
    timeframe,
    asOf: new Date().toISOString(),
    latestPrice: latestCandle?.close ?? null,
    cvd: latestCvd?.cumulative ?? 0,
    candles: state.candles.slice(-50),
    footprint: state.footprint.slice(-120),
    liquidations: state.liquidations.slice(-30),
  }), [latestCandle?.close, latestCvd?.cumulative, marketType, state.candles, state.footprint, state.liquidations, symbol, timeframe]);

  return { state, status, summary, captureSnapshot };
}
