import type { LiquidationEvent } from '../types';

export function LiquidationPanel({ events }: { events: LiquidationEvent[] }) {
  const visible = events.slice(-8).reverse();
  return (
    <section className="desk-card liquidation-card">
      <div className="card-title-row">
        <h3>Liquidations</h3>
        <span className="tag">Binance forceOrder</span>
      </div>
      <div className="event-list">
        {visible.length ? visible.map((event, index) => (
          <article key={`${event.eventTime}-${index}`}>
            <span className={event.side === 'BUY' ? 'positive' : 'negative'}>{event.side}</span>
            <b>{event.quantity.toFixed(3)}</b>
            <small>@ {event.price.toFixed(2)}</small>
          </article>
        )) : <p className="muted">No liquidation events yet.</p>}
      </div>
    </section>
  );
}
