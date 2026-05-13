"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, PieChart } from "lucide-react";

interface Trade {
  id: number | string;
  simbolo: string;
  precio_entrada: number;
  precio_salida: number | null;
  pnl_realizado: number;
  estado: string;
  direccion: string;
  apalancamiento: number;
  ticker_api: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_margin: number;
  tipo_estrategia?: string;
  broker?: string | null;
}

interface PortfolioListProps {
  trades: Trade[];
  loading: boolean;
  prices: any;
}

export function PortfolioList({ trades, loading, prices }: PortfolioListProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="h-24 bg-zinc-100 dark:bg-zinc-800" />
            <CardContent className="h-32" />
          </Card>
        ))}
      </div>
    );
  }

  // Filter for HOLDING strategy
  const holdingTrades = trades.filter(
    (t) => t.tipo_estrategia === "HOLDING" || (t.tipo_estrategia as any) === "HOLDING" // Type cast if needed depending on codegen
  );

  if (holdingTrades.length === 0) {
    return (
      <Card className="w-full border-zinc-200 bg-zinc-50 dark:bg-zinc-900/10 dark:border-zinc-800">
        <CardContent className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <Wallet className="h-12 w-12 mb-4 text-zinc-400" />
          <p className="font-semibold text-lg">No long-term investments found</p>
          <p className="text-sm mt-2">Add trades with 'HOLDING' strategy to see them here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {holdingTrades.map((trade) => {
        const ticker = trade.ticker_api ? trade.ticker_api.trim().toUpperCase() : null;
        const currentPrice = ticker ? prices[ticker] : null;
        const isOpen = trade.estado === "ABIERTO" || trade.estado === "OPEN";

        // Logic for Real-time PnL Calculation
        // Formula: ((Precio_Yahoo_Actual - precio_entrada) / precio_entrada) * monto_margin
        let unrealizedPnL = 0;
        let growthPercentage = 0;
        let currentValue = 0;

        if (isOpen && currentPrice && trade.precio_entrada) {
            const entryPrice = Number(trade.precio_entrada);
            const margin = Number(trade.monto_margin);
            
            if (entryPrice > 0) {
                unrealizedPnL = ((currentPrice - entryPrice) / entryPrice) * margin;
                growthPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
                currentValue = margin + unrealizedPnL;
            }
        } else if (!isOpen) {
             // For closed trades, we might want to show realized PnL, but the requirements focus on active calculation.
             // We'll stick to displaying what we have or 0 if closed/no price.
             // Actually, for closed trades in a portfolio view, we usually just show the final state or filter them out if this is "Active Portfolio"
             // The requirement says "Muestra el valor actual de la inversión", implying active.
             // But let's handle closed just in case by showing realized values if available.
             unrealizedPnL = Number(trade.pnl_realizado) || 0;
             currentValue = Number(trade.monto_margin) + unrealizedPnL; // Approx
        }
        
        // If it's open but no price yet, we can't calc PnL properly, assume 0 change
        if (isOpen && !currentPrice) {
            currentValue = Number(trade.monto_margin);
        }

        const isPositive = unrealizedPnL >= 0;

        return (
          <Card key={trade.id} className="overflow-hidden shadow-lg border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:shadow-xl transition-shadow">
            <CardHeader className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        {trade.simbolo}
                        {isOpen && <Badge variant="outline" className="text-xs font-normal">OPEN</Badge>}
                    </CardTitle>
                    <p className="text-sm text-zinc-500 font-mono mt-1">{ticker}</p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-zinc-500 uppercase tracking-wider">Current Value</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <p className="text-xs text-zinc-500 mb-1">Invested Amount</p>
                        <p className="font-semibold text-lg">${Number(trade.monto_margin).toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-xs text-zinc-500 mb-1">Avg. Buy Price</p>
                        <p className="font-semibold text-lg">${Number(trade.precio_entrada).toLocaleString()}</p>
                    </div>
                </div>

                <div className={`rounded-lg p-4 ${isPositive ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Return</span>
                        <div className={`flex items-center gap-1 font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                            {growthPercentage.toFixed(2)}%
                        </div>
                    </div>
                    <div className={`text-2xl font-bold ${isPositive ? 'text-green-700 dark:text-green-500' : 'text-red-700 dark:text-red-500'}`}>
                        {unrealizedPnL > 0 ? "+" : ""}${unrealizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
                
                {isOpen && !currentPrice && (
                    <div className="mt-4 text-xs text-center text-zinc-400 italic">
                        Waiting for market data...
                    </div>
                )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
