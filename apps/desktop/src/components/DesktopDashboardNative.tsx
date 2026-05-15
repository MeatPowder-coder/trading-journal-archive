import type { DesktopTradeRow } from '../types';

function readString(row: DesktopTradeRow | null | undefined, key: string, fallback = '-') {
  const value = row?.[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function readNumber(row: DesktopTradeRow | null | undefined, key: string) {
  const value = row?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function money(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function ratio(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function pct(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

export function DesktopDashboardNative({ trades }: { trades: DesktopTradeRow[] }) {
  const closedTrades = trades.filter((trade) => String(trade.estado || '').toUpperCase() !== 'OPEN');
  const totalPnL = closedTrades.reduce((sum, trade) => sum + (readNumber(trade, 'pnl_realizado') || 0), 0);
  const winners = closedTrades.filter((trade) => (readNumber(trade, 'pnl_realizado') || 0) > 0);
  const losers = closedTrades.filter((trade) => (readNumber(trade, 'pnl_realizado') || 0) < 0);
  const winRate = closedTrades.length ? (winners.length / closedTrades.length) * 100 : 0;
  const avgWin = winners.length
    ? winners.reduce((sum, trade) => sum + (readNumber(trade, 'pnl_realizado') || 0), 0) / winners.length
    : 0;
  const avgLoss = losers.length
    ? losers.reduce((sum, trade) => sum + (readNumber(trade, 'pnl_realizado') || 0), 0) / losers.length
    : 0;

  const rrTrades = closedTrades.filter((trade) => (readNumber(trade, 'rr_actual') || 0) > 0);
  const rrActualAvg = rrTrades.length
    ? rrTrades.reduce((sum, trade) => sum + (readNumber(trade, 'rr_actual') || 0), 0) / rrTrades.length
    : 0;

  const slRespectedCount = closedTrades.filter((trade) => String(trade.sl_move_direction || 'not_moved') !== 'risk_increase').length;
  const slRespectedPct = closedTrades.length ? (slRespectedCount / closedTrades.length) * 100 : 0;

  const mfeTrades = closedTrades.filter((trade) => (readNumber(trade, 'rr_max_possible') || 0) > 0);
  const mfeEfficiency = mfeTrades.length
    ? mfeTrades.reduce((sum, trade) => {
      const rrMax = readNumber(trade, 'rr_max_possible') || 0;
      const rrAct = readNumber(trade, 'rr_actual') || 0;
      if (rrMax <= 0) return sum;
      return sum + ((rrAct / rrMax) * 100);
    }, 0) / mfeTrades.length
    : 0;

  const byMentalState = Array.from(
    closedTrades.reduce((acc, trade) => {
      const state = readString(trade, 'session_mental_state', 'Sin estado');
      const current = acc.get(state) || { state, count: 0, pnl: 0 };
      current.count += 1;
      current.pnl += readNumber(trade, 'pnl_realizado') || 0;
      acc.set(state, current);
      return acc;
    }, new Map<string, { state: string; count: number; pnl: number }>())
      .values()
  ).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  const recentTrades = trades.slice(0, 24);

  return (
    <section className="desktop-native-dashboard">
      <header className="desktop-native-head">
        <h2>Native Dashboard (Desktop)</h2>
        <span>{closedTrades.length} trades cerrados analizados</span>
      </header>

      <div className="desktop-metrics-grid">
        <article>
          <span>PNL Total</span>
          <strong className={totalPnL >= 0 ? 'positive' : 'negative'}>{money(totalPnL)}</strong>
        </article>
        <article>
          <span>Tasa de Éxito</span>
          <strong>{pct(winRate)}</strong>
          <small>{winners.length} W / {losers.length} L</small>
        </article>
        <article>
          <span>Promedio Ganador</span>
          <strong className="positive">{money(avgWin)}</strong>
        </article>
        <article>
          <span>Promedio Perdedor</span>
          <strong className="negative">{money(avgLoss)}</strong>
        </article>
        <article>
          <span>SL Respetados</span>
          <strong>{pct(slRespectedPct)}</strong>
          <small>{slRespectedCount}/{closedTrades.length || 0}</small>
        </article>
        <article>
          <span>R:R Efectivo</span>
          <strong>{ratio(rrActualAvg)}</strong>
        </article>
        <article>
          <span>Eficiencia MFE</span>
          <strong>{pct(mfeEfficiency)}</strong>
        </article>
        <article>
          <span>Últimos Cargados</span>
          <strong>{trades.length}</strong>
        </article>
      </div>

      <div className="desktop-native-grid">
        <article className="desktop-native-card">
          <h3>Rendimiento Por Estado Mental</h3>
          <div className="mental-list">
            {byMentalState.slice(0, 8).map((row) => (
              <div key={row.state} className="mental-row">
                <div>
                  <b>{row.state}</b>
                  <small>{row.count} trades</small>
                </div>
                <strong className={row.pnl >= 0 ? 'positive' : 'negative'}>
                  {money(row.pnl)}
                </strong>
              </div>
            ))}
            {!byMentalState.length ? <p className="muted">Sin datos suficientes.</p> : null}
          </div>
        </article>

        <article className="desktop-native-card">
          <h3>Live Market Activity</h3>
          <div className="native-trades-table">
            <div>
              <b>ID</b><b>Fecha</b><b>Símbolo</b><b>Lado</b><b>Estado</b><b>PNL</b>
            </div>
            {recentTrades.map((trade, index) => {
              const pnl = readNumber(trade, 'pnl_realizado') || 0;
              return (
                <div key={`${readString(trade, 'id', String(index))}-${index}`}>
                  <span>#{readString(trade, 'id', '-')}</span>
                  <span>{readString(trade, 'fecha_apertura', '-').slice(0, 10)}</span>
                  <span>{readString(trade, 'simbolo', '-')}</span>
                  <span>{readString(trade, 'direccion', '-')}</span>
                  <span>{readString(trade, 'estado', '-')}</span>
                  <span className={pnl >= 0 ? 'positive' : 'negative'}>{money(pnl)}</span>
                </div>
              );
            })}
            {!recentTrades.length ? <p className="muted">No hay trades para mostrar.</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
