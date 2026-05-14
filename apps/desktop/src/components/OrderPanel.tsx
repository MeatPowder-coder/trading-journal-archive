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
  onPlaceOrder,
  onCloseActivePosition,
}: {
  activeTrade: TradeRow | null;
  tokens: DesktopTokens | null;
  onMoveProtection: (tradeId: string | number, input: SLTPMoveInput) => Promise<void>;
  onPlaceOrder: (input: {
    orderType: 'MARKET' | 'LIMIT';
    side: 'LONG' | 'SHORT';
    leverage: number;
    margin: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => Promise<void>;
  onCloseActivePosition: () => Promise<void>;
}) {
  const [moveType, setMoveType] = useState<'SL' | 'TP'>('SL');
  const [toPrice, setToPrice] = useState('');
  const [reason, setReason] = useState('');
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [margin, setMargin] = useState('50');
  const [leverage, setLeverage] = useState('20');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [placing, setPlacing] = useState(false);
  const [closing, setClosing] = useState(false);
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

  async function submitOrder() {
    if (!tokens) return;
    const numericMargin = Number(margin);
    const numericLeverage = Number(leverage);
    if (!Number.isFinite(numericMargin) || numericMargin <= 0) return;
    if (!Number.isFinite(numericLeverage) || numericLeverage <= 0) return;

    const numericEntry = Number(entryPrice);
    const numericSL = Number(stopLoss);
    const numericTP = Number(takeProfit);
    if (orderType === 'LIMIT') {
      if (!Number.isFinite(numericEntry) || numericEntry <= 0) return;
      if (!Number.isFinite(numericSL) || numericSL <= 0) return;
    }

    setPlacing(true);
    try {
      await onPlaceOrder({
        orderType,
        side,
        leverage: numericLeverage,
        margin: numericMargin,
        entryPrice: Number.isFinite(numericEntry) ? numericEntry : undefined,
        stopLoss: Number.isFinite(numericSL) ? numericSL : undefined,
        takeProfit: Number.isFinite(numericTP) ? numericTP : undefined,
      });
      setEntryPrice('');
      setStopLoss('');
      setTakeProfit('');
    } finally {
      setPlacing(false);
    }
  }

  async function closePositionNow() {
    if (!tokens || !activeTrade) return;
    setClosing(true);
    try {
      await onCloseActivePosition();
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="side-card order-panel">
      <div className="card-title-row">
        <h3>Order Panel</h3>
        <span className="tag tag-amber">confirmation required</span>
      </div>
      <div className="active-trade-card">
        <span>Execution</span>
        <strong>{symbol || 'Selected symbol'}</strong>
        <small>{activeTrade ? `Managing trade #${tradeId}` : 'No active position'}</small>
      </div>
      <div className="segmented">
        <button className={orderType === 'MARKET' ? 'active' : ''} onClick={() => setOrderType('MARKET')}>Market</button>
        <button className={orderType === 'LIMIT' ? 'active' : ''} onClick={() => setOrderType('LIMIT')}>Limit</button>
      </div>
      <div className="segmented">
        <button className={side === 'LONG' ? 'active' : ''} onClick={() => setSide('LONG')}>Long</button>
        <button className={side === 'SHORT' ? 'active' : ''} onClick={() => setSide('SHORT')}>Short</button>
      </div>
      <div className="form-grid-two">
        <div>
          <label>Margin (USDT)</label>
          <input value={margin} onChange={(event) => setMargin(event.target.value)} placeholder="50" className="text-input" />
        </div>
        <div>
          <label>Leverage</label>
          <input value={leverage} onChange={(event) => setLeverage(event.target.value)} placeholder="20" className="text-input" />
        </div>
      </div>
      {orderType === 'LIMIT' ? (
        <div className="form-grid-two">
          <div>
            <label>Entry Price</label>
            <input value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} placeholder="0.00" className="text-input" />
          </div>
          <div>
            <label>Stop Loss</label>
            <input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="0.00" className="text-input" />
          </div>
        </div>
      ) : null}
      <label>Take Profit (optional)</label>
      <input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="0.00" className="text-input" />
      <button className="btn btn-primary full" disabled={!tokens || placing} onClick={submitOrder}>
        {placing ? 'Submitting...' : `Place ${orderType} ${side}`}
      </button>
      <button className="btn full" disabled={!activeTrade || closing} onClick={closePositionNow}>
        {closing ? 'Closing...' : 'Close Active Position'}
      </button>
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
