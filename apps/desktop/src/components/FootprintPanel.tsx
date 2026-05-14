import type { FootprintBin } from '../types';

function format(value: number) {
  return value >= 1000 ? value.toFixed(0) : value.toFixed(3);
}

export function FootprintPanel({ bins }: { bins: FootprintBin[] }) {
  const visible = [...bins]
    .slice(-36)
    .sort((a, b) => b.priceBucket - a.priceBucket);

  return (
    <section className="desk-card footprint-card">
      <div className="card-title-row">
        <h3>Footprint</h3>
        <span className="tag">live bins</span>
      </div>
      <div className="footprint-grid">
        <b>Price</b>
        <b>Bid</b>
        <b>Ask</b>
        <b>Delta</b>
        {visible.length ? visible.map((bin) => (
          <div className="footprint-row" key={`${bin.candleOpenTime}-${bin.priceBucket}`}>
            <span>{bin.priceBucket.toFixed(2)}</span>
            <span>{format(bin.bidVolume)}</span>
            <span>{format(bin.askVolume)}</span>
            <span className={bin.delta >= 0 ? 'positive' : 'negative'}>{format(bin.delta)}</span>
          </div>
        )) : <p className="muted footprint-empty">Waiting for aggTrades...</p>}
      </div>
    </section>
  );
}
