import { z } from 'zod';

export const tradeDirectionSchema = z.enum(['LONG', 'SHORT']);
export type TradeDirection = z.infer<typeof tradeDirectionSchema>;

export const sltpMoveTypeSchema = z.enum(['SL', 'TP']);
export type SLTPMoveType = z.infer<typeof sltpMoveTypeSchema>;

export const chartSnapshotTriggerSchema = z.enum(['ENTRY', 'EXIT', 'SL_MOVE', 'TP_MOVE', 'MANUAL']);
export type ChartSnapshotTrigger = z.infer<typeof chartSnapshotTriggerSchema>;

export const aiAnalysisStatusSchema = z.enum(['PENDING', 'DONE', 'ERROR']);
export type AIAnalysisStatus = z.infer<typeof aiAnalysisStatusSchema>;

export const orderInputSchema = z.object({
  broker: z.string().default('BINANCE_FUTURES'),
  symbol: z.string().min(1),
  direction: tradeDirectionSchema,
  orderType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  margin: z.number().positive(),
  leverage: z.number().positive(),
  entryPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  clientTradeId: z.string().optional(),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export interface Order {
  id: string;
  broker: string;
  symbol: string;
  status: string;
  raw?: unknown;
}

export interface Position {
  id: string;
  broker: string;
  symbol: string;
  direction: TradeDirection;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
}

export interface Balance {
  asset: string;
  available: number;
  total: number;
}
