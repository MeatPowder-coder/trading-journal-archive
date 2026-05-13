"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Edit,
  XCircle,
  Target,
  ImageIcon,
  Sparkles,
  Ban
} from "lucide-react";
import { AnalysisDrawer } from "@/components/AnalysisDrawer";
import { TradeExecutionModal } from "@/components/TradeExecutionModal";
import {
  getDeltaConfig,
  getVolumeConfig,
  getAbsorptionConfig,
  getPsychologyConfig
} from "@/utils/tradingMappings";
import { gql, useSubscription } from "@apollo/client";
import { normalizeMediaUrl } from "@/lib/media-url";

const PENDING_LIMIT_ORDERS_SUBSCRIPTION = gql`
  subscription PendingLimitOrdersLive {
    pending_limit_orders(
      where: { order_status: { _in: ["NEW", "PARTIALLY_FILLED"] } }
      order_by: [{ created_at: desc }, { id: desc }]
    ) {
      id
      simbolo
      direccion
      entry_price
      stop_loss
      take_profit
      margin
      leverage
      order_status
      external_order_id
      screenshot_url
      entry_tesis
      created_at
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
  stop_loss?: number | null;
  take_profit?: number | null;
  setup_tag?: string;
  timeframe?: string;
  emocion_entrada?: string;
  sl_was_moved?: boolean | null;
  order_type?: string | null;
  entry_order_status?: string | null;
}

interface PendingLimitOrder {
  id: number;
  simbolo: string;
  direccion: "LONG" | "SHORT";
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  margin: number;
  leverage: number;
  order_status: string;
  external_order_id?: string | null;
  screenshot_url?: string | null;
  entry_tesis?: string | null;
  created_at?: string;
}

interface DayTradingTableProps {
  trades: Trade[];
  loading: boolean;
  error: any;
  prices: any;
  calculateRealTimePnL: (trade: any) => number;
  tradeExtremes?: Record<string, { mae: number; mfe: number }>;
  onRefresh?: () => void;
}

function toNumber(value: unknown, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isActivePendingStatus(status: unknown) {
  const s = String(status || "").toUpperCase();
  return s === "NEW" || s === "PARTIALLY_FILLED";
}

function classifyPendingSlMove(
  direction: "LONG" | "SHORT",
  previousSL: number,
  nextSL: number,
  entryPrice: number
) {
  if (direction === "LONG") {
    if (nextSL < previousSL) return { slMoveDirection: "risk_increase", riskIncreased: true };
    if (nextSL >= entryPrice) return { slMoveDirection: "breakeven", riskIncreased: false };
    return { slMoveDirection: "risk_reduction", riskIncreased: false };
  }
  if (nextSL > previousSL) return { slMoveDirection: "risk_increase", riskIncreased: true };
  if (nextSL <= entryPrice) return { slMoveDirection: "breakeven", riskIncreased: false };
  return { slMoveDirection: "risk_reduction", riskIncreased: false };
}

export function DayTradingTable({ trades, loading, error, prices, calculateRealTimePnL, tradeExtremes = {}, onRefresh }: DayTradingTableProps) {
  const [analysisTrade, setAnalysisTrade] = useState<Trade | null>(null);
  const [isAnalysisDrawerOpen, setIsAnalysisDrawerOpen] = useState(false);

  const [isSyncing, setIsSyncing] = useState<Record<string | number, boolean>>({});
  const [executionOpen, setExecutionOpen] = useState(false);
  const [executionTrade, setExecutionTrade] = useState<Trade | null>(null);
  const [executionTab, setExecutionTab] = useState<"gestion" | "bitacora" | "cierre">("gestion");
  const [cancelingLimits, setCancelingLimits] = useState<Record<string, boolean>>({});
  const [pendingFallbackOrders, setPendingFallbackOrders] = useState<PendingLimitOrder[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const [editPendingOpen, setEditPendingOpen] = useState(false);
  const [editingPending, setEditingPending] = useState<PendingLimitOrder | null>(null);
  const [editEntryPrice, setEditEntryPrice] = useState("");
  const [editStopLoss, setEditStopLoss] = useState("");
  const [editTakeProfit, setEditTakeProfit] = useState("");
  const [editMargin, setEditMargin] = useState("");
  const [editLeverage, setEditLeverage] = useState("");
  const [editOverrideRiskIncrease, setEditOverrideRiskIncrease] = useState(false);
  const [editOverrideReason, setEditOverrideReason] = useState("");
  const [savingPendingEdit, setSavingPendingEdit] = useState(false);
  const { data: pendingLimitsData, error: pendingLimitsSubError } = useSubscription(PENDING_LIMIT_ORDERS_SUBSCRIPTION);
  const pendingLimitOrders = useMemo<PendingLimitOrder[]>(() => {
    if (pendingLimitsSubError) return pendingFallbackOrders;
    const rows = pendingLimitsData?.pending_limit_orders;
    return Array.isArray(rows) ? rows as PendingLimitOrder[] : [];
  }, [pendingLimitsData, pendingLimitsSubError, pendingFallbackOrders]);

  const isPendingLimitOrder = (trade: Trade) => {
    if (trade.estado !== 'OPEN') return false;
    const orderType = String(trade.order_type || 'MARKET').toUpperCase();
    const entryStatus = String(trade.entry_order_status || 'FILLED').toUpperCase();
    return orderType === 'LIMIT' && entryStatus !== 'FILLED' && entryStatus !== 'PARTIALLY_FILLED';
  };

  const isLivePosition = (trade: Trade) => {
    if (trade.estado !== 'OPEN') return false;
    const orderType = String(trade.order_type || 'MARKET').toUpperCase();
    const entryStatus = String(trade.entry_order_status || 'FILLED').toUpperCase();
    if (orderType !== 'LIMIT') return true;
    return entryStatus === 'FILLED' || entryStatus === 'PARTIALLY_FILLED';
  };

  const pendingLimitTrades = pendingLimitOrders.filter((order) => isActivePendingStatus(order.order_status));
  const legacyPendingTrades = trades.filter(isPendingLimitOrder);
  const tableTrades = trades.filter((trade) => !isPendingLimitOrder(trade));
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const totalRows = tableTrades.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedTrades = useMemo(() => {
    return tableTrades.slice(pageStart, pageStart + pageSize);
  }, [tableTrades, pageStart, pageSize]);

  const loadPendingLimitOrders = async () => {
    if (!pendingLimitsSubError) {
      return;
    }
    setPendingError(null);
    try {
      const res = await fetch("/api/orders/limit/pending", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las órdenes LIMIT pendientes");
      const rows = Array.isArray(data.orders) ? data.orders : [];
      setPendingFallbackOrders(rows);
    } catch (err: any) {
      setPendingError(err.message || "Error cargando pendientes");
    }
  };

  useEffect(() => {
    setCurrentPage((prev) => {
      const nextTotalPages = Math.max(1, Math.ceil(tableTrades.length / pageSize));
      return Math.min(Math.max(1, prev), nextTotalPages);
    });
  }, [tableTrades.length, pageSize]);

  useEffect(() => {
    if (pendingLimitsSubError) {
      void loadPendingLimitOrders();
    } else {
      setPendingError(null);
    }
  }, [pendingLimitsSubError]);

  const editPreview = useMemo(() => {
    if (!editingPending) return null;

    const entry = toNumber(editEntryPrice, NaN);
    const sl = toNumber(editStopLoss, NaN);
    const tp = toNumber(editTakeProfit, NaN);

    const hasValidCore = Number.isFinite(entry) && entry > 0 && Number.isFinite(sl) && sl > 0;
    if (!hasValidCore) {
      return {
        valid: false,
        message: "Define entry y SL válidos para calcular riesgo/R:R.",
        riskIncreased: false,
      };
    }

    if (editingPending.direccion === "LONG" && !(sl < entry)) {
      return {
        valid: false,
        message: "Para LONG, SL debe estar por debajo del entry.",
        riskIncreased: false,
      };
    }

    if (editingPending.direccion === "SHORT" && !(sl > entry)) {
      return {
        valid: false,
        message: "Para SHORT, SL debe estar por encima del entry.",
        riskIncreased: false,
      };
    }

    if (Number.isFinite(tp) && tp > 0) {
      if (editingPending.direccion === "LONG" && !(tp > entry)) {
        return {
          valid: false,
          message: "Para LONG, TP debe estar por encima del entry.",
          riskIncreased: false,
        };
      }
      if (editingPending.direccion === "SHORT" && !(tp < entry)) {
        return {
          valid: false,
          message: "Para SHORT, TP debe estar por debajo del entry.",
          riskIncreased: false,
        };
      }
    }

    const previousSL = toNumber(editingPending.stop_loss, NaN);
    const hasPreviousSL = Number.isFinite(previousSL) && previousSL > 0;
    const moveClass = hasPreviousSL
      ? classifyPendingSlMove(editingPending.direccion, previousSL, sl, entry)
      : { slMoveDirection: "not_moved", riskIncreased: false };

    const riskPerUnit = Math.abs(entry - sl);
    const rewardPerUnit = Number.isFinite(tp) && tp > 0
      ? Math.abs(tp - entry)
      : null;
    const rr = rewardPerUnit && riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;

    return {
      valid: true,
      message: null,
      riskIncreased: moveClass.riskIncreased,
      slMoveDirection: moveClass.slMoveDirection,
      rr,
      riskPerUnit,
    };
  }, [editingPending, editEntryPrice, editStopLoss, editTakeProfit]);

  const handleSyncTrade = async (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    setIsSyncing(prev => ({ ...prev, [trade.id]: true }));
    try {
      const res = await fetch('/api/binance/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId: Number(trade.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      alert(data.message);
      onRefresh?.();
    } catch (err: any) {
      alert(`Error al sincronizar trade #${trade.id}: ${err.message}`);
    } finally {
      setIsSyncing(prev => ({ ...prev, [trade.id]: false }));
    }
  };

  const handleRowClick = (trade: Trade) => {
    setExecutionTrade(trade);
    setExecutionTab(trade.estado === "OPEN" ? "gestion" : "bitacora");
    setExecutionOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    setExecutionTrade(trade);
    setExecutionTab("bitacora");
    setExecutionOpen(true);
  };

  const handleAnalysisClick = (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    setAnalysisTrade(trade);
    setIsAnalysisDrawerOpen(true);
  };

  const handleCloseClick = (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    setExecutionTrade(trade);
    setExecutionTab("cierre");
    setExecutionOpen(true);
  };

  const handleCancelPendingLimit = async (order: PendingLimitOrder) => {
    const idKey = String(order.id);
    if (cancelingLimits[idKey]) return;

    const confirmed = confirm(
      `¿Cancelar orden LIMIT pendiente #${order.id} (${order.simbolo})?\n` +
      `La orden quedará cancelada y fuera de la lista activa.`
    );
    if (!confirmed) return;

    setCancelingLimits((prev) => ({ ...prev, [idKey]: true }));
    try {
      const res = await fetch('/api/orders/limit/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingOrderId: Number(order.id), source: 'UI_PENDING_SECTION' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cancelar la orden LIMIT');

      alert(`Orden LIMIT #${order.id} cancelada correctamente.`);
      await loadPendingLimitOrders();
      onRefresh?.();
    } catch (err: any) {
      alert(`Error cancelando orden LIMIT #${order.id}: ${err.message}`);
    } finally {
      setCancelingLimits((prev) => ({ ...prev, [idKey]: false }));
    }
  };

  const openEditPendingModal = (order: PendingLimitOrder) => {
    setEditingPending(order);
    setEditEntryPrice(String(toNumber(order.entry_price, 0)));
    setEditStopLoss(String(toNumber(order.stop_loss, 0)));
    setEditTakeProfit(order.take_profit ? String(toNumber(order.take_profit, 0)) : "");
    setEditMargin(String(toNumber(order.margin, 0)));
    setEditLeverage(String(toNumber(order.leverage, 0)));
    setEditOverrideRiskIncrease(false);
    setEditOverrideReason("");
    setEditPendingOpen(true);
  };

  const handleSavePendingEdit = async () => {
    if (!editingPending) return;
    if (!editPreview?.valid) return;

    if (editPreview.riskIncreased && (!editOverrideRiskIncrease || editOverrideReason.trim().length < 10)) {
      alert("Este cambio de SL aumenta riesgo. Activa override y escribe un motivo (mínimo 10 caracteres).");
      return;
    }

    setSavingPendingEdit(true);
    try {
      const res = await fetch("/api/orders/limit/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingOrderId: editingPending.id,
          entryPrice: Number(editEntryPrice),
          stopLoss: Number(editStopLoss),
          takeProfit: editTakeProfit ? Number(editTakeProfit) : null,
          margin: Number(editMargin),
          leverage: Number(editLeverage),
          overrideRiskIncrease: editOverrideRiskIncrease,
          overrideReason: editOverrideReason.trim() || null,
          source: "UI_PENDING_EDIT",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo editar la orden LIMIT");

      alert(`Orden LIMIT #${editingPending.id} actualizada.`);
      setEditPendingOpen(false);
      setEditingPending(null);
      await loadPendingLimitOrders();
    } catch (err: any) {
      alert(`Error editando orden LIMIT #${editingPending.id}: ${err.message}`);
    } finally {
      setSavingPendingEdit(false);
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
    <div className="bento-card w-full">
      <div className="flex items-center justify-between p-6 pb-0">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-zinc-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-500" />
            LIVE MARKET ACTIVITY
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`}></div>
          <span className="text-sm text-zinc-500 font-medium">{loading ? 'Connecting...' : 'Live'}</span>
        </div>
      </div>

      <div className="p-0 sm:p-6 overflow-x-auto">
        <div className="mb-4 rounded-md border border-amber-300/40 bg-amber-500/5 p-3">
          <div className="text-xs font-semibold tracking-wider text-amber-400 uppercase mb-2">
            Órdenes LIMIT Pendientes ({pendingLimitTrades.length})
          </div>

          {pendingError && (
            <div className="text-xs text-red-300 mb-2">{pendingError}</div>
          )}

          {pendingLimitTrades.length === 0 ? (
            <div className="text-xs text-zinc-400">No hay órdenes LIMIT pendientes activas.</div>
          ) : (
            <div className="space-y-2">
              {pendingLimitTrades.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                  <Badge variant="outline" className="border-amber-400/50 text-amber-300">
                    #{order.id}
                  </Badge>
                  <span className="font-semibold">{order.simbolo}</span>
                  <Badge
                    variant={order.direccion === 'LONG' ? 'default' : 'destructive'}
                    className={`text-[10px] ${order.direccion === 'LONG' ? 'bg-green-600' : 'bg-red-600'}`}
                  >
                    {order.direccion}
                  </Badge>
                  <span>LIMIT @ <b className="font-mono">${Number(order.entry_price || 0).toFixed(4)}</b></span>
                  <span>SL: <b className="font-mono">{order.stop_loss ? Number(order.stop_loss).toFixed(4) : "--"}</b></span>
                  <span>TP: <b className="font-mono">{order.take_profit ? Number(order.take_profit).toFixed(4) : "--"}</b></span>
                  <span>M: <b>{Number(order.margin || 0).toFixed(2)} USDT</b></span>
                  <span>L: <b>{Number(order.leverage || 0)}x</b></span>
                  <Badge variant="secondary" className="text-[10px]">
                    {String(order.order_status || "NEW").toUpperCase()}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] border-blue-300 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200"
                    onClick={() => openEditPendingModal(order)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Editar LIMIT
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] border-red-300 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    disabled={!!cancelingLimits[String(order.id)]}
                    onClick={() => handleCancelPendingLimit(order)}
                  >
                    <Ban className="h-3 w-3 mr-1" />
                    {cancelingLimits[String(order.id)] ? "Cancelando..." : "Cancelar LIMIT"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {legacyPendingTrades.length > 0 && (
            <div className="mt-3 rounded-md border border-red-400/40 bg-red-500/10 p-2 text-[11px] text-red-300">
              Detectadas {legacyPendingTrades.length} LIMIT legacy aún en `trades_activos`. Ejecuta migración `013_pending_limit_orders_v1.sql`.
            </div>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-zinc-800/50 hover:bg-transparent">
              <TableHead className="w-[60px] text-[10px] tracking-widest text-zinc-500 uppercase">ID</TableHead>
              <TableHead className="w-[100px] text-[10px] tracking-widest text-zinc-500 uppercase">Fecha</TableHead>
              <TableHead className="w-[80px] text-[10px] tracking-widest text-zinc-500 uppercase">Visual</TableHead>
              <TableHead className="w-[120px] text-[10px] tracking-widest text-zinc-500 uppercase">Símbolo</TableHead>
              <TableHead className="hidden md:table-cell text-[10px] tracking-widest text-zinc-500 uppercase">Setup / Zona</TableHead>
              <TableHead className="text-[10px] tracking-widest text-zinc-500 uppercase">Psicología</TableHead>
              <TableHead className="text-[10px] tracking-widest text-zinc-500 uppercase">Order Flow</TableHead>
              <TableHead className="text-[10px] tracking-widest text-zinc-500 uppercase">Precio Actual</TableHead>
              <TableHead className="text-[10px] tracking-widest text-zinc-500 uppercase">PnL</TableHead>
              <TableHead className="text-[10px] tracking-widest text-zinc-500 uppercase">Estado</TableHead>
              <TableHead className="w-[100px] text-[10px] tracking-widest text-zinc-500 uppercase">Acciones</TableHead>
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
            ) : totalRows === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-zinc-500">
                  No active trades found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTrades.map((trade: Trade) => {
                const realTimePnL = calculateRealTimePnL(trade);
                const ticker = (trade.ticker_api || trade.simbolo || "").trim().toUpperCase() || null;
                const currentPrice = ticker ? prices[ticker] : null;
                const isOpen = isLivePosition(trade);

                // Mappings
                const delta = getDeltaConfig(trade.estado_delta || null);
                const volume = getVolumeConfig(trade.volumen_estado || null);
                const absorption = getAbsorptionConfig(trade.absorcion_detectada || null);
                const psychology = getPsychologyConfig(trade.calificacion_personal || null);

                return (
                  <TableRow
                    key={trade.id}
                    className="border-b border-zinc-800/30 hover:bg-zinc-900/50 hover:shadow-[inset_0_0_20px_rgba(168,85,247,0.05)] transition-all cursor-pointer group"
                    onClick={() => handleRowClick(trade)}
                  >
                    {/* ID Column */}
                    <TableCell className="font-mono text-xs text-zinc-600">
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
                        {normalizeMediaUrl(trade.screenshot_url) ? (
                          <img
                            src={normalizeMediaUrl(trade.screenshot_url) || undefined}
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
                            title="Cerrar Posición"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {(trade.broker || '').toUpperCase().includes('BINANCE') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleSyncTrade(e, trade)}
                            disabled={!!isSyncing[trade.id]}
                            className="h-8 w-8 p-0 text-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/20"
                            title="Sincronizar PnL con Binance"
                          >
                            <RefreshCw className={`h-4 w-4 ${isSyncing[trade.id] ? 'animate-spin' : ''}`} />
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

        {totalRows > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-400">
            <div>
              Mostrando <b className="text-zinc-200">{pageStart + 1}</b>-
              <b className="text-zinc-200">{Math.min(pageStart + pageSize, totalRows)}</b> de{" "}
              <b className="text-zinc-200">{totalRows}</b> trades
            </div>
            <div className="flex items-center gap-2">
              <label className="text-zinc-500">Filas:</label>
              <select
                className="h-8 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-zinc-200"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <span className="min-w-[86px] text-center text-zinc-300">
                Página {currentPage}/{totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
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
          onRefresh?.();
        }}
      />

      <Dialog open={editPendingOpen} onOpenChange={setEditPendingOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>
              Editar Orden LIMIT Pendiente {editingPending ? `#${editingPending.id}` : ""}
            </DialogTitle>
            <DialogDescription>
              Binance usa estrategia cancelar/recrear. Símbolo y dirección son fijos.
            </DialogDescription>
          </DialogHeader>

          {editingPending && (
            <div className="space-y-4">
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-500">
                <div><b>Símbolo:</b> {editingPending.simbolo}</div>
                <div><b>Dirección:</b> {editingPending.direccion}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Entry Price</Label>
                  <Input type="number" step="0.00000001" value={editEntryPrice} onChange={(e) => setEditEntryPrice(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Stop Loss</Label>
                  <Input type="number" step="0.00000001" value={editStopLoss} onChange={(e) => setEditStopLoss(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Take Profit (opcional)</Label>
                  <Input type="number" step="0.00000001" value={editTakeProfit} onChange={(e) => setEditTakeProfit(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Margin (USDT)</Label>
                  <Input type="number" step="0.01" min="1" value={editMargin} onChange={(e) => setEditMargin(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Leverage</Label>
                  <Input type="number" min="1" max="125" value={editLeverage} onChange={(e) => setEditLeverage(e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-xs space-y-1">
                {!editPreview?.valid ? (
                  <div className="text-red-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {editPreview?.message || "Define niveles válidos."}
                  </div>
                ) : (
                  <>
                    <div>Riesgo por unidad: <b>{editPreview.riskPerUnit?.toFixed(6)}</b></div>
                    <div>R:R estimado: <b>{editPreview.rr ? editPreview.rr.toFixed(2) : "--"}</b></div>
                    <div>Movimiento SL: <b>{editPreview.slMoveDirection || "not_moved"}</b></div>
                    {editPreview.riskIncreased && (
                      <div className="text-amber-600">
                        El cambio de SL incrementa riesgo y requiere override + motivo.
                      </div>
                    )}
                  </>
                )}
              </div>

              {editPreview?.riskIncreased && (
                <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={editOverrideRiskIncrease}
                      onChange={(e) => setEditOverrideRiskIncrease(e.target.checked)}
                    />
                    Confirmo override por incremento de riesgo
                  </label>
                  <Input
                    placeholder="Motivo obligatorio (mínimo 10 caracteres)"
                    value={editOverrideReason}
                    onChange={(e) => setEditOverrideReason(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPendingOpen(false)}>
              Cerrar
            </Button>
            <Button
              onClick={handleSavePendingEdit}
              disabled={savingPendingEdit || !editPreview?.valid}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {savingPendingEdit ? "Guardando..." : "Guardar cambios LIMIT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
