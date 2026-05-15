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

export interface JournalMentalStatePerformanceRow {
  state: string;
  count: number;
  pnl: number;
  winRate: number;
  rrAvg: number;
}

export interface JournalRecentTradeRow {
  id: string;
  date: string;
  symbol: string;
  side: string;
  status: string;
  pnl: number;
}

export interface JournalPerformanceSnapshot {
  totalPnL: number;
  winRate: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  slRespectedCount: number;
  slRespectedPct: number;
  rrActualAvg: number;
  mfeEfficiencyPct: number;
  closedTradesCount: number;
  loadedTradesCount: number;
  mentalStatePerformance: JournalMentalStatePerformanceRow[];
  recentTrades: JournalRecentTradeRow[];
}
