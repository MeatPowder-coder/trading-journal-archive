"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Activity, AlertCircle, RefreshCw, Edit, XCircle } from "lucide-react";
import { EditTradeModal } from "@/components/EditTradeModal";
import { useMutation, gql } from "@apollo/client";

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
  broker?: string | null;
}

interface TradeListProps {
  trades: Trade[];
  loading: boolean;
  error: any;
  prices: any;
  calculateRealTimePnL: (trade: any) => number;
}

export function TradeList({ trades, loading, error, prices, calculateRealTimePnL }: TradeListProps) {
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [closeTrade, { loading: closing }] = useMutation(CLOSE_TRADE_MUTATION, {
    onError: (error) => {
      console.error("Error closing trade:", error);
      alert("Error closing trade: " + error.message);
    }
  });

  const handleEditClick = (trade: Trade) => {
    setEditingTrade(trade);
    setIsEditModalOpen(true);
  };

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

    // Calculate PnL locally based on entered price
    const entryPrice = Number(trade.precio_entrada);
    const margin = Number(trade.monto_margin);
    const leverage = Number(trade.apalancamiento);
    
    let pnl = 0;
    if (!isNaN(entryPrice) && !isNaN(margin) && !isNaN(leverage) && entryPrice !== 0) {
        const priceDiff = finalPrice - entryPrice;
        const priceChange = trade.direccion === "LONG" ? priceDiff : -priceDiff;
        const percentChange = (priceChange / entryPrice) * 100;
        pnl = (percentChange * margin * leverage) / 100;
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

  if (error) {
    return (
      <Card className="w-full border-red-200 bg-red-50 dark:bg-red-900/10">
        <CardContent className="flex flex-col items-center justify-center py-10 text-red-600">
          <AlertCircle className="h-10 w-10 mb-4" />
          <p className="font-semibold">Error connecting to trading server</p>
          <p className="text-sm mt-2 text-red-500">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Activity className="h-6 w-6 text-blue-500" />
                Live Market Activity
                </CardTitle>
                <CardDescription>Real-time updates from the trading floor</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`}></div>
                <span className="text-sm text-zinc-500 font-medium">{loading ? 'Connecting...' : 'Live'}</span>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead className="w-[150px]">Símbolo</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Precio Entrada</TableHead>
              <TableHead>Precio Actual</TableHead>
              <TableHead>PnL No Realizado</TableHead>
              <TableHead>PnL Realizado</TableHead>
              <TableHead>Apalancamiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[50px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                </TableRow>
               ))
            ) : trades.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-zinc-500">
                        No active trades found.
                    </TableCell>
                </TableRow>
            ) : (
                trades.map((trade: Trade) => {
                  const realTimePnL = calculateRealTimePnL(trade);
                  const ticker = trade.ticker_api ? trade.ticker_api.trim().toUpperCase() : null;
                  const currentPrice = ticker ? prices[ticker] : null;
                  const isOpen = trade.estado === 'ABIERTO' || trade.estado === 'OPEN';
                  
                  return (
                <TableRow key={trade.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <TableCell className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                        #{trade.id}
                    </TableCell>
                    <TableCell className="font-bold text-zinc-700 dark:text-zinc-200">
                        {trade.simbolo}
                    </TableCell>
                    <TableCell>
                        <Badge variant={trade.direccion === 'LONG' ? 'default' : 'destructive'} className={trade.direccion === 'LONG' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}>
                            {trade.direccion}
                        </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                        ${Number(trade.precio_entrada).toFixed(4)}
                    </TableCell>
                    <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                        {isOpen ? (
                          currentPrice ? (
                            <div className="flex items-center gap-1">
                              <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                              ${Number(currentPrice).toFixed(4)}
                            </div>
                          ) : (
                            <span className="text-zinc-400">Cargando...</span>
                          )
                        ) : (
                          <span>${Number(trade.precio_salida || 0).toFixed(4)}</span>
                        )}
                    </TableCell>
                    <TableCell>
                        {isOpen ? (
                          <div className={`flex items-center gap-1 font-bold ${realTimePnL > 0 ? "text-green-600" : realTimePnL < 0 ? "text-red-600" : "text-zinc-500"}`}>
                            {realTimePnL > 0 ? <TrendingUp className="h-4 w-4" /> : realTimePnL < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                            {realTimePnL > 0 ? "+" : ""}${realTimePnL.toFixed(2)}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                    </TableCell>
                    <TableCell>
                        {!isOpen ? (
                          <div className={`flex items-center gap-1 font-bold ${trade.pnl_realizado > 0 ? "text-green-600" : trade.pnl_realizado < 0 ? "text-red-600" : "text-zinc-500"}`}>
                            {trade.pnl_realizado > 0 ? <TrendingUp className="h-4 w-4" /> : trade.pnl_realizado < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                            {trade.pnl_realizado > 0 ? "+" : ""}${Number(trade.pnl_realizado).toFixed(2)}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                    </TableCell>
                    <TableCell className="text-center font-semibold text-zinc-700 dark:text-zinc-300">
                        {trade.apalancamiento}x
                    </TableCell>
                    <TableCell>
                        <Badge variant={isOpen ? 'default' : 'secondary'} className={isOpen ? 'bg-blue-500 hover:bg-blue-600' : ''}>
                            {trade.estado}
                        </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(trade)}
                          className="h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isOpen && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCloseClick(trade)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                            disabled={closing}
                            title="Cerrar Posición"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
      </CardContent>
      
      {/* Edit Modal */}
      {editingTrade && (
        <EditTradeModal
          trade={editingTrade}
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
        />
      )}
    </Card>
  );
}
