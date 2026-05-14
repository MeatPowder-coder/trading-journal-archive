export interface JournalTradeRow {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number | null;
  status: string;
}

export interface JournalMetrics {
  balanceUsdt: number | null;
  maxRiskUsdt: number | null;
  disciplineLabel: string;
  openTradesCount: number;
  pendingOrdersCount: number;
}

export interface JournalDashboardSnapshot {
  generatedAt: string;
  metrics: JournalMetrics;
  openTrades: JournalTradeRow[];
  pendingOrders: JournalTradeRow[];
}
