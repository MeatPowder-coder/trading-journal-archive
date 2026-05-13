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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  RefreshCw,
  Edit,
  XCircle,
  Target,
  ImageIcon,
  Sparkles
} from "lucide-react";
import { EditTradeModal } from "@/components/EditTradeModal";
import { TradeDetailModal } from "@/components/TradeDetailModal";
import { AnalysisDrawer } from "@/components/AnalysisDrawer";
import { useMutation, gql } from "@apollo/client";
import {
  getDeltaConfig,
  getVolumeConfig,
  getAbsorptionConfig,
  getPsychologyConfig
} from "@/utils/tradingMappings";

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
  // New fields
  screenshot_url?: string;
  nombre_jugada?: string;
  zona_entrada?: string;
  contexto_mercado?: string;
  volatilidad?: string;
  tipo_liquidez?: string;
  estado_delta?: string;
  volumen_estado?: string;
  absorcion_detectada?: boolean;
  calificacion_personal?: string;
  notas_aprendizaje?: string;
  notas_cierre?: string;
}

interface DayTradingTableProps {
  trades: Trade[];
  loading: boolean;
  error: any;
  prices: any;
  calculateRealTimePnL: (trade: any) => number;
}

export function DayTradingTable({ trades, loading, error, prices, calculateRealTimePnL }: DayTradingTableProps) {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [analysisTrade, setAnalysisTrade] = useState<Trade | null>(null);
  const [isAnalysisDrawerOpen, setIsAnalysisDrawerOpen] = useState(false);

  const [closeTrade, { loading: closing }] = useMutation(CLOSE_TRADE_MUTATION, {
    onError: (error) => {
      console.error("Error closing trade:", error);
      alert("Error closing trade: " + error.message);
    }
  });

  const handleRowClick = (trade: Trade) => {
    setSelectedTrade(trade);
    setDetailModalOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    setEditingTrade(trade);
    setIsEditModalOpen(true);
  };

  const handleAnalysisClick = (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    setAnalysisTrade(trade);
    setIsAnalysisDrawerOpen(true);
  };

  const handleCloseClick = async (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
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
      <CardContent className="p-0 sm:p-6 sm:pt-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">ID</TableHead>
              <TableHead className="w-[100px]">Fecha</TableHead>
              <TableHead className="w-[80px]">Visual</TableHead>
              <TableHead className="w-[120px]">Símbolo</TableHead>
              <TableHead className="hidden md:table-cell">Setup / Zona</TableHead>
              <TableHead>Psicología</TableHead>
              <TableHead>Order Flow</TableHead>
              <TableHead>Precio Actual</TableHead>
              <TableHead>PnL</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-[40px]" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-16 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                </TableRow>
              ))
            ) : trades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-zinc-500">
                  No active trades found.
                </TableCell>
              </TableRow>
            ) : (
              trades.map((trade: Trade) => {
                const realTimePnL = calculateRealTimePnL(trade);
                const ticker = trade.ticker_api ? trade.ticker_api.trim().toUpperCase() : null;
                const currentPrice = ticker ? prices[ticker] : null;
                const isOpen = trade.estado === 'OPEN';

                // Mappings
                const delta = getDeltaConfig(trade.estado_delta || null);
                const volume = getVolumeConfig(trade.volumen_estado || null);
                const absorption = getAbsorptionConfig(trade.absorcion_detectada || null);
                const psychology = getPsychologyConfig(trade.calificacion_personal || null);

                return (
                  <TableRow
                    key={trade.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer group"
                    onClick={() => handleRowClick(trade)}
                  >
                    {/* ID Column */}
                    <TableCell className="font-mono text-xs text-zinc-500">
                      #{trade.id}
                    </TableCell>

                    {/* Date Column */}
                    <TableCell className="text-xs text-zinc-500">
                      {isOpen
                        ? new Date(trade.fecha_apertura).toLocaleDateString()
                        : trade.fecha_cierre ? new Date(trade.fecha_cierre).toLocaleDateString() : "-"}
                    </TableCell>

                    {/* Visual Column */}
                    <TableCell>
                      <div className="relative h-10 w-16 rounded overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                        {trade.screenshot_url ? (
                          <img
                            src={trade.screenshot_url}
                            alt="Chart"
                            className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-150"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-zinc-300">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Symbol & Direction */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-700 dark:text-zinc-200">{trade.simbolo}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant={trade.direccion === 'LONG' ? 'default' : 'destructive'} className={`h-4 text-[10px] px-1 ${trade.direccion === 'LONG' ? 'bg-green-600' : 'bg-red-600'}`}>
                            {trade.direccion}
                          </Badge>
                          <span className="text-xs text-zinc-500">{trade.apalancamiento}x</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Setup / Zone */}
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-col gap-1">
                        {trade.nombre_jugada ? (
                          <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 bg-blue-50 w-fit">
                            {trade.nombre_jugada}
                          </Badge>
                        ) : <span className="text-xs text-zinc-400">---</span>}

                        {trade.zona_entrada && (
                          <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <Target className="h-3 w-3" />
                            {trade.zona_entrada}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Psychology */}
                    <TableCell>
                      <div className="flex justify-center" title={psychology.label}>
                        <div className={`flex items-center justify-center h-6 w-6 rounded-full border ${psychology.color === 'text-green-600' ? 'bg-green-50 border-green-200 text-green-600' : psychology.color === 'text-red-600' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-zinc-50 border-zinc-200 text-zinc-400'}`}>
                          {psychology.icon}
                        </div>
                      </div>
                    </TableCell>

                    {/* Order Flow */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {/* Delta */}
                        <div title={delta.label} className={delta.color}>
                          {delta.icon}
                        </div>

                        {/* Volume */}
                        <div title={volume.label} className={volume.color}>
                          {volume.icon}
                        </div>

                        {/* Absorption */}
                        <div title={absorption.label} className={absorption.color}>
                          {absorption.icon}
                        </div>
                      </div>
                    </TableCell>

                    {/* Current Price */}
                    <TableCell className="font-mono text-zinc-600 dark:text-zinc-400 text-sm">
                      {isOpen ? (
                        currentPrice ? (
                          <div className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                            ${Number(currentPrice).toFixed(4)}
                          </div>
                        ) : (
                          <span className="text-zinc-400">...</span>
                        )
                      ) : (
                        <span>${Number(trade.precio_salida || 0).toFixed(4)}</span>
                      )}
                    </TableCell>

                    {/* PnL */}
                    <TableCell className="whitespace-nowrap">
                      {isOpen ? (
                        <div className={`flex items-center gap-1 font-bold ${realTimePnL > 0 ? "text-green-600" : realTimePnL < 0 ? "text-red-600" : "text-zinc-500"}`}>
                          {realTimePnL > 0 ? "+" : ""}${realTimePnL.toFixed(2)}
                        </div>
                      ) : (
                        <div className={`flex items-center gap-1 font-bold ${trade.pnl_realizado > 0 ? "text-green-600" : trade.pnl_realizado < 0 ? "text-red-600" : "text-zinc-500"}`}>
                          {trade.pnl_realizado > 0 ? "+" : ""}${Number(trade.pnl_realizado).toFixed(2)}
                        </div>
                      )}
                    </TableCell>

                    {/* State/Actions */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <Badge variant="default" className="bg-blue-500 text-[10px]">OPEN</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">{trade.estado}</Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleAnalysisClick(e, trade)}
                          className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          title="Análisis IA"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleEditClick(e, trade)}
                          className="h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isOpen && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleCloseClick(e, trade)}
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

      {/* Detail Modal (The Journal) */}
      <TradeDetailModal
        trade={selectedTrade}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        calculateRealTimePnL={calculateRealTimePnL}
      />

      <AnalysisDrawer
        trade={analysisTrade}
        isOpen={isAnalysisDrawerOpen}
        onClose={() => setIsAnalysisDrawerOpen(false)}
      />
    </Card>
  );
}
