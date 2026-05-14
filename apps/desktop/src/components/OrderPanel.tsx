import { useMemo, useState } from 'react';
import type { DesktopTokens, SLTPMoveInput } from '../types';

type TradeRow = Record<string, unknown>;

function readString(row: TradeRow | null | undefined, key: string, fallback = '-') {
  const value = row?.[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function readNumber(row: TradeRow | null | undefined, key: string) {
  const value = row?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function OrderPanel({
  activeTrade,
  tokens,
  onMoveProtection,
}: {
  activeTrade: TradeRow | null;
  tokens: DesktopTokens | null;
  onMoveProtection: (tradeId: string | number, input: SLTPMoveInput) => Promise<void>;
}) {
  const [moveType, setMoveType] = useState<'SL' | 'TP'>('SL');
  const [toPrice, setToPrice] = useState('');
  const [reason, setReason] = useState('');
  const [confirmArmed, setConfirmArmed] = useState(false);
  const tradeId = readString(activeTrade, 'id', '');
  const symbol = readString(activeTrade, 'simbolo');
  const currentSL = readNumber(activeTrade, 'stop_loss');
  const currentTP = readNumber(activeTrade, 'take_profit');

  const fromPrice = useMemo(() => (moveType === 'SL' ? currentSL : currentTP), [currentSL, currentTP, moveType]);

  async function submit() {
    if (!activeTrade || !tokens || !tradeId) return;
    const numericPrice = Number(toPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return;
    if (!confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    await onMoveProtection(tradeId, {
      moveType,
      fromPrice,
      toPrice: numericPrice,
      reason: reason.trim() || null,
    });
    setToPrice('');
    setReason('');
    setConfirmArmed(false);
  }

  return (
    <section className="side-card order-panel">
      <div className="card-title-row">
        <h3>Order Panel</h3>
        <span className="tag tag-amber">confirmation required</span>
      </div>
      <div className="active-trade-card">
        <span>Active trade</span>
        <strong>{activeTrade ? `${symbol} #${tradeId}` : 'No active trade'}</strong>
        <small>SL {currentSL ?? '-'} / TP {currentTP ?? '-'}</small>
      </div>
      <div className="segmented">
        <button className={moveType === 'SL' ? 'active' : ''} onClick={() => setMoveType('SL')}>Move SL</button>
        <button className={moveType === 'TP' ? 'active' : ''} onClick={() => setMoveType('TP')}>Move TP</button>
      </div>
      <label>New price</label>
      <input value={toPrice} onChange={(event) => setToPrice(event.target.value)} placeholder="0.00" className="text-input" />
      <label>Reason / note</label>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are you moving protection?" />
      <button className={confirmArmed ? 'btn btn-danger full' : 'btn btn-primary full'} disabled={!activeTrade || !tokens} onClick={submit}>
        {confirmArmed ? `Confirm ${moveType} Move` : `Arm ${moveType} Move`}
      </button>
      <p className="muted">This records the decision first. Signed broker execution remains server-side.</p>
    </section>
  );
}
