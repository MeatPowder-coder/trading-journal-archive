import type { MarketType } from '../types';

function normalizeFilter(value: string) {
  return value.trim().toUpperCase();
}

export function WatchlistPanel({
  marketType,
  symbols,
  activeSymbol,
  filter,
  onFilterChange,
  onSelectSymbol,
}: {
  marketType: MarketType;
  symbols: string[];
  activeSymbol: string;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  const normalizedFilter = normalizeFilter(filter);
  const filtered = !normalizedFilter
    ? symbols
    : symbols.filter((symbol) => symbol.includes(normalizedFilter));

  return (
    <section className="side-card watchlist-card">
      <div className="card-title-row">
        <h3>Watchlist</h3>
        <span className={marketType === 'futures' ? 'tag tag-amber' : 'tag tag-blue'}>
          {marketType === 'futures' ? 'Futures' : 'Spot'}
        </span>
      </div>
      <input
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
        placeholder="Filter symbol..."
        className="text-input watchlist-search"
      />
      <div className="watchlist-scroll">
        {filtered.map((symbol) => {
          const active = symbol === activeSymbol;
          return (
            <button
              key={symbol}
              className={active ? 'watchlist-item active' : 'watchlist-item'}
              onClick={() => onSelectSymbol(symbol)}
            >
              <strong>{symbol}</strong>
              <small>{marketType === 'futures' ? 'PERP' : 'SPOT'}</small>
            </button>
          );
        })}
        {!filtered.length ? <p className="muted">No symbols found.</p> : null}
      </div>
    </section>
  );
}
