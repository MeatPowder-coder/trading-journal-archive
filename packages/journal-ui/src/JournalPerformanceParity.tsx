import type { JournalPerformanceSnapshot } from '@trading-journal/journal-data';

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

export function JournalPerformanceParity({
  snapshot,
  title = 'Native Dashboard (Desktop)',
  heroTitle = 'Dashboard',
  heroSubtitle = 'Monitor your active positions and performance.',
  ctaLabel = 'Nueva Operación',
}: {
  snapshot: JournalPerformanceSnapshot;
  title?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  ctaLabel?: string;
}) {
  return (
    <section className="desktop-native-dashboard parity-neon-board">
      <div className="parity-hero">
        <div>
          <h1>{heroTitle}</h1>
          <p>{heroSubtitle}</p>
        </div>
        <button className="parity-hero-cta" type="button">{ctaLabel}</button>
      </div>

      <header className="desktop-native-head">
        <h2>{title}</h2>
        <span>{snapshot.closedTradesCount} trades cerrados analizados</span>
      </header>

      <div className="desktop-metrics-grid parity-metrics-grid">
        <article>
          <span>PNL Total</span>
          <strong className={snapshot.totalPnL >= 0 ? 'positive' : 'negative'}>{money(snapshot.totalPnL)}</strong>
          <small>{snapshot.closedTradesCount} trades computados</small>
        </article>
        <article>
          <span>Tasa de Éxito</span>
          <strong>{pct(snapshot.winRate)}</strong>
          <small>{snapshot.wins} W / {snapshot.losses} L</small>
        </article>
        <article>
          <span>Promedio Ganador</span>
          <strong className="positive">{money(snapshot.avgWin)}</strong>
          <small>por trade positivo</small>
        </article>
        <article>
          <span>Promedio Perdedor</span>
          <strong className="negative">{money(snapshot.avgLoss)}</strong>
          <small>por trade negativo</small>
        </article>
        <article>
          <span>SL Respetados</span>
          <strong>{pct(snapshot.slRespectedPct)}</strong>
          <small>{snapshot.slRespectedCount}/{snapshot.closedTradesCount || 0} trades</small>
        </article>
        <article>
          <span>R:R Efectivo</span>
          <strong>{ratio(snapshot.rrActualAvg)}</strong>
          <small>objetivo recomendado: ≥ 1.5</small>
        </article>
        <article>
          <span>Eficiencia MFE</span>
          <strong>{pct(snapshot.mfeEfficiencyPct)}</strong>
          <small>captura de recorrido real</small>
        </article>
        <article>
          <span>Últimos Cargados</span>
          <strong>{snapshot.loadedTradesCount}</strong>
          <small>dataset desktop</small>
        </article>
      </div>

      <div className="desktop-native-grid parity-data-grid">
        <article className="desktop-native-card">
          <h3>Rendimiento Por Estado Mental</h3>
          <div className="mental-list">
            {snapshot.mentalStatePerformance.slice(0, 8).map((row) => (
              <div key={row.state} className="mental-row">
                <div>
                  <b>{row.state}</b>
                  <small>{row.count} trades · Win {pct(row.winRate)} · RR {ratio(row.rrAvg)}</small>
                </div>
                <strong className={row.pnl >= 0 ? 'positive' : 'negative'}>
                  {money(row.pnl)}
                </strong>
              </div>
            ))}
            {!snapshot.mentalStatePerformance.length ? <p className="muted">Sin datos suficientes.</p> : null}
          </div>
        </article>

        <article className="desktop-native-card">
          <h3>Live Market Activity</h3>
          <div className="native-trades-table">
            <div>
              <b>ID</b><b>Fecha</b><b>Símbolo</b><b>Lado</b><b>Estado</b><b>PNL</b>
            </div>
            {snapshot.recentTrades.map((trade, index) => (
              <div key={`${trade.id}-${index}`}>
                <span>#{trade.id}</span>
                <span>{trade.date}</span>
                <span>{trade.symbol}</span>
                <span>{trade.side}</span>
                <span>{trade.status}</span>
                <span className={trade.pnl >= 0 ? 'positive' : 'negative'}>{money(trade.pnl)}</span>
              </div>
            ))}
            {!snapshot.recentTrades.length ? <p className="muted">No hay trades para mostrar.</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
