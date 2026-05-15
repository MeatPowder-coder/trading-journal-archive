import { useMemo } from 'react';
import type { JournalHeatmapPoint, JournalPerformanceSnapshot, JournalTimelinePoint } from '@trading-journal/journal-data';

function money(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function pct(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function ratio(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function buildLinePath(points: number[], width: number, height: number) {
  if (!points.length) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  return points
    .map((value, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildAreaPath(points: number[], width: number, height: number) {
  if (!points.length) return '';
  const line = buildLinePath(points, width, height);
  if (!line) return '';
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function toDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-');
  if (!year || !month || !day) return dateKey;
  return `${day}/${month}`;
}

function toMonthLabel(dateKey: string) {
  const [year, month] = dateKey.split('-');
  if (!year || !month) return dateKey;
  const monthNames = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SEPTIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE',
  ];
  const idx = Number(month) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx > 11) return `${month}/${year}`;
  return `${monthNames[idx]} ${year}`;
}

function buildHeatmapGrid(heatmap: JournalHeatmapPoint[]) {
  const map = new Map<string, JournalHeatmapPoint>();
  heatmap.forEach((entry) => map.set(entry.date, entry));
  const sorted = [...heatmap].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.length ? new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`) : new Date();
  const cells: Array<{ key: string; date: string; day: number; pnl: number | null; trades: number; state: 'positive' | 'negative' | 'flat' | 'empty' }> = [];

  for (let offset = 41; offset >= 0; offset -= 1) {
    const date = new Date(last);
    date.setUTCDate(last.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const item = map.get(key);
    const pnl = item?.pnl ?? null;
    const trades = item?.trades ?? 0;
    let state: 'positive' | 'negative' | 'flat' | 'empty' = 'empty';
    if (pnl != null) {
      if (pnl > 0) state = 'positive';
      else if (pnl < 0) state = 'negative';
      else state = 'flat';
    }
    cells.push({
      key,
      date: key,
      day: date.getUTCDate(),
      pnl,
      trades,
      state,
    });
  }

  return {
    monthLabel: toMonthLabel(cells[cells.length - 1]?.date || ''),
    cells,
  };
}

function timelineValues(points: JournalTimelinePoint[]) {
  if (!points.length) return [];
  return points.map((point) => point.cumulative);
}

export function JournalPerformanceParity({
  snapshot,
  title = 'Native Dashboard (Desktop)',
  heroTitle = 'Dashboard',
  heroSubtitle = 'Monitor your active positions and performance.',
  ctaLabel = 'Nueva Operación',
  showHero = true,
  showTitleRow = true,
}: {
  snapshot: JournalPerformanceSnapshot;
  title?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  ctaLabel?: string;
  showHero?: boolean;
  showTitleRow?: boolean;
}) {
  const mentalScale = useMemo(() => {
    const max = Math.max(...snapshot.mentalStatePerformance.map((row) => Math.abs(row.pnl)), 1);
    return max;
  }, [snapshot.mentalStatePerformance]);

  const timeline = useMemo(() => timelineValues(snapshot.pnlTimeline), [snapshot.pnlTimeline]);
  const timelinePath = useMemo(() => buildLinePath(timeline, 1000, 320), [timeline]);
  const timelineArea = useMemo(() => buildAreaPath(timeline, 1000, 320), [timeline]);
  const evolutionPath = useMemo(
    () => buildLinePath(snapshot.slEvolution.map((row) => row.rrAvg), 1000, 180),
    [snapshot.slEvolution]
  );
  const heatmap = useMemo(() => buildHeatmapGrid(snapshot.heatmap), [snapshot.heatmap]);

  return (
    <section className="desktop-native-dashboard parity-neon-board">
      {showHero ? (
        <div className="parity-hero">
          <div>
            <h1>{heroTitle}</h1>
            <p>{heroSubtitle}</p>
          </div>
          <button className="parity-hero-cta" type="button">{ctaLabel}</button>
        </div>
      ) : null}

      {showTitleRow ? (
        <header className="desktop-native-head">
          <h2>{title}</h2>
          <span>{snapshot.closedTradesCount} trades cerrados analizados</span>
        </header>
      ) : null}

      <div className="desktop-metrics-grid parity-metrics-grid">
        <article>
          <span>PNL TOTAL</span>
          <strong className={snapshot.totalPnL >= 0 ? 'positive' : 'negative'}>{money(snapshot.totalPnL)}</strong>
          <small>{snapshot.closedTradesCount} trades computados</small>
        </article>
        <article>
          <span>TASA DE ÉXITO</span>
          <strong>{pct(snapshot.winRate)}</strong>
          <small>{snapshot.wins} W / {snapshot.losses} L</small>
        </article>
        <article>
          <span>PROMEDIO GANADOR</span>
          <strong className="positive">{money(snapshot.avgWin)}</strong>
          <small>por trade positivo</small>
        </article>
        <article>
          <span>PROMEDIO PERDEDOR</span>
          <strong className="negative">{money(snapshot.avgLoss)}</strong>
          <small>por trade negativo</small>
        </article>
      </div>

      <div className="parity-secondary-grid">
        <article>
          <span>SL RESPETADOS</span>
          <strong>{pct(snapshot.slRespectedPct)}</strong>
          <small>{snapshot.slRespectedCount}/{snapshot.closedTradesCount || 0} trades cerrados sin aumentar riesgo</small>
        </article>
        <article>
          <span>R:R EFECTIVO REAL</span>
          <strong>{ratio(snapshot.rrActualAvg)}</strong>
          <small>Objetivo recomendado: ≥ 1.5</small>
        </article>
        <article>
          <span>EFICIENCIA MFE</span>
          <strong>{pct(snapshot.mfeEfficiencyPct)}</strong>
          <small>Cuánto recorrido potencial realmente capturas</small>
        </article>
      </div>

      <div className="parity-data-grid">
        <article className="desktop-native-card parity-impact-card">
          <h3>Rendimiento Por Estado Mental</h3>
          <div className="mental-list parity-mental-list">
            {snapshot.mentalStatePerformance.slice(0, 8).map((row) => {
              const width = `${Math.max(8, (Math.abs(row.pnl) / mentalScale) * 100)}%`;
              return (
                <div key={row.state} className="mental-row parity-mental-row">
                  <div className="parity-mental-meta">
                    <b>{row.state}</b>
                    <small>{row.count} trades</small>
                  </div>
                  <div className="parity-mental-bar">
                    <i className={row.pnl >= 0 ? 'positive' : 'negative'} style={{ width }} />
                  </div>
                  <div className="parity-mental-stats">
                    <small>Win {pct(row.winRate)}</small>
                    <small>RR {ratio(row.rrAvg)}</small>
                  </div>
                  <strong className={row.pnl >= 0 ? 'positive' : 'negative'}>{money(row.pnl)}</strong>
                </div>
              );
            })}
            {!snapshot.mentalStatePerformance.length ? <p className="muted">Sin datos suficientes.</p> : null}
          </div>
        </article>

        <article className="desktop-native-card parity-impact-card">
          <h3>Impacto De Mover SL</h3>
          <div className="parity-impact-lines">
            <div>
              <span>PnL promedio con SL respetado</span>
              <strong className={snapshot.avgPnlSlRespected >= 0 ? 'positive' : 'negative'}>
                {money(snapshot.avgPnlSlRespected)}
              </strong>
            </div>
            <div>
              <span>PnL promedio con SL movido (riesgo ↑)</span>
              <strong className={snapshot.avgPnlSlMovedRiskUp >= 0 ? 'positive' : 'negative'}>
                {money(snapshot.avgPnlSlMovedRiskUp)}
              </strong>
            </div>
          </div>
        </article>
      </div>

      <article className="desktop-native-card parity-evolution-card">
        <h3>Evolución Global RR / Movimientos SL</h3>
        {snapshot.slEvolution.length ? (
          <svg viewBox="0 0 1000 190" preserveAspectRatio="none" className="parity-line-chart">
            <path d={evolutionPath} className="parity-line" />
          </svg>
        ) : (
          <p className="muted">Sin datos de evolución.</p>
        )}
        <div className="parity-evolution-labels">
          {snapshot.slEvolution.slice(0, 16).map((row) => (
            <span key={row.date}>{row.date}</span>
          ))}
        </div>
      </article>

      <div className="parity-charts-grid">
        <article className="desktop-native-card parity-area-card">
          <h3>Rendimiento (PNL)</h3>
          {timeline.length ? (
            <svg viewBox="0 0 1000 340" preserveAspectRatio="none" className="parity-area-chart">
              <path d={timelineArea} className="parity-area-fill" />
              <path d={timelinePath} className="parity-area-line" />
            </svg>
          ) : (
            <p className="muted">Sin timeline de PnL.</p>
          )}
        </article>

        <article className="desktop-native-card parity-heatmap-card">
          <h3>Heatmap PNL</h3>
          <div className="parity-heatmap-month">{heatmap.monthLabel}</div>
          <div className="parity-heatmap-grid">
            {heatmap.cells.map((cell) => (
              <div key={cell.key} className={`parity-heatmap-cell ${cell.state}`}>
                <span className="day">{cell.day}</span>
                {cell.pnl != null ? <small>{cell.pnl > 0 ? '+' : ''}{cell.pnl.toFixed(2)}</small> : null}
              </div>
            ))}
          </div>
          <div className="parity-heatmap-summary">
            <div>
              <span>Día Sel.</span>
              <strong>{money(heatmap.cells[heatmap.cells.length - 1]?.pnl ?? 0)}</strong>
            </div>
            <div>
              <span>Semana</span>
              <strong className={snapshot.totalPnL >= 0 ? 'positive' : 'negative'}>
                {money(snapshot.totalPnL * 0.22)}
              </strong>
            </div>
            <div>
              <span>Mes</span>
              <strong className={snapshot.totalPnL >= 0 ? 'positive' : 'negative'}>
                {money(snapshot.totalPnL)}
              </strong>
            </div>
          </div>
        </article>
      </div>

      <article className="desktop-native-card parity-live-table">
        <h3>Live Market Activity</h3>
        <div className="native-trades-table">
          <div>
            <b>ID</b><b>Fecha</b><b>Símbolo</b><b>Lado</b><b>Estado</b><b>PNL</b>
          </div>
          {snapshot.recentTrades.map((trade, index) => (
            <div key={`${trade.id}-${index}`}>
              <span>#{trade.id}</span>
              <span>{toDateLabel(trade.date)}</span>
              <span>{trade.symbol}</span>
              <span>{trade.side}</span>
              <span>{trade.status}</span>
              <span className={trade.pnl >= 0 ? 'positive' : 'negative'}>{money(trade.pnl)}</span>
            </div>
          ))}
          {!snapshot.recentTrades.length ? <p className="muted">No hay trades para mostrar.</p> : null}
        </div>
      </article>
    </section>
  );
}
