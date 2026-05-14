import { readNumber, readString } from '../parse';
import type { JournalDashboardSnapshot, JournalTradeRow } from '../types';

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
