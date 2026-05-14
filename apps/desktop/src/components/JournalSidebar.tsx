import type { DesktopEvent } from '../types';

function readString(row: Record<string, unknown> | null | undefined, key: string, fallback = '-') {
  const value = row?.[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function JournalSidebar({ activeTrade, events }: {
  activeTrade: Record<string, unknown> | null;
  events: DesktopEvent[];
}) {
  return (
    <section className="side-card journal-panel">
      <div className="card-title-row">
        <h3>Journal</h3>
        <span className="tag">WSS events</span>
      </div>
      {activeTrade ? (
        <div className="journal-summary">
          <b>{readString(activeTrade, 'simbolo')} {readString(activeTrade, 'direccion')}</b>
          <span>Entry {readString(activeTrade, 'precio_entrada')}</span>
          <span>Setup {readString(activeTrade, 'setup_tag')}</span>
          <span>Emotion {readString(activeTrade, 'emocion_entrada')}</span>
        </div>
      ) : <p className="muted">No active trade selected.</p>}
      <div className="timeline">
        {events.slice(-8).reverse().map((event, index) => (
          <article key={`${event.timestamp}-${index}`}>
            <span>{event.type}</span>
            <small>{new Date(event.timestamp).toLocaleTimeString()}</small>
          </article>
        ))}
        {!events.length ? <p className="muted">Waiting for backend events...</p> : null}
      </div>
    </section>
  );
}
