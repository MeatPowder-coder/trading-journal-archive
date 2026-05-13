"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, XCircle, TrendingUp, TrendingDown, Target, Zap, Sparkles } from "lucide-react";
import { useMutation, gql } from "@apollo/client";
import { AnalysisDrawer } from "@/components/AnalysisDrawer";

const CLOSE_TRADE_MUTATION = gql`
  mutation CloseTrade(
    $id: Int!
    $precio_salida: numeric
    $fecha_cierre: timestamptz
  ) {
    update_trades_activos_by_pk(
      pk_columns: { id: $id }
      _set: {
        estado: "CLOSED"
        precio_salida: $precio_salida
        fecha_cierre: $fecha_cierre
      }
    ) {
      id
      estado
      precio_salida
      pnl_realizado
      fecha_cierre
    }
  }
`;

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
}

interface ActiveTradesProps {
  trades: Trade[];
  prices: any;
  calculateRealTimePnL: (trade: any) => number;
}

export function ActiveTrades({ trades, prices, calculateRealTimePnL }: ActiveTradesProps) {
  const [analysisTrade, setAnalysisTrade] = useState<Trade | null>(null);
  const [isAnalysisDrawerOpen, setIsAnalysisDrawerOpen] = useState(false);

  const [closeTrade, { loading: closing }] = useMutation(CLOSE_TRADE_MUTATION, {
    onError: (error) => {
      console.error("Error closing trade:", error);
      alert("Error closing trade: " + error.message);
    }
  });

  const activeTrades = trades.filter(t =>
    t.estado === 'OPEN' &&
    (t.tipo_estrategia === 'TRADING' || !t.tipo_estrategia)
  );

  const handleCloseClick = async (trade: Trade) => {
    const ticker = trade.ticker_api ? trade.ticker_api.trim().toUpperCase() : null;
    const currentPrice = ticker ? prices[ticker] : null;

    const defaultPrice = currentPrice ? currentPrice.toString() : "";
    const userInput = prompt(`Cerrar trade ${trade.simbolo}.\n\nPrecio actual: ${currentPrice || 'N/A'}\n\nIngrese precio de cierre:`, defaultPrice);

    if (userInput === null) return;

    const finalPrice = parseFloat(userInput);
    if (isNaN(finalPrice)) {
      alert("Precio inválido");
      return;
    }

    try {
      await closeTrade({
        variables: {
          id: trade.id,
          precio_salida: finalPrice,
          fecha_cierre: new Date().toISOString()
        }
      });
    } catch (e) {
      // Error handled in onError
    }
  };

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
          const ticker = trade.ticker_api ? trade.ticker_api.trim().toUpperCase() : null;
          const currentPrice = ticker ? prices[ticker] : null;

          return (
            <Card key={trade.id} className="border-l-4 border-l-blue-500 shadow-md hover:border-l-blue-400 transition-colors bg-white/80 dark:bg-zinc-950/80">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold">{trade.simbolo}</span>
                      <Badge variant={trade.direccion === 'LONG' ? 'default' : 'destructive'} className={trade.direccion === 'LONG' ? 'bg-green-600' : 'bg-red-600'}>
                        {trade.direccion}
                      </Badge>
                    </div>
                    <div className="text-xs text-zinc-500">Margin: ${Number(trade.monto_margin).toFixed(2)} ({trade.apalancamiento}x)</div>
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
                      className="text-xs text-zinc-400 hover:text-zinc-600 h-6 px-2"
                      onClick={() => handleCloseClick(trade)}
                      disabled={closing}
                    >
                      Forzar Cierre (Solo Journal)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-500 border-blue-200 hover:bg-blue-50 w-full"
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">PnL (Live)</p>
                    <div className={`text-xl font-bold flex items-center gap-1 ${realTimePnL > 0 ? "text-green-600" : realTimePnL < 0 ? "text-red-600" : "text-zinc-500"}`}>
                      {realTimePnL > 0 ? <TrendingUp className="h-4 w-4" /> : realTimePnL < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                      {realTimePnL > 0 ? "+" : ""}${realTimePnL.toFixed(2)}
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs text-zinc-500">Precio Actual</p>
                    <div className="font-mono font-medium flex items-center justify-end gap-1">
                      {currentPrice ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                          ${Number(currentPrice).toFixed(4)}
                        </>
                      ) : (
                        <span className="text-zinc-400">---</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">Entrada: ${Number(trade.precio_entrada).toFixed(4)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AnalysisDrawer
        trade={analysisTrade}
        isOpen={isAnalysisDrawerOpen}
        onClose={() => setIsAnalysisDrawerOpen(false)}
      />
    </div>
  );
}
