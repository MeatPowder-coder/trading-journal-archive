import type { JournalDashboardSnapshot, JournalTradeRow } from '../types';

export interface WebTradeLike {
  id?: number | string;
  simbolo?: string;
  direccion?: string;
  precio_entrada?: number | null;
  estado?: string | null;
  order_type?: string | null;
  entry_order_status?: string | null;
}

function toTradeRow(trade: WebTradeLike): JournalTradeRow {
  return {
    id: String(trade.id ?? ''),
    symbol: String(trade.simbolo ?? '-'),
    side: String(trade.direccion ?? '-'),
    entryPrice: typeof trade.precio_entrada === 'number' ? trade.precio_entrada : null,
    status: String(trade.estado ?? '-'),
  };
}

function isLiveTrade(trade: WebTradeLike) {
  if (String(trade.estado || '').toUpperCase() !== 'OPEN') return false;
  const orderType = String(trade.order_type || 'MARKET').toUpperCase();
  const entryStatus = String(trade.entry_order_status || 'FILLED').toUpperCase();
  if (orderType !== 'LIMIT') return true;
  return entryStatus === 'FILLED' || entryStatus === 'PARTIALLY_FILLED';
}

function isPendingLimit(trade: WebTradeLike) {
  if (String(trade.estado || '').toUpperCase() !== 'OPEN') return false;
  const orderType = String(trade.order_type || 'MARKET').toUpperCase();
  const entryStatus = String(trade.entry_order_status || 'FILLED').toUpperCase();
  return orderType === 'LIMIT' && entryStatus !== 'FILLED' && entryStatus !== 'PARTIALLY_FILLED';
}

export function buildDashboardSnapshotFromWebTrades(trades: WebTradeLike[]): JournalDashboardSnapshot {
  const openTrades = trades.filter(isLiveTrade).map((trade) => toTradeRow(trade));
  const pendingOrders = trades.filter(isPendingLimit).map((trade) => toTradeRow(trade));

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      balanceUsdt: null,
      maxRiskUsdt: null,
      disciplineLabel: 'Journal',
      openTradesCount: openTrades.length,
      pendingOrdersCount: pendingOrders.length,
    },
    openTrades,
    pendingOrders,
  };
}
