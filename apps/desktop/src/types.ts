export interface PairingStartResponse {
  success: boolean;
  pairingId: string;
  pairingCode: string;
  pollToken: string;
  expiresAt: string;
  pollIntervalMs: number;
  approveHint?: string;
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
