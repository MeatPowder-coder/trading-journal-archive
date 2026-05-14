import { randomUUID } from 'crypto';
import type { Balance, Candle, Order, OrderInput, Position } from '@trading-journal/shared';

export interface BrokerAdapter {
  getPrice(symbol: string): Promise<number>;
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  placeOrder(order: OrderInput): Promise<Order>;
  modifyOrder(orderId: string, updates: Partial<OrderInput>): Promise<Order>;
  cancelOrder(orderId: string): Promise<void>;
  getBalance(): Promise<Balance>;
  getOpenPositions(): Promise<Position[]>;
}

export class ManualAdapter implements BrokerAdapter {
  async getPrice(): Promise<number> {
    throw new Error('ManualAdapter does not provide live prices.');
  }

  async getCandles(): Promise<Candle[]> {
    return [];
  }

  async placeOrder(order: OrderInput): Promise<Order> {
    return {
      id: order.clientTradeId || randomUUID(),
      broker: 'MANUAL',
      symbol: order.symbol,
      status: 'RECORDED',
      raw: order,
    };
  }

  async modifyOrder(orderId: string, updates: Partial<OrderInput>): Promise<Order> {
    return {
      id: orderId,
      broker: 'MANUAL',
      symbol: updates.symbol || 'UNKNOWN',
      status: 'UPDATED',
      raw: updates,
    };
  }

  async cancelOrder(): Promise<void> {
    return;
  }

  async getBalance(): Promise<Balance> {
    return { asset: 'USD', available: 0, total: 0 };
  }

  async getOpenPositions(): Promise<Position[]> {
    return [];
  }
}

export class BinanceAdapter implements BrokerAdapter {
  constructor(private readonly baseUrl = 'https://fapi.binance.com') {}

  async getPrice(symbol: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) throw new Error(`Binance price request failed: ${response.status}`);
    const payload = await response.json();
    const price = Number(payload?.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Binance price for ${symbol}`);
    return price;
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol,
      interval: timeframe,
      limit: String(limit),
    });
    const response = await fetch(`${this.baseUrl}/fapi/v1/klines?${params.toString()}`);
    if (!response.ok) throw new Error(`Binance candles request failed: ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => ({
      symbol,
      timeframe: timeframe as Candle['timeframe'],
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6]),
    }));
  }

  async placeOrder(): Promise<Order> {
    throw new Error('Binance signed orders must be routed through the VPS BrokerService.');
  }

  async modifyOrder(): Promise<Order> {
    throw new Error('Binance signed order changes must be routed through the VPS BrokerService.');
  }

  async cancelOrder(): Promise<void> {
    throw new Error('Binance signed cancellations must be routed through the VPS BrokerService.');
  }

  async getBalance(): Promise<Balance> {
    throw new Error('Binance signed balances must be routed through the VPS BrokerService.');
  }

  async getOpenPositions(): Promise<Position[]> {
    throw new Error('Binance signed positions must be routed through the VPS BrokerService.');
  }
}
