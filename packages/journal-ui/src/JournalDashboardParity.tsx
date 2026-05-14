import type { JournalDashboardSnapshot, JournalTradeRow } from '@trading-journal/journal-data';

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function formatEntryPrice(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value >= 100 ? value.toFixed(2) : value.toFixed(6);
}

function renderRows(rows: JournalTradeRow[]) {
  if (!rows.length) {
    return <p className="journal-parity-empty">No data available.</p>;
  }

  return (
    <div className="journal-parity-table">
      <div className="journal-parity-head">
        <b>ID</b>
        <b>Symbol</b>
        <b>Side</b>
        <b>Entry</b>
        <b>Status</b>
      </div>
      {rows.map((row) => (
        <div key={`${row.id}-${row.symbol}-${row.side}`} className="journal-parity-row">
          <span>#{row.id || '-'}</span>
          <span>{row.symbol}</span>
          <span>{row.side}</span>
          <span>{formatEntryPrice(row.entryPrice)}</span>
          <span>{row.status}</span>
        </div>
      ))}
    </div>
  );
}

export function JournalDashboardParity({
  snapshot,
  title = 'Journal Parity Snapshot',
}: {
  snapshot: JournalDashboardSnapshot;
  title?: string;
}) {
  return (
    <section className="journal-parity">
      <div className="journal-parity-title">
        <h3>{title}</h3>
        <span>{new Date(snapshot.generatedAt).toLocaleString()}</span>
      </div>

      <div className="journal-parity-metrics">
        <article>
          <span>Balance</span>
          <strong>{formatNumber(snapshot.metrics.balanceUsdt)} USDT</strong>
        </article>
        <article>
          <span>Max Risk</span>
          <strong>{formatNumber(snapshot.metrics.maxRiskUsdt)} USDT</strong>
        </article>
        <article>
          <span>Discipline</span>
          <strong>{snapshot.metrics.disciplineLabel}</strong>
        </article>
        <article>
          <span>Open / Pending</span>
          <strong>{snapshot.metrics.openTradesCount} / {snapshot.metrics.pendingOrdersCount}</strong>
        </article>
      </div>

      <div className="journal-parity-grid">
        <article className="journal-parity-card">
          <h4>Open Trades</h4>
          {renderRows(snapshot.openTrades)}
        </article>
        <article className="journal-parity-card">
          <h4>Pending Orders</h4>
          {renderRows(snapshot.pendingOrders)}
        </article>
      </div>
    </section>
  );
}
