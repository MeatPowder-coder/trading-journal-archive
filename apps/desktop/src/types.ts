export interface PairingStartResponse {
  success: boolean;
  pairingId: string;
  pairingCode: string;
  pollToken: string;
  expiresAt: string;
  pollIntervalMs: number;
  approveHint?: string;
}

export interface PendingDesktopAuth {
  pairingId: string;
  pollToken: string;
  expiresAt: string;
}

export interface PairingPendingResponse {
  success: boolean;
  status: 'PENDING';
  retryAfterMs: number;
}

export interface PairingExchangedResponse {
  success: boolean;
  status: 'EXCHANGED';
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export type PairingPollResponse = PairingPendingResponse | PairingExchangedResponse;

export interface DesktopTokens {
  accessToken: string;
  refreshToken: string;
}

export interface DesktopSessionResponse {
  authenticated: boolean;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  deviceSession: {
    id: string;
    status: string;
    clientName: string | null;
    clientPlatform: string | null;
    createdAt: string;
    approvedAt: string | null;
    exchangedAt: string | null;
    updatedAt: string;
  };
}

export interface DesktopCockpitResponse {
  success: boolean;
  asOf: string;
  account: {
    balanceUsdt: number;
    maxRisk: {
      amount: number;
      warning: string | null;
      blocking: boolean;
    };
  };
  discipline: {
    blocked: boolean;
    blockedUntil: string | null;
    remainingSeconds: number;
    session: Record<string, unknown> | null;
  };
  openTrades: Array<Record<string, unknown>>;
  pendingOrders: Array<Record<string, unknown>>;
}

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface MarketCandle {
  symbol: string;
  timeframe: Timeframe | string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

export interface MarketAggTrade {
  symbol: string;
  eventTime: number;
  price: number;
  quantity: number;
  buyerMaker: boolean;
}

export interface CvdPoint {
  symbol: string;
  timestamp: number;
  delta: number;
  cumulative: number;
}

export interface FootprintBin {
  symbol: string;
  candleOpenTime: number;
  priceBucket: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  totalVolume: number;
  imbalance: number;
}

export interface LiquidationEvent {
  symbol: string;
  eventTime: number;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  source: 'Binance forceOrder' | 'Coinglass model';
}

export interface DesktopEvent<TPayload = unknown> {
  type:
    | 'snapshot.capture.requested'
    | 'snapshot.created'
    | 'sltp.move.recorded'
    | 'ai.analysis.ready'
    | 'trade.updated'
    | 'order.updated'
    | 'risk.updated';
  timestamp: number;
  tradeId?: number | string;
  payload: TPayload;
}

export interface TradingWorkspaceState {
  symbol: string;
  timeframe: Timeframe;
  candles: MarketCandle[];
  cvd: CvdPoint[];
  footprint: FootprintBin[];
  liquidations: LiquidationEvent[];
}

export interface SLTPMoveInput {
  moveType: 'SL' | 'TP';
  fromPrice?: number | null;
  toPrice: number;
  reason?: string | null;
  priceAtMove?: number | null;
  movedTowardEntry?: boolean | null;
  rRatioAtMove?: number | null;
}

export interface ChartSnapshotInput {
  sltpMoveId?: number | null;
  trigger: 'ENTRY' | 'EXIT' | 'SL_MOVE' | 'TP_MOVE' | 'MANUAL';
  imageUrl: string;
  timeframe?: string | null;
  indicators?: Record<string, unknown>;
}

export interface AIAnalysisInput {
  snapshotId?: number | null;
  prompt: string;
  response?: string | null;
  model: string;
  context?: Record<string, unknown>;
  status?: 'PENDING' | 'DONE' | 'ERROR';
  error?: string | null;
}
