import { useEffect, useMemo, useRef } from 'react';
import type { MarketType, TradingWorkspaceState } from '../types';

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

function toTvInterval(timeframe: string) {
  switch (timeframe) {
    case '1m': return '1';
    case '3m': return '3';
    case '5m': return '5';
    case '15m': return '15';
    case '30m': return '30';
    case '1h': return '60';
    case '4h': return '240';
    case '1d': return '1D';
    default: return '5';
  }
}

function toTvSymbol(symbol: string, marketType: MarketType) {
  if (marketType === 'futures') return `BINANCE:${symbol}.P`;
  return `BINANCE:${symbol}`;
}

function loadTradingViewScript() {
  if (window.TradingView) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load TradingView script'));
    document.head.appendChild(script);
  });
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value >= 100 ? value.toFixed(2) : value.toFixed(5);
}

export function TradingViewChartWorkspace({
  state,
  active,
}: {
  state: TradingWorkspaceState;
  active?: boolean;
}) {
  const widgetId = useMemo(() => `tv-widget-${state.symbol.toLowerCase()}-${state.timeframe}`, [state.symbol, state.timeframe]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latest = state.candles[state.candles.length - 1] || null;

  useEffect(() => {
    let disposed = false;

    async function mountWidget() {
      if (!containerRef.current) return;
      await loadTradingViewScript();
      if (disposed || !containerRef.current || !window.TradingView) return;

      containerRef.current.innerHTML = '';
      const mount = document.createElement('div');
      mount.id = widgetId;
      mount.className = 'tv-widget-slot';
      containerRef.current.appendChild(mount);

      // Advanced chart style with drawing tools and indicator support.
      new window.TradingView.widget({
        autosize: true,
        symbol: toTvSymbol(state.symbol, state.marketType),
        interval: toTvInterval(state.timeframe),
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        container_id: widgetId,
        toolbar_bg: '#0b1625',
        hide_side_toolbar: false,
        enable_publishing: false,
        withdateranges: true,
        save_image: true,
        studies: ['Volume@tv-basicstudies'],
      });

      // TradingView sometimes needs a manual resize pulse on first mount.
      setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
    }

    mountWidget().catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [state.marketType, state.symbol, state.timeframe, widgetId]);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
    return () => clearTimeout(id);
  }, [active]);

  return (
    <section className="chart-shell">
      <div className="chart-head">
        <div>
          <p className="eyebrow">Trading Desk</p>
          <h2>{state.symbol} <span>{state.timeframe} · {state.marketType === 'futures' ? 'Futures' : 'Spot'}</span></h2>
        </div>
        <div className="price-stack">
          <span>Last</span>
          <strong>{formatPrice(latest?.close)}</strong>
        </div>
      </div>
      <div ref={containerRef} className="tradingview-container" />
    </section>
  );
}
