import { useEffect, useMemo, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { TradingWorkspaceState } from '../types';

function formatPrice(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value >= 100 ? value.toFixed(2) : value.toFixed(5);
}

export function ChartWorkspace({ state }: { state: TradingWorkspaceState }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const latest = state.candles[state.candles.length - 1] || null;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#07111d' },
        textColor: '#9db4ca',
        fontFamily: 'IBM Plex Sans, Segoe UI, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(62, 84, 112, 0.26)' },
        horzLines: { color: 'rgba(62, 84, 112, 0.26)' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#26394f' },
      timeScale: { borderColor: '#26394f', timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#7dd3a0',
      wickDownColor: '#fca5a5',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    candleSeries.setData(state.candles.map((candle) => ({
      time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));
  }, [state.candles]);

  const pressure = useMemo(() => {
    const recent = state.footprint.slice(-80);
    const bid = recent.reduce((sum, item) => sum + item.bidVolume, 0);
    const ask = recent.reduce((sum, item) => sum + item.askVolume, 0);
    const total = bid + ask;
    if (!total) return { bid: 50, ask: 50 };
    return { bid: (bid / total) * 100, ask: (ask / total) * 100 };
  }, [state.footprint]);

  return (
    <section className="chart-shell">
      <div className="chart-head">
        <div>
          <p className="eyebrow">Market Stream</p>
          <h2>{state.symbol} <span>{state.timeframe}</span></h2>
        </div>
        <div className="price-stack">
          <span>Last</span>
          <strong>{formatPrice(latest?.close)}</strong>
        </div>
      </div>
      <div ref={containerRef} className="candle-chart" />
      <div className="microstructure-strip">
        <div>
          <span>Bid Pressure</span>
          <b>{pressure.bid.toFixed(1)}%</b>
        </div>
        <div className="pressure-bar" aria-label="Bid ask pressure">
          <i style={{ width: `${pressure.bid}%` }} />
        </div>
        <div>
          <span>Ask Pressure</span>
          <b>{pressure.ask.toFixed(1)}%</b>
        </div>
      </div>
    </section>
  );
}
