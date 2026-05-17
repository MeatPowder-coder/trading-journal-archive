
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown, Target, Zap, Sparkles } from "lucide-react";
import { AnalysisDrawer } from "@/components/AnalysisDrawer";
import { TradeExecutionModal } from "@/components/TradeExecutionModal";

interface Trade {
  id: number | string;
  simbolo: string;
  precio_entrada: number;
  precio_salida: number | null;
  pnl_realizado: number;
  pnl_bruto: number;
  comision: number;
  estado: string;
  direccion: string;
  apalancamiento: number;
  ticker_api: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_margin: number;
  tipo_estrategia?: string;
  broker?: string | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  sl_was_moved?: boolean | null;
  order_type?: string | null;
  entry_order_status?: string | null;
}

interface ActiveTradesProps {
  trades: Trade[];
  prices: any;
  calculateRealTimePnL: (trade: any) => number;
  tradeExtremes?: Record<string, { mae: number; mfe: number }>;
}

export function ActiveTrades({ trades, prices, calculateRealTimePnL, tradeExtremes = {} }: ActiveTradesProps) {
  const [analysisTrade, setAnalysisTrade] = useState<Trade | null>(null);
  const [isAnalysisDrawerOpen, setIsAnalysisDrawerOpen] = useState(false);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [executionTrade, setExecutionTrade] = useState<Trade | null>(null);
  const [executionTab, setExecutionTab] = useState<"gestion" | "bitacora" | "cierre">("gestion");

  const isLivePosition = (trade: Trade) => {
    if (trade.estado !== 'OPEN') return false;
    const orderType = String(trade.order_type || 'MARKET').toUpperCase();
    const entryStatus = String(trade.entry_order_status || 'FILLED').toUpperCase();
    if (orderType !== 'LIMIT') return true;
    return entryStatus === 'FILLED' || entryStatus === 'PARTIALLY_FILLED';
  };

  const activeTrades = trades.filter(t =>
    isLivePosition(t) &&
    (t.tipo_estrategia === 'TRADING' || !t.tipo_estrategia)
  );

  if (activeTrades.length === 0) return null;

  return (
    <div className="space-y-4 mb-8">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500" />
        Posiciones Activas
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeTrades.map((trade) => {
          const realTimePnL = calculateRealTimePnL(trade);
          const ticker = (trade.ticker_api || trade.simbolo || "").trim().toUpperCase() || null;
          const currentPrice = ticker ? prices[ticker] : null;
          const liveExtremes = tradeExtremes[String(trade.id)];

          const entry = Number(trade.precio_entrada || 0);
          const margin = Number(trade.monto_margin || 0);
          const leverage = Number(trade.apalancamiento || 0);
          const qty = entry > 0 ? (margin * leverage) / entry : 0;
          const sl = trade.stop_loss != null ? Number(trade.stop_loss) : null;
          const tp = trade.take_profit != null ? Number(trade.take_profit) : null;

          const riskPerUnit = sl != null ? Math.abs(entry - sl) : 0;
          const riskUsd = riskPerUnit > 0 ? riskPerUnit * qty : 0;
          const tpRewardPerUnit = tp != null
            ? trade.direccion === "LONG"
              ? tp - entry
              : entry - tp
            : 0;
          const tpRewardUsd = tpRewardPerUnit > 0 ? tpRewardPerUnit * qty : 0;
          const tpR = riskUsd > 0 ? tpRewardUsd / riskUsd : 0;
          const currentR = riskUsd > 0 ? realTimePnL / riskUsd : 0;

          return (
            <div key={trade.id} className="bento-card p-6 border-l-[3px] border-l-cyan-500/50 hover:border-l-cyan-400 hover:-translate-y-1 transition-all duration-300 relative group flex flex-col hover:shadow-[0_8px_32px_-4px_rgba(6,182,212,0.3)]">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl font-bold tracking-tight text-white">{trade.simbolo}</span>
                      <Badge variant={trade.direccion === 'LONG' ? 'default' : 'destructive'} className={trade.direccion === 'LONG' ? 'bg-green-500/10 text-green-500 border-none px-2 rounded-full text-[10px] tracking-widest uppercase font-bold' : 'bg-red-500/10 text-red-500 border-none px-2 rounded-full text-[10px] tracking-widest uppercase font-bold'}>
                        {trade.direccion}
                      </Badge>
                    </div>
                    <div className="text-[10px] tracking-widest text-zinc-500 font-medium uppercase">Margin: ${Number(trade.monto_margin).toFixed(2)} ({trade.apalancamiento}x)</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={async () => {
                        if (!confirm(`¿Estás seguro de cerrar la posición en Binance para ${trade.simbolo}?`)) return;
                        try {
                          const res = await fetch('/api/binance/close-position', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ symbol: trade.simbolo })
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "Error desconocido");
                          alert("Orden de cierre enviada a Binance. El journal se actualizará en breve.");
                        } catch (err: any) {
                          alert("Error al cerrar en Binance: " + err.message);
                        }
                      }}
                    >
                      <Target className="h-4 w-4 mr-1" />
                      Cerrar en Binance
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-cyan-400 h-6 px-2 mt-1"
                      onClick={() => {
                        setExecutionTrade(trade);
                        setExecutionTab("cierre");
                        setExecutionOpen(true);
                      }}
                    >
                      Cierre Disciplinado
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-emerald-400 h-6 px-2"
                      onClick={() => {
                        setExecutionTrade(trade);
                        setExecutionTab("gestion");
                        setExecutionOpen(true);
                      }}
                    >
                      Gestionar Trade
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] uppercase tracking-widest font-bold text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-400 mt-2 w-full transition-all"
                      onClick={() => {
                        setAnalysisTrade(trade);
                        setIsAnalysisDrawerOpen(true);
                      }}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      Analizar con IA
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-auto">
                  <div className="space-y-1">
                    <p className="text-[10px] tracking-widest text-zinc-500 uppercase font-bold">PnL (Live)</p>
                    <div className={`text-2xl font-light tracking-tighter flex items-center gap-1 drop-shadow-md ${realTimePnL > 0 ? "text-green-500" : realTimePnL < 0 ? "text-red-500" : "text-zinc-400"}`}>
                      {realTimePnL > 0 ? <TrendingUp className="h-4 w-4" /> : realTimePnL < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                      {realTimePnL > 0 ? "+" : ""}${realTimePnL.toFixed(2)}
                    </div>
                    <div className="text-[10px] tracking-wide text-zinc-500">
                      {riskUsd > 0 ? `R actual: ${currentR >= 0 ? "+" : ""}${currentR.toFixed(2)}R` : "Sin SL registrado"}
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] tracking-widest text-zinc-500 uppercase font-bold">Precio Actual</p>
                    <div className="font-mono text-zinc-100 font-light tracking-tighter text-lg flex items-center justify-end gap-1">
                      {currentPrice ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                          ${Number(currentPrice).toFixed(4)}
                        </>
                      ) : (
                        <span className="text-zinc-400">---</span>
                      )}
                    </div>
                    <div className="text-[10px] tracking-widest text-zinc-500 uppercase mt-1">Entrada: ${Number(trade.precio_entrada).toFixed(4)}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-zinc-800/70 p-3 text-xs space-y-2">
                  <div className="flex justify-between text-emerald-400">
                    <span>TP:</span>
                    <span>
                      {tp != null
                        ? `$${tp.toFixed(4)} (${tpRewardUsd >= 0 ? "+" : ""}$${tpRewardUsd.toFixed(2)} / ${tpR.toFixed(2)}R)`
                        : "No definido"}
                    </span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>SL:</span>
                    <span>
                      {sl != null
                        ? `$${sl.toFixed(4)} (-$${Math.abs(riskUsd).toFixed(2)} / -1.00R)`
                        : "No definido"}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>MAE actual:</span>
                    <span>{liveExtremes?.mae ? `$${Number(liveExtremes.mae).toFixed(4)}` : "--"}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>MFE actual:</span>
                    <span>{liveExtremes?.mfe ? `$${Number(liveExtremes.mfe).toFixed(4)}` : "--"}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AnalysisDrawer
        trade={analysisTrade}
        isOpen={isAnalysisDrawerOpen}
        onClose={() => setIsAnalysisDrawerOpen(false)}
      />

      <TradeExecutionModal
        open={executionOpen}
        onOpenChange={(next) => {
          setExecutionOpen(next);
          if (!next) setExecutionTrade(null);
        }}
        trade={executionTrade}
        initialTab={executionTab}
        currentPrice={executionTrade ? prices[(executionTrade.ticker_api || executionTrade.simbolo || "").trim().toUpperCase()] : null}
        liveExtremes={executionTrade ? tradeExtremes[String(executionTrade.id)] : null}
        onUpdated={() => {
          // Parent data comes from subscriptions; this callback keeps parity with other callers.
        }}
      />
    </div>
  );
}
