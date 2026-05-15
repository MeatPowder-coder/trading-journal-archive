import { readNumber, readString } from '../parse';
import type {
  JournalDashboardSnapshot,
  JournalMentalStatePerformanceRow,
  JournalPerformanceSnapshot,
  JournalRecentTradeRow,
  JournalTradeRow,
} from '../types';

export interface DesktopCockpitLike {
  account?: {
    balanceUsdt?: number | null;
    maxRisk?: {
      amount?: number | null;
      warning?: string | null;
    };
  } | null;
  openTrades?: Array<Record<string, unknown>>;
  pendingOrders?: Array<Record<string, unknown>>;
  asOf?: string | null;
}

function normalizeTradeRow(row: Record<string, unknown>): JournalTradeRow {
  return {
    id: readString(row, 'id', ''),
    symbol: readString(row, 'simbolo'),
    side: readString(row, 'direccion'),
    entryPrice: readNumber(row, 'precio_entrada') ?? readNumber(row, 'entry_price'),
    status: readString(row, 'estado', readString(row, 'order_status', '-')),
  };
}

export function buildDashboardSnapshotFromDesktop(cockpit: DesktopCockpitLike | null | undefined): JournalDashboardSnapshot {
  const openTrades = Array.isArray(cockpit?.openTrades)
    ? cockpit?.openTrades.map((row) => normalizeTradeRow(row))
    : [];
  const pendingOrders = Array.isArray(cockpit?.pendingOrders)
    ? cockpit?.pendingOrders.map((row) => normalizeTradeRow(row))
    : [];

  return {
    generatedAt: cockpit?.asOf || new Date().toISOString(),
    metrics: {
      balanceUsdt: typeof cockpit?.account?.balanceUsdt === 'number' ? cockpit.account.balanceUsdt : null,
      maxRiskUsdt: typeof cockpit?.account?.maxRisk?.amount === 'number' ? cockpit.account.maxRisk.amount : null,
      disciplineLabel: cockpit?.account?.maxRisk?.warning || 'Clear',
      openTradesCount: openTrades.length,
      pendingOrdersCount: pendingOrders.length,
    },
    openTrades,
    pendingOrders,
  };
}

function toUpper(raw: unknown) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function normalizeDate(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function buildPerformanceSnapshotFromDesktopTrades(
  trades: Array<Record<string, unknown>> | null | undefined
): JournalPerformanceSnapshot {
  const rows = Array.isArray(trades) ? trades : [];
  const closedTrades = rows.filter((trade) => toUpper(trade.estado) !== 'OPEN');
  const pnlValues = closedTrades.map((trade) => readNumber(trade, 'pnl_realizado') ?? 0);
  const totalPnL = pnlValues.reduce((sum, value) => sum + value, 0);
  const winners = closedTrades.filter((trade) => (readNumber(trade, 'pnl_realizado') ?? 0) > 0);
  const losers = closedTrades.filter((trade) => (readNumber(trade, 'pnl_realizado') ?? 0) < 0);
  const winRate = closedTrades.length ? (winners.length / closedTrades.length) * 100 : 0;
  const avgWin = winners.length
    ? winners.reduce((sum, trade) => sum + (readNumber(trade, 'pnl_realizado') ?? 0), 0) / winners.length
    : 0;
  const avgLoss = losers.length
    ? losers.reduce((sum, trade) => sum + (readNumber(trade, 'pnl_realizado') ?? 0), 0) / losers.length
    : 0;

  const slRespectedCount = closedTrades.filter(
    (trade) => String(trade.sl_move_direction || 'not_moved') !== 'risk_increase'
  ).length;
  const slRespectedPct = closedTrades.length ? (slRespectedCount / closedTrades.length) * 100 : 0;

  const rrTrades = closedTrades.filter((trade) => (readNumber(trade, 'rr_actual') ?? 0) > 0);
  const rrActualAvg = rrTrades.length
    ? rrTrades.reduce((sum, trade) => sum + (readNumber(trade, 'rr_actual') ?? 0), 0) / rrTrades.length
    : 0;

  const mfeTrades = closedTrades.filter((trade) => (readNumber(trade, 'rr_max_possible') ?? 0) > 0);
  const mfeEfficiencyPct = mfeTrades.length
    ? mfeTrades.reduce((sum, trade) => {
      const rrMax = readNumber(trade, 'rr_max_possible') ?? 0;
      const rrAct = readNumber(trade, 'rr_actual') ?? 0;
      if (rrMax <= 0) return sum;
      return sum + ((rrAct / rrMax) * 100);
    }, 0) / mfeTrades.length
    : 0;

  const mentalStatePerformance = Array.from(
    closedTrades.reduce((acc, trade) => {
      const state = readString(trade, 'session_mental_state', 'Sin estado');
      const current = acc.get(state) || { state, count: 0, pnl: 0, wins: 0, rrTotal: 0, rrCount: 0 };
      const pnl = readNumber(trade, 'pnl_realizado') ?? 0;
      current.count += 1;
      current.pnl += pnl;
      if (pnl > 0) current.wins += 1;
      const rr = readNumber(trade, 'rr_actual');
      if (typeof rr === 'number' && Number.isFinite(rr) && rr > 0) {
        current.rrTotal += rr;
        current.rrCount += 1;
      }
      acc.set(state, current);
      return acc;
    }, new Map<string, { state: string; count: number; pnl: number; wins: number; rrTotal: number; rrCount: number }>())
      .values()
  )
    .map((row) => ({
      state: row.state,
      count: row.count,
      pnl: row.pnl,
      winRate: row.count ? (row.wins / row.count) * 100 : 0,
      rrAvg: row.rrCount ? row.rrTotal / row.rrCount : 0,
    }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)) as JournalMentalStatePerformanceRow[];

  const recentTrades = rows.slice(0, 36).map((trade) => ({
    id: readString(trade, 'id', '-'),
    date: normalizeDate(trade.fecha_apertura),
    symbol: readString(trade, 'simbolo', '-'),
    side: readString(trade, 'direccion', '-'),
    status: readString(trade, 'estado', '-'),
    pnl: readNumber(trade, 'pnl_realizado') ?? 0,
  })) as JournalRecentTradeRow[];

  return {
    totalPnL,
    winRate,
    wins: winners.length,
    losses: losers.length,
    avgWin,
    avgLoss,
    slRespectedCount,
    slRespectedPct,
    rrActualAvg,
    mfeEfficiencyPct,
    closedTradesCount: closedTrades.length,
    loadedTradesCount: rows.length,
    mentalStatePerformance,
    recentTrades,
  };
}
