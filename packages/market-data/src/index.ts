import type { AggTrade, CvdPoint, FootprintBin, LiquidationEvent } from '@trading-journal/shared';

export function tradeDelta(trade: Pick<AggTrade, 'quantity' | 'buyerMaker'>) {
  return trade.buyerMaker ? -trade.quantity : trade.quantity;
}

export function nextCvdPoint(previous: number, trade: AggTrade): CvdPoint {
  const delta = tradeDelta(trade);
  return {
    symbol: trade.symbol,
    timestamp: trade.timestamp,
    value: previous + delta,
    delta,
  };
}

export function bucketPrice(price: number, tickSize: number) {
  if (!Number.isFinite(price) || !Number.isFinite(tickSize) || tickSize <= 0) return price;
  return Number((Math.round(price / tickSize) * tickSize).toFixed(8));
}

export function buildFootprintBins(params: {
  symbol: string;
  candleOpenTime: number;
  trades: AggTrade[];
  tickSize: number;
}) {
  const bins = new Map<number, FootprintBin>();

  for (const trade of params.trades) {
    const price = bucketPrice(trade.price, params.tickSize);
    const current = bins.get(price) || {
      symbol: params.symbol,
      candleOpenTime: params.candleOpenTime,
      price,
      bidVolume: 0,
      askVolume: 0,
      totalVolume: 0,
      delta: 0,
      imbalance: 0,
    };

    if (trade.buyerMaker) {
      current.bidVolume += trade.quantity;
    } else {
      current.askVolume += trade.quantity;
    }

    current.totalVolume += trade.quantity;
    current.delta = current.askVolume - current.bidVolume;
    current.imbalance = current.totalVolume > 0 ? current.delta / current.totalVolume : 0;
    bins.set(price, current);
  }

  return [...bins.values()].sort((a, b) => b.price - a.price);
}

export interface LiquidityProvider {
  getRecentLiquidations(symbol: string): Promise<LiquidationEvent[]>;
}

export class BinanceForceOrderLiquidityProvider implements LiquidityProvider {
  async getRecentLiquidations(): Promise<LiquidationEvent[]> {
    return [];
  }
}

export class CoinglassLiquidityProvider implements LiquidityProvider {
  constructor(private readonly apiKey: string | undefined) {}

  async getRecentLiquidations(): Promise<LiquidationEvent[]> {
    if (!this.apiKey) return [];
    throw new Error('Coinglass liquidity adapter is planned but not implemented yet.');
  }
}
