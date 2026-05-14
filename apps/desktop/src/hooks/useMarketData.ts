import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  CvdPoint,
  FootprintBin,
  LiquidationEvent,
  MarketAggTrade,
  MarketCandle,
  Timeframe,
  TradingWorkspaceState,
} from '../types';

const MAX_CANDLES = 240;
const MAX_CVD = 800;
const MAX_FOOTPRINT = 900;
const MAX_LIQUIDATIONS = 120;

function trim<T>(items: T[], max: number) {
  return items.length > max ? items.slice(items.length - max) : items;
}

function createInitialState(symbol: string, timeframe: Timeframe): TradingWorkspaceState {
  return { symbol, timeframe, candles: [], cvd: [], footprint: [], liquidations: [] };
}

export function useMarketData(symbol: string, timeframe: Timeframe, enabled: boolean) {
  const [state, setState] = useState<TradingWorkspaceState>(() => createInitialState(symbol, timeframe));
  const [status, setStatus] = useState('Market stream idle');

  useEffect(() => {
    setState(createInitialState(symbol, timeframe));
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!enabled) {
      setStatus('Market stream paused');
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    async function attach() {
      try {
        unlisteners.push(await listen<MarketCandle>('market:candle', (event) => {
          const candle = event.payload;
          if (candle.symbol !== symbol || candle.timeframe !== timeframe) return;
          setState((current) => {
            const existingIndex = current.candles.findIndex((item) => item.openTime === candle.openTime);
            const candles = existingIndex >= 0
              ? current.candles.map((item, index) => (index === existingIndex ? candle : item))
              : [...current.candles, candle];
            return { ...current, candles: trim(candles, MAX_CANDLES) };
          });
        }));

        unlisteners.push(await listen<MarketAggTrade>('market:aggTrade', () => {
          // Raw aggTrades are intentionally not stored in React state; Rust emits normalized CVD/footprint.
        }));

        unlisteners.push(await listen<CvdPoint>('market:cvd', (event) => {
          const point = event.payload;
          if (point.symbol !== symbol) return;
          setState((current) => ({ ...current, cvd: trim([...current.cvd, point], MAX_CVD) }));
        }));

        unlisteners.push(await listen<FootprintBin>('market:footprint', (event) => {
          const bin = event.payload;
          if (bin.symbol !== symbol) return;
          setState((current) => {
            const index = current.footprint.findIndex(
              (item) => item.candleOpenTime === bin.candleOpenTime && item.priceBucket === bin.priceBucket
            );
            const footprint = index >= 0
              ? current.footprint.map((item, itemIndex) => (itemIndex === index ? bin : item))
              : [...current.footprint, bin];
            return { ...current, footprint: trim(footprint, MAX_FOOTPRINT) };
          });
        }));

        unlisteners.push(await listen<LiquidationEvent>('market:liquidation', (event) => {
          const liquidation = event.payload;
          if (liquidation.symbol !== symbol) return;
          setState((current) => ({
            ...current,
            liquidations: trim([...current.liquidations, liquidation], MAX_LIQUIDATIONS),
          }));
        }));

        await invoke('subscribe_market_data', { symbol, timeframe });
        if (!disposed) setStatus(`Live ${symbol} ${timeframe}`);
      } catch (error) {
        if (!disposed) setStatus(error instanceof Error ? error.message : 'Market stream unavailable');
      }
    }

    attach();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
      invoke('unsubscribe_market_data', { symbol }).catch(() => undefined);
    };
  }, [enabled, symbol, timeframe]);

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
    timeframe,
    asOf: new Date().toISOString(),
    latestPrice: latestCandle?.close ?? null,
    cvd: latestCvd?.cumulative ?? 0,
    candles: state.candles.slice(-50),
    footprint: state.footprint.slice(-120),
    liquidations: state.liquidations.slice(-30),
  }), [latestCandle?.close, latestCvd?.cumulative, state.candles, state.footprint, state.liquidations, symbol, timeframe]);

  return { state, status, summary, captureSnapshot };
}
