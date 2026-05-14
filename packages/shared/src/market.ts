import { z } from 'zod';

export const timeframeSchema = z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d']);
export type Timeframe = z.infer<typeof timeframeSchema>;

export const candleSchema = z.object({
  symbol: z.string().min(1),
  timeframe: timeframeSchema,
  openTime: z.number().int(),
  closeTime: z.number().int(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});
export type Candle = z.infer<typeof candleSchema>;

export const aggTradeSchema = z.object({
  symbol: z.string().min(1),
  tradeId: z.number().int(),
  price: z.number(),
  quantity: z.number(),
  timestamp: z.number().int(),
  buyerMaker: z.boolean(),
});
export type AggTrade = z.infer<typeof aggTradeSchema>;

export const cvdPointSchema = z.object({
  symbol: z.string().min(1),
  timestamp: z.number().int(),
  value: z.number(),
  delta: z.number(),
});
export type CvdPoint = z.infer<typeof cvdPointSchema>;

export const footprintBinSchema = z.object({
  symbol: z.string().min(1),
  candleOpenTime: z.number().int(),
  price: z.number(),
  bidVolume: z.number(),
  askVolume: z.number(),
  totalVolume: z.number(),
  delta: z.number(),
  imbalance: z.number(),
});
export type FootprintBin = z.infer<typeof footprintBinSchema>;

export const liquidationEventSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  price: z.number(),
  quantity: z.number(),
  timestamp: z.number().int(),
  source: z.enum(['BINANCE_FORCE_ORDER', 'COINGLASS_MODEL']),
});
export type LiquidationEvent = z.infer<typeof liquidationEventSchema>;
