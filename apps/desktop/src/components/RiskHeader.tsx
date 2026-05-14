import type { DesktopCockpitResponse } from '../types';

function n(value: number | null | undefined, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

export function RiskHeader({ cockpit, marketStatus, backendStatus }: {
  cockpit: DesktopCockpitResponse | null;
  marketStatus: string;
  backendStatus: string;
}) {
  return (
    <section className="risk-header">
      <article>
        <span>Balance</span>
        <strong>{n(cockpit?.account.balanceUsdt)} USDT</strong>
      </article>
      <article>
        <span>Max Risk</span>
        <strong>{n(cockpit?.account.maxRisk.amount)} USDT</strong>
      </article>
      <article>
        <span>Discipline</span>
        <strong className={cockpit?.discipline.blocked ? 'negative' : 'positive'}>
          {cockpit?.discipline.blocked ? 'Blocked' : 'Clear'}
        </strong>
      </article>
      <article>
        <span>Market</span>
        <strong>{marketStatus}</strong>
      </article>
      <article>
        <span>Backend</span>
        <strong>{backendStatus}</strong>
      </article>
    </section>
  );
}
