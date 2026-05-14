import type { CvdPoint } from '../types';

function formatNumber(value: number) {
  return Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(3);
}

export function CVDPanel({ points }: { points: CvdPoint[] }) {
  const latest = points[points.length - 1];
  const previous = points[points.length - 25] || points[0];
  const impulse = latest && previous ? latest.cumulative - previous.cumulative : 0;
  const direction = impulse > 0 ? 'Buy aggression' : impulse < 0 ? 'Sell aggression' : 'Neutral flow';

  return (
    <section className="desk-card cvd-card">
      <div className="card-title-row">
        <h3>CVD</h3>
        <span className={impulse >= 0 ? 'tag tag-green' : 'tag tag-red'}>{direction}</span>
      </div>
      <strong className="metric-xl">{formatNumber(latest?.cumulative ?? 0)}</strong>
      <div className="sparkline" aria-label="CVD sparkline">
        {points.slice(-72).map((point, index, visible) => {
          const values = visible.map((item) => item.cumulative);
          const min = Math.min(...values, 0);
          const max = Math.max(...values, 1);
          const height = ((point.cumulative - min) / Math.max(max - min, 1)) * 100;
          return <i key={`${point.timestamp}-${index}`} style={{ height: `${Math.max(height, 4)}%` }} />;
        })}
      </div>
      <p className="muted">Delta 25 ticks: {formatNumber(impulse)}</p>
    </section>
  );
}
