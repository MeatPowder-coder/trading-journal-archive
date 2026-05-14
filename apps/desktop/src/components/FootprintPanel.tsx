import type { FootprintBin } from '../types';

function format(value: number) {
  return value >= 1000 ? value.toFixed(0) : value.toFixed(3);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function FootprintPanel({ bins }: { bins: FootprintBin[] }) {
  const visible = [...bins]
    .slice(-36)
    .sort((a, b) => b.priceBucket - a.priceBucket);
  const maxVolume = visible.reduce((max, bin) => Math.max(max, bin.totalVolume), 0) || 1;

  return (
    <section className="desk-card footprint-card">
      <div className="card-title-row">
        <h3>Footprint Ladder</h3>
        <span className="tag">live bins</span>
      </div>
      <div className="footprint-grid">
        <b>Price</b>
        <b>Bid / Ask Intensity</b>
        <b>Delta</b>
        <b>Vol</b>
        {visible.length ? visible.map((bin) => (
          <div className="footprint-row" key={`${bin.candleOpenTime}-${bin.priceBucket}`}>
            <span>{bin.priceBucket.toFixed(2)}</span>
            <span className="footprint-bars">
              <i
                className="bid-bar"
                style={{ width: `${clamp((bin.bidVolume / maxVolume) * 100)}%` }}
                title={`Bid ${format(bin.bidVolume)}`}
              />
              <i
                className="ask-bar"
                style={{ width: `${clamp((bin.askVolume / maxVolume) * 100)}%` }}
                title={`Ask ${format(bin.askVolume)}`}
              />
            </span>
            <span className={bin.delta >= 0 ? 'positive' : 'negative'}>{format(bin.delta)}</span>
            <span>{format(bin.totalVolume)}</span>
          </div>
        )) : <p className="muted footprint-empty">Waiting for aggTrades...</p>}
      </div>
    </section>
  );
}
