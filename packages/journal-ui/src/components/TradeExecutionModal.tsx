
import { useEffect, useMemo, useRef, useState } from "react";
import { gql, useMutation, useSubscription } from "@apollo/client";
import { AlertTriangle, CheckCircle2, Loader2, Save, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { normalizeMediaUrl } from "@/lib/media-url";

const TRADE_SUBSCRIPTION = gql`
  subscription TradeExecutionLive($tradeId: Int!) {
    trades_activos_by_pk(id: $tradeId) {
      id
      simbolo
      direccion
      estado
      precio_entrada
      precio_salida
      fecha_apertura
      fecha_cierre
      ticker_api
      broker
      monto_margin
      apalancamiento
      pnl_realizado
      pnl_bruto
      comision
      stop_loss
      take_profit
      sl_original
      sl_was_moved
      sl_move_direction
      sl_move_count
      rr_estimated
      rr_actual
      rr_max_possible
      max_adverse_excursion
      max_favorable_excursion
      notas_aprendizaje
      notas_cierre
      entry_tesis
      checklist_confirmed
      checklist_timestamp
      session_mental_state
      close_rating
      sl_move_reflection
      risk_amount_usdt
      risk_percent
      consecutive_losses_snapshot
      setup_tag
      timeframe
      emocion_entrada
      zona_entrada
      screenshot_url
      contexto_mercado
      volatilidad
      tipo_liquidez
      estado_delta
      volumen_estado
      absorcion_detectada
      calificacion_personal
    }
  }
`;

const SL_MOVEMENTS_SUBSCRIPTION = gql`
  subscription SlMovementsForExecution($tradeId: Int!) {
    sl_movements(where: { trade_id: { _eq: $tradeId } }, order_by: { moved_at: desc }, limit: 25) {
      id
      original_sl
      new_sl
      direction
      risk_increased
      source
      moved_at
    }
  }
`;

const TRADE_SNAPSHOTS_SUBSCRIPTION = gql`
  subscription TradeExecutionSnapshots($tradeId: Int!) {
    trade_metric_snapshots(
      where: { trade_id: { _eq: $tradeId } }
      order_by: { recorded_at: asc }
      limit: 240
    ) {
      id
      recorded_at
      price
      stop_loss
      take_profit
      rr_actual
      max_adverse_excursion
      max_favorable_excursion
      source
    }
  }
`;

const SESSION_SUBSCRIPTION = gql`
  subscription TradeExecutionSession($sessionDate: date!) {
    trading_sessions(where: { session_date: { _eq: $sessionDate } }, limit: 1) {
      id
      session_date
      mental_state
      rules_confirmed
      consecutive_losses_today
      blocked_until
      override_used
      daily_summary_sent_at
      updated_at
    }
  }
`;

const SNAPSHOT_SUBSCRIPTION = gql`
  subscription TradeExecutionAccountSnapshot {
    account_snapshots(order_by: { recorded_at: desc }, limit: 1) {
      id
      balance_usdt
      source
      recorded_at
    }
  }
`;

const UPDATE_JOURNAL_MUTATION = gql`
  mutation UpdateTradeJournalExecution($id: Int!, $notas_aprendizaje: String, $notas_cierre: String, $entry_tesis: String) {
    update_trades_activos_by_pk(
      pk_columns: { id: $id }
      _set: {
        notas_aprendizaje: $notas_aprendizaje
        notas_cierre: $notas_cierre
        entry_tesis: $entry_tesis
      }
    ) {
      id
      notas_aprendizaje
      notas_cierre
      entry_tesis
    }
  }
`;

type ExecutionTab = "gestion" | "bitacora" | "cierre";

interface TradeRef {
  id: number | string;
  simbolo?: string;
  direccion?: string;
  ticker_api?: string;
  estado?: string;
}

interface TradeExtremes {
  mae?: number;
  mfe?: number;
}

interface TradeExecutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: TradeRef | null;
  initialTab?: ExecutionTab;
  currentPrice?: number | null;
  liveExtremes?: TradeExtremes | null;
  onUpdated?: () => void;
}

function asNumber(value: unknown, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function classifySlPreview(direction: "LONG" | "SHORT", previousSL: number, newSL: number, entry: number) {
  if (direction === "LONG") {
    if (newSL < previousSL) return { slMoveDirection: "risk_increase", riskIncreased: true };
    if (newSL >= entry) return { slMoveDirection: "breakeven", riskIncreased: false };
    return { slMoveDirection: "risk_reduction", riskIncreased: false };
  }

  if (newSL > previousSL) return { slMoveDirection: "risk_increase", riskIncreased: true };
  if (newSL <= entry) return { slMoveDirection: "breakeven", riskIncreased: false };
  return { slMoveDirection: "risk_reduction", riskIncreased: false };
}

function formatNum(value: unknown, digits = 4) {
  const n = asNumber(value, NaN);
  return Number.isFinite(n) ? n.toFixed(digits) : "--";
}

function formatMoney(value: unknown, digits = 2) {
  const n = asNumber(value, NaN);
  return Number.isFinite(n) ? `$${n.toFixed(digits)}` : "--";
}

type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function SlCandlestickChart(props: {
  symbol: string;
  timeframe?: string | null;
  entry: number;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  direction: "LONG" | "SHORT";
  onStopLossDraft: (value: number) => void;
  onTakeProfitDraft?: (value: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  disabled?: boolean;
}) {
  const { symbol, timeframe, entry, currentPrice, stopLoss, takeProfit, onStopLossDraft, onTakeProfitDraft, onDragStateChange, disabled = false } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragTarget, setDragTarget] = useState<"sl" | "tp" | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  const width = 760;
  const height = 300;
  const candleCount = candles.length;

  useEffect(() => {
    if (!symbol) return;

    let canceled = false;
    const loadCandles = async () => {
      try {
        const interval = String(timeframe || "5m");
        const res = await fetch(`/api/binance/klines/${symbol}?interval=${encodeURIComponent(interval)}&limit=90`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.candles)) return;
        if (!canceled) {
          const normalized = data.candles
            .map((c: any) => ({
              openTime: Number(c?.openTime || 0),
              open: Number(c?.open || 0),
              high: Number(c?.high || 0),
              low: Number(c?.low || 0),
              close: Number(c?.close || 0),
              volume: Number(c?.volume || 0),
            }))
            .filter((c: Candle) =>
              Number.isFinite(c.openTime) &&
              Number.isFinite(c.open) &&
              Number.isFinite(c.high) &&
              Number.isFinite(c.low) &&
              Number.isFinite(c.close)
            );
          setCandles(normalized);
        }
      } catch {
        // non-blocking
      }
    };

    void loadCandles();

    return () => {
      canceled = true;
    };
  }, [symbol, timeframe]);

  const hasValidSL = Number.isFinite(stopLoss as number) && (stopLoss as number) > 0;
  const hasValidTP = Number.isFinite(takeProfit as number) && (takeProfit as number) > 0;

  const values = [
    ...candles.map((c) => c.low),
    ...candles.map((c) => c.high),
    entry,
    currentPrice ?? NaN,
    hasValidSL ? (stopLoss as number) : NaN,
    hasValidTP ? (takeProfit as number) : NaN,
  ].filter((v) => Number.isFinite(v)) as number[];
  const minFallback = hasValidSL ? Math.min(entry, stopLoss as number) : entry;
  const maxFallback = hasValidSL ? Math.max(entry, stopLoss as number) : entry;
  const minBase = values.length ? Math.min(...values) : minFallback;
  const maxBase = values.length ? Math.max(...values) : maxFallback;
  const spread = Math.max(maxBase - minBase, Math.max(entry * 0.006, 0.6));
  const minPrice = Math.max(0.00000001, minBase - spread * 0.2);
  const maxPrice = maxBase + spread * 0.2;

  const toY = (price: number) => ((maxPrice - price) / (maxPrice - minPrice)) * height;
  const toX = (index: number) => (index / Math.max(candleCount - 1, 1)) * width;
  const fromY = (y: number) => maxPrice - (Math.max(0, Math.min(height, y)) / height) * (maxPrice - minPrice);

  useEffect(() => {
    if (!dragTarget) return;

    const onMove = (event: PointerEvent) => {
      if (!svgRef.current || disabled) return;
      const rect = svgRef.current.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const next = fromY(y);
      const nextRounded = Number(next.toFixed(8));
      if (dragTarget === "sl") {
        onStopLossDraft(nextRounded);
        return;
      }
      if (dragTarget === "tp" && onTakeProfitDraft) {
        onTakeProfitDraft(nextRounded);
      }
    };

    const onUp = () => setDragTarget(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    onDragStateChange?.(true);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onDragStateChange?.(false);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragTarget, disabled, onStopLossDraft, onTakeProfitDraft, onDragStateChange]);

  const startDrag = (target: "sl" | "tp") => (event: any) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      (event.currentTarget as any).setPointerCapture?.(event.pointerId);
    } catch {
      // non-blocking
    }
    setDragTarget(target);
  };

  const slY = hasValidSL ? toY(stopLoss as number) : null;
  const entryY = toY(entry);
  const currentY = Number.isFinite(currentPrice as number) ? toY(currentPrice as number) : null;
  const tpY = hasValidTP ? toY(takeProfit as number) : null;
  const candleWidth = Math.max(2, Math.min(9, width / Math.max(candleCount, 1) - 1.5));
  const yTicks = Array.from({ length: 6 }).map((_, i) => {
    const ratio = i / 5;
    const price = maxPrice - ratio * (maxPrice - minPrice);
    return {
      y: ratio * height,
      price: Number(price.toFixed(4)),
    };
  });

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-3 select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full h-[300px] touch-none select-none ${disabled ? "opacity-70" : ""}`}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />

        {yTicks.map((tick, idx) => (
          <g key={`tick-${idx}`}>
            <line x1={0} x2={width} y1={tick.y} y2={tick.y} stroke="rgba(113,113,122,0.22)" strokeDasharray="2 6" strokeWidth={1} />
            <text x={width - 2} y={Math.max(10, tick.y - 2)} fill="rgba(161,161,170,0.95)" fontSize="10" textAnchor="end" style={{ pointerEvents: "none", userSelect: "none" }}>
              {tick.price.toFixed(4)}
            </text>
          </g>
        ))}

        {candles.map((candle, i) => {
          const x = toX(i);
          const openY = toY(candle.open);
          const closeY = toY(candle.close);
          const highY = toY(candle.high);
          const lowY = toY(candle.low);
          const bullish = candle.close >= candle.open;
          const bodyY = Math.min(openY, closeY);
          const bodyH = Math.max(1, Math.abs(closeY - openY));

          return (
            <g key={`${candle.openTime}-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                stroke={bullish ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.95)"}
                strokeWidth={1}
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyH}
                fill={bullish ? "rgba(16,185,129,0.82)" : "rgba(239,68,68,0.82)"}
                rx={0.8}
              />
            </g>
          );
        })}

        <line x1={0} x2={width} y1={entryY} y2={entryY} stroke="rgba(250,204,21,0.9)" strokeDasharray="5 5" strokeWidth={1.5} />
        {currentY !== null && (
          <line x1={0} x2={width} y1={currentY} y2={currentY} stroke="rgba(16,185,129,0.95)" strokeDasharray="3 6" strokeWidth={1.5} />
        )}
        {tpY !== null && <line x1={0} x2={width} y1={tpY} y2={tpY} stroke="rgba(52,211,153,0.9)" strokeWidth={1.5} />}

        {slY !== null && (
          <>
            <line
              x1={0}
              x2={width}
              y1={slY}
              y2={slY}
              stroke="rgba(239,68,68,0.95)"
              strokeWidth={2.5}
              onPointerDown={startDrag("sl")}
              style={{ cursor: disabled ? "not-allowed" : "ns-resize" }}
            />
            <circle
              cx={width - 14}
              cy={slY}
              r={6}
              fill="rgba(239,68,68,0.95)"
              onPointerDown={startDrag("sl")}
              style={{ cursor: disabled ? "not-allowed" : "ns-resize" }}
            />
          </>
        )}

        {tpY !== null && (
          <>
            <line
              x1={0}
              x2={width}
              y1={tpY}
              y2={tpY}
              stroke="rgba(16,185,129,0.95)"
              strokeWidth={2.2}
              onPointerDown={onTakeProfitDraft ? startDrag("tp") : undefined}
              style={{ cursor: disabled || !onTakeProfitDraft ? "not-allowed" : "ns-resize" }}
            />
            <circle
              cx={width - 30}
              cy={tpY}
              r={5.5}
              fill="rgba(16,185,129,0.95)"
              onPointerDown={onTakeProfitDraft ? startDrag("tp") : undefined}
              style={{ cursor: disabled || !onTakeProfitDraft ? "not-allowed" : "ns-resize" }}
            />
          </>
        )}

        <text x={8} y={Math.max(14, entryY - 6)} fill="rgba(250,204,21,1)" fontSize="11">Entry</text>
        {currentY !== null && <text x={8} y={Math.max(14, currentY - 6)} fill="rgba(16,185,129,1)" fontSize="11">Price</text>}
        {tpY !== null && <text x={8} y={Math.max(14, tpY - 6)} fill="rgba(52,211,153,1)" fontSize="11">TP</text>}
        {slY !== null && <text x={width - 80} y={Math.max(14, slY - 6)} fill="rgba(239,68,68,1)" fontSize="11">SL</text>}
        <text x={width - 98} y={Math.max(14, entryY - 6)} fill="rgba(250,204,21,1)" fontSize="10">{entry.toFixed(4)}</text>
        {slY !== null && (
          <text x={width - 98} y={Math.max(14, slY + 12)} fill="rgba(239,68,68,1)" fontSize="10">
            {(stopLoss as number).toFixed(4)}
          </text>
        )}
        {tpY !== null && (
          <text x={width - 98} y={Math.max(14, tpY + 12)} fill="rgba(52,211,153,1)" fontSize="10">
            {(takeProfit as number).toFixed(4)}
          </text>
        )}
      </svg>
      <p className="mt-2 text-xs text-zinc-500">
        Gráfico de velas ({timeframe || "5m"}). Arrastra línea roja (SL) y verde (TP) para ajustar protección visualmente.
      </p>
    </div>
  );
}

export function TradeExecutionModal({
  open,
  onOpenChange,
  trade,
  initialTab = "gestion",
  currentPrice,
  liveExtremes,
  onUpdated,
}: TradeExecutionModalProps) {
  const tradeId = trade ? Number(trade.id) : 0;
  const [activeTab, setActiveTab] = useState<ExecutionTab>(initialTab);

  const { data: tradeData } = useSubscription(TRADE_SUBSCRIPTION, {
    variables: { tradeId },
    skip: !open || !tradeId,
  });

  const { data: slMovesData } = useSubscription(SL_MOVEMENTS_SUBSCRIPTION, {
    variables: { tradeId },
    skip: !open || !tradeId,
  });

  const { data: snapshotsData } = useSubscription(TRADE_SNAPSHOTS_SUBSCRIPTION, {
    variables: { tradeId },
    skip: !open || !tradeId,
  });

  const tradeStateHint = String(tradeData?.trades_activos_by_pk?.estado || trade?.estado || "").toUpperCase();
  const freezeLiveSessionFeeds = tradeStateHint === "CLOSED";
  const sessionDate = useMemo(() => toTodayDate(), [open]);
  const { data: sessionData, error: sessionSubError } = useSubscription(SESSION_SUBSCRIPTION, {
    variables: { sessionDate },
    skip: !open || freezeLiveSessionFeeds,
  });
  const { data: snapshotData, error: snapshotSubError } = useSubscription(SNAPSHOT_SUBSCRIPTION, {
    skip: !open || freezeLiveSessionFeeds,
  });

  const [fallbackPrecheck, setFallbackPrecheck] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    if (freezeLiveSessionFeeds) return;
    if (!sessionSubError && !snapshotSubError) return;

    let canceled = false;
    const runFallback = async () => {
      try {
        const res = await fetch("/api/trades/precheck");
        const data = await res.json().catch(() => ({}));
        if (!canceled && res.ok) {
          setFallbackPrecheck(data);
        }
      } catch {
        // Non-blocking fallback
      }
    };

    void runFallback();

    return () => {
      canceled = true;
    };
  }, [open, freezeLiveSessionFeeds, sessionSubError, snapshotSubError]);

  const [updateJournal, { loading: savingJournal }] = useMutation(UPDATE_JOURNAL_MUTATION);

  const liveTrade = tradeData?.trades_activos_by_pk || trade;
  const slMovements = slMovesData?.sl_movements || [];
  const metricSnapshots = snapshotsData?.trade_metric_snapshots || [];
  const session = sessionData?.trading_sessions?.[0] || fallbackPrecheck?.session || null;
  const balanceUsdt = asNumber(snapshotData?.account_snapshots?.[0]?.balance_usdt ?? fallbackPrecheck?.balanceUsdt, NaN);

  const [pendingStopLoss, setPendingStopLoss] = useState("");
  const [pendingTakeProfit, setPendingTakeProfit] = useState("");
  const [moveSource, setMoveSource] = useState("UI_DRAG");
  const [overrideRiskIncrease, setOverrideRiskIncrease] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);

  const [journalNotes, setJournalNotes] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [entryTesis, setEntryTesis] = useState("");

  const [exitPrice, setExitPrice] = useState("");
  const [learningNotes, setLearningNotes] = useState("");
  const [closeRating, setCloseRating] = useState<number>(0);
  const [slMoveReflection, setSlMoveReflection] = useState("");
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [hasAttemptedProtectionSync, setHasAttemptedProtectionSync] = useState(false);
  const [isProtectionDragging, setIsProtectionDragging] = useState(false);
  const frozenMetricSnapshotsRef = useRef<any[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [open, initialTab, tradeId]);

  useEffect(() => {
    if (!liveTrade) return;

    const currentSL = asNumber(liveTrade.stop_loss, NaN);
    setPendingStopLoss(Number.isFinite(currentSL) ? String(currentSL) : "");
    const currentTP = asNumber(liveTrade.take_profit, NaN);
    setPendingTakeProfit(Number.isFinite(currentTP) ? String(currentTP) : "");
    setJournalNotes(String(liveTrade.notas_aprendizaje || ""));
    setCloseNotes(String(liveTrade.notas_cierre || ""));
    setEntryTesis(String(liveTrade.entry_tesis || ""));

    const cp = asNumber(currentPrice, NaN);
    const fallbackExit = asNumber(liveTrade.precio_salida, NaN);
    if (Number.isFinite(cp) && cp > 0) setExitPrice(String(cp));
    else if (Number.isFinite(fallbackExit) && fallbackExit > 0) setExitPrice(String(fallbackExit));
    else setExitPrice("");

    setLearningNotes("");
    setCloseRating(0);
    setSlMoveReflection("");
    setMoveError(null);
    setCloseError(null);
    setOverrideRiskIncrease(false);
    setOverrideReason("");
    setHasAttemptedProtectionSync(false);
    setIsProtectionDragging(false);
    frozenMetricSnapshotsRef.current = null;
  }, [liveTrade?.id, liveTrade?.stop_loss, currentPrice]);

  useEffect(() => {
    setScreenshotSrc(normalizeMediaUrl(liveTrade?.screenshot_url));
  }, [liveTrade?.id, liveTrade?.screenshot_url]);

  useEffect(() => {
    if (!open || !liveTrade) return;
    const state = String(liveTrade.estado || "").toUpperCase();
    if (state === "OPEN") {
      frozenMetricSnapshotsRef.current = null;
      return;
    }
    if (frozenMetricSnapshotsRef.current) return;

    const closedAtMs = liveTrade.fecha_cierre ? new Date(liveTrade.fecha_cierre).getTime() : NaN;
    const source = Array.isArray(metricSnapshots) ? metricSnapshots : [];
    frozenMetricSnapshotsRef.current = Number.isFinite(closedAtMs)
      ? source.filter((snap: any) => new Date(snap.recorded_at).getTime() <= closedAtMs + 1000)
      : source;
  }, [open, liveTrade?.id, liveTrade?.estado, liveTrade?.fecha_cierre, metricSnapshots]);

  const tradeDirection = String(liveTrade?.direccion || "LONG").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
  const isTradeOpenNow = String(liveTrade?.estado || "").toUpperCase() === "OPEN";
  const entryPrice = asNumber(liveTrade?.precio_entrada, NaN);
  const slCurrentRaw = asNumber(liveTrade?.stop_loss, NaN);
  const slOriginalRaw = asNumber(liveTrade?.sl_original, NaN);
  const tpCurrentRaw = asNumber(liveTrade?.take_profit, NaN);
  const slCurrent = Number.isFinite(slCurrentRaw) && slCurrentRaw > 0
    ? slCurrentRaw
    : (Number.isFinite(slOriginalRaw) && slOriginalRaw > 0 ? slOriginalRaw : NaN);
  const tpCurrent = Number.isFinite(tpCurrentRaw) && tpCurrentRaw > 0 ? tpCurrentRaw : NaN;
  const closedPrice = asNumber(liveTrade?.precio_salida, NaN);
  const incomingLivePrice = asNumber(currentPrice, NaN);
  const priceNow = isTradeOpenNow
    ? (Number.isFinite(incomingLivePrice)
      ? incomingLivePrice
      : (Number.isFinite(closedPrice) ? closedPrice : null))
    : (Number.isFinite(closedPrice)
      ? closedPrice
      : (Number.isFinite(incomingLivePrice) ? incomingLivePrice : null));

  const effectiveMetricSnapshots = useMemo(() => {
    if (isTradeOpenNow) return metricSnapshots;
    if (frozenMetricSnapshotsRef.current) return frozenMetricSnapshotsRef.current;
    const closedAtMs = liveTrade?.fecha_cierre ? new Date(liveTrade.fecha_cierre).getTime() : NaN;
    if (!Number.isFinite(closedAtMs)) return metricSnapshots;
    return (metricSnapshots || []).filter((snap: any) => new Date(snap.recorded_at).getTime() <= closedAtMs + 1000);
  }, [isTradeOpenNow, liveTrade?.fecha_cierre, metricSnapshots]);

  const draftSL = asNumber(pendingStopLoss, NaN);
  const draftTP = asNumber(pendingTakeProfit, NaN);
  const slPreview = useMemo(() => {
    if (!Number.isFinite(slCurrent) || !Number.isFinite(draftSL) || !Number.isFinite(entryPrice)) return null;
    return classifySlPreview(tradeDirection, slCurrent, draftSL, entryPrice);
  }, [tradeDirection, slCurrent, draftSL, entryPrice]);

  const snapshotChartData = useMemo(() => {
    const base = (effectiveMetricSnapshots || []).map((snap: any) => {
      const ts = new Date(snap.recorded_at);
      return {
        ts: snap.recorded_at,
        label: `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`,
        rr: asNumber(snap.rr_actual, NaN),
        price: asNumber(snap.price, NaN),
        sl: asNumber(snap.stop_loss, NaN),
      };
    });
    const lastTs = base.length > 0 ? new Date(base[base.length - 1].ts).getTime() : 0;
    const shouldAppendLive = isTradeOpenNow && Number.isFinite(asNumber(priceNow, NaN)) && (Date.now() - lastTs > 4000);
    if (shouldAppendLive) {
      const now = new Date();
      base.push({
        ts: now.toISOString(),
        label: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
        rr: asNumber(liveTrade?.rr_actual, NaN),
        price: asNumber(priceNow, NaN),
        sl: Number.isFinite(slCurrent) ? slCurrent : NaN,
      });
    }
    return base;
  }, [effectiveMetricSnapshots, isTradeOpenNow, liveTrade?.rr_actual, priceNow, slCurrent]);

  const rrActualLive = useMemo(() => {
    const dbRr = asNumber(liveTrade?.rr_actual, NaN);
    const current = asNumber(priceNow, NaN);
    if (!Number.isFinite(entryPrice) || !Number.isFinite(slCurrent) || !Number.isFinite(current)) {
      return dbRr;
    }
    const risk = Math.abs(entryPrice - slCurrent);
    if (!(risk > 0)) return dbRr;
    const rr = tradeDirection === "LONG"
      ? (current - entryPrice) / risk
      : (entryPrice - current) / risk;
    return Number.isFinite(rr) ? rr : dbRr;
  }, [liveTrade?.rr_actual, priceNow, entryPrice, slCurrent, tradeDirection]);

  useEffect(() => {
    if (!open || !tradeId || !liveTrade) return;
    if (String(liveTrade.estado || "").toUpperCase() !== "OPEN") return;
    if (hasAttemptedProtectionSync) return;

    const missingSL = !(Number.isFinite(slCurrentRaw) && slCurrentRaw > 0);
    const missingTP = !(Number.isFinite(tpCurrentRaw) && tpCurrentRaw > 0);
    if (!missingSL && !missingTP) return;

    let canceled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/binance/sync-stop-loss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeId }),
        });
        if (res.ok && !canceled) onUpdated?.();
      } catch {
        // non-blocking
      } finally {
        if (!canceled) setHasAttemptedProtectionSync(true);
      }
    };
    void run();

    return () => {
      canceled = true;
    };
  }, [open, tradeId, liveTrade, slCurrentRaw, tpCurrentRaw, hasAttemptedProtectionSync, onUpdated]);

  const canSaveMove = useMemo(() => {
    if (!liveTrade) return false;
    if (String(liveTrade.estado || "").toUpperCase() !== "OPEN") return false;
    if (!Number.isFinite(draftSL) || draftSL <= 0) return false;
    const slChanged = Number.isFinite(slCurrent) ? Math.abs(draftSL - slCurrent) >= 1e-8 : true;
    const tpChanged = Number.isFinite(tpCurrent)
      ? (Number.isFinite(draftTP) ? Math.abs(draftTP - tpCurrent) >= 1e-8 : true)
      : Number.isFinite(draftTP) && draftTP > 0;
    if (!slChanged && !tpChanged) return false;
    if (slPreview?.riskIncreased && (!overrideRiskIncrease || overrideReason.trim().length < 10)) return false;
    return true;
  }, [liveTrade, draftSL, draftTP, slCurrent, tpCurrent, slPreview, overrideRiskIncrease, overrideReason]);

  const closeNotesLength = closeNotes.trim().length;
  const requiresReflection = Boolean(liveTrade?.sl_was_moved);
  const canCloseTrade = useMemo(() => {
    if (!liveTrade) return false;
    if (String(liveTrade.estado || "").toUpperCase() !== "OPEN") return false;
    const exit = asNumber(exitPrice, NaN);
    if (!Number.isFinite(exit) || exit <= 0) return false;
    if (closeNotesLength < 20) return false;
    if (!Number.isInteger(closeRating) || closeRating < 1 || closeRating > 5) return false;
    if (requiresReflection && slMoveReflection.trim().length < 10) return false;
    return true;
  }, [liveTrade, exitPrice, closeNotesLength, closeRating, requiresReflection, slMoveReflection]);

  const executeSaveProtection = async (params: {
    stopLoss: number;
    takeProfit: number | null;
    source: string;
    forceOverride?: boolean;
  }) => {
    if (!tradeId) return;
    setMoveLoading(true);
    setMoveError(null);

    try {
      const payload = {
        tradeId,
        stopLoss: Number(params.stopLoss),
        takeProfit: Number.isFinite(params.takeProfit as number) && (params.takeProfit as number) > 0
          ? Number(params.takeProfit)
          : null,
        source: params.source,
        overrideRiskIncrease: params.forceOverride || overrideRiskIncrease,
        overrideReason: (params.forceOverride || overrideRiskIncrease) ? overrideReason.trim() : null,
      };

      const res = await fetch("/api/trades/set-protection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo aplicar la protección");
      }

      const nextSL = asNumber(data?.newSL ?? data?.stopLoss ?? params.stopLoss, NaN);
      const nextTP = asNumber(data?.takeProfit ?? params.takeProfit, NaN);
      if (Number.isFinite(nextSL)) setPendingStopLoss(String(nextSL));
      setPendingTakeProfit(Number.isFinite(nextTP) && nextTP > 0 ? String(nextTP) : "");
      setOverrideRiskIncrease(false);
      setOverrideReason("");
      onUpdated?.();
    } catch (err: any) {
      setMoveError(err?.message || "Error aplicando protección SL/TP");
    } finally {
      setMoveLoading(false);
    }
  };

  const handleBreakeven = async () => {
    if (!Number.isFinite(entryPrice)) return;
    setMoveSource("UI_QUICK_BREAKEVEN");
    setPendingStopLoss(String(entryPrice));
    await executeSaveProtection({
      stopLoss: entryPrice,
      takeProfit: Number.isFinite(draftTP) && draftTP > 0 ? draftTP : (Number.isFinite(tpCurrent) ? tpCurrent : null),
      source: "UI_QUICK_BREAKEVEN",
    });
  };

  const handleTrail = async () => {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(slCurrent)) return;
    const basePrice = Number.isFinite(priceNow as number) ? (priceNow as number) : entryPrice;
    const riskDistance = Math.max(Math.abs(entryPrice - slCurrent), Math.abs(entryPrice) * 0.002);

    let target: number;
    if (tradeDirection === "LONG") {
      target = Math.min(basePrice - riskDistance * 0.35, basePrice * 0.9985);
      if (target <= slCurrent) target = slCurrent + riskDistance * 0.15;
      target = Math.min(target, basePrice * 0.9985);
    } else {
      target = Math.max(basePrice + riskDistance * 0.35, basePrice * 1.0015);
      if (target >= slCurrent) target = slCurrent - riskDistance * 0.15;
      target = Math.max(target, basePrice * 1.0015);
    }

    target = Number(target.toFixed(8));
    setMoveSource("UI_QUICK_TRAIL");
    setPendingStopLoss(String(target));
    await executeSaveProtection({
      stopLoss: target,
      takeProfit: Number.isFinite(draftTP) && draftTP > 0 ? draftTP : (Number.isFinite(tpCurrent) ? tpCurrent : null),
      source: "UI_QUICK_TRAIL",
    });
  };

  const handleSaveJournal = async () => {
    if (!liveTrade?.id) return;
    try {
      await updateJournal({
        variables: {
          id: Number(liveTrade.id),
          notas_aprendizaje: journalNotes.trim() || null,
          notas_cierre: closeNotes.trim() || null,
          entry_tesis: entryTesis.trim() || null,
        },
      });
      onUpdated?.();
    } catch (err: any) {
      setMoveError(err?.message || "No se pudo guardar bitácora");
    }
  };

  const handleCloseTrade = async () => {
    if (!tradeId || !canCloseTrade) return;

    setCloseLoading(true);
    setCloseError(null);

    try {
      const res = await fetch("/api/trades/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId,
          exitPrice: asNumber(exitPrice, NaN),
          closeNotes: closeNotes.trim(),
          learningNotes: learningNotes.trim() || null,
          closeRating,
          slMoveReflection: requiresReflection ? slMoveReflection.trim() : null,
          maxAdverseExcursion: liveExtremes?.mae ?? liveTrade?.max_adverse_excursion ?? null,
          maxFavorableExcursion: liveExtremes?.mfe ?? liveTrade?.max_favorable_excursion ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cerrar trade");
      }

      onUpdated?.();
      onOpenChange(false);
    } catch (err: any) {
      setCloseError(err?.message || "Error cerrando trade");
    } finally {
      setCloseLoading(false);
    }
  };

  if (!tradeId || !liveTrade) return null;

  const isOpen = isTradeOpenNow;
  const plannedInitialSL = asNumber(liveTrade?.sl_original ?? liveTrade?.stop_loss, NaN);
  const plannedTP = Number.isFinite(draftTP) && draftTP > 0 ? draftTP : asNumber(liveTrade?.take_profit, NaN);
  const rrInitialPlanned = (() => {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(plannedInitialSL) || !Number.isFinite(plannedTP)) return null;
    const risk = Math.abs(entryPrice - plannedInitialSL);
    const reward = Math.abs((plannedTP as number) - entryPrice);
    if (!(risk > 0) || !(reward > 0)) return null;
    return reward / risk;
  })();

  const handleScreenshotError = () => {
    if (!screenshotSrc) return;
    const marker = "/uploads/";
    const idx = screenshotSrc.indexOf(marker);
    if (idx >= 0) {
      const fallback = screenshotSrc.slice(idx);
      if (fallback && fallback !== screenshotSrc) {
        setScreenshotSrc(fallback);
        return;
      }
    }
    setScreenshotSrc(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Trade #{liveTrade.id} · {liveTrade.simbolo}
            <Badge variant={tradeDirection === "LONG" ? "default" : "destructive"}>{tradeDirection}</Badge>
            <Badge variant={isOpen ? "secondary" : "outline"}>{liveTrade.estado}</Badge>
          </DialogTitle>
          <DialogDescription>
            Gestión unificada de trade: mover SL visualmente, mantener bitácora y cerrar con disciplina.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ExecutionTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gestion">Gestión</TabsTrigger>
            <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
            <TabsTrigger value="cierre">{isOpen ? "Cierre" : "Resumen final"}</TabsTrigger>
          </TabsList>

          <TabsContent value="gestion" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-zinc-500">Entry</p>
                    <p className="font-mono font-semibold">{formatNum(entryPrice)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-zinc-500">Precio actual</p>
                    <p className="font-mono font-semibold">{formatNum(priceNow)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-zinc-500">SL actual</p>
                    <p className="font-mono font-semibold text-red-500">{Number.isFinite(slCurrent) ? formatNum(slCurrent) : "--"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-zinc-500">TP</p>
                    <p className="font-mono font-semibold text-emerald-500">{Number.isFinite(tpCurrent) ? formatNum(tpCurrent) : "--"}</p>
                  </div>
                </div>

                {Number.isFinite(entryPrice) && (
                  <SlCandlestickChart
                    symbol={String(liveTrade?.simbolo || trade?.simbolo || '')}
                    timeframe={liveTrade?.timeframe || '5m'}
                    entry={entryPrice}
                    currentPrice={Number.isFinite(priceNow as number) ? (priceNow as number) : null}
                    stopLoss={Number.isFinite(draftSL) && draftSL > 0 ? draftSL : (Number.isFinite(slCurrent) ? slCurrent : null)}
                    takeProfit={Number.isFinite(draftTP) && draftTP > 0 ? draftTP : (Number.isFinite(tpCurrent) ? tpCurrent : null)}
                    direction={tradeDirection}
                    onStopLossDraft={(value) => {
                      setPendingStopLoss(String(value));
                      setMoveSource("UI_DRAG");
                    }}
                    onTakeProfitDraft={(value) => {
                      setPendingTakeProfit(String(value));
                      setMoveSource("UI_DRAG");
                    }}
                    onDragStateChange={setIsProtectionDragging}
                    disabled={!isOpen || moveLoading}
                  />
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nuevo Stop Loss</Label>
                    <Input
                      value={pendingStopLoss}
                      onChange={(e) => {
                        setPendingStopLoss(e.target.value);
                        setMoveSource("UI_INPUT");
                      }}
                      type="number"
                      step="0.00000001"
                      disabled={!isOpen || moveLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nuevo Take Profit</Label>
                    <Input
                      value={pendingTakeProfit}
                      onChange={(e) => {
                        setPendingTakeProfit(e.target.value);
                        setMoveSource("UI_INPUT");
                      }}
                      type="number"
                      step="0.00000001"
                      disabled={!isOpen || moveLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Input value={moveSource} onChange={(e) => setMoveSource(e.target.value)} disabled={moveLoading} />
                  </div>
                </div>

                <div className={`rounded-md border p-3 text-sm min-h-[54px] ${slPreview?.riskIncreased ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"}`}>
                  {slPreview ? (
                    <div className="flex items-center gap-2 font-medium">
                      {slPreview.riskIncreased ? <ShieldAlert className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      Movimiento detectado: <span className="font-mono">{slPreview.slMoveDirection}</span>
                      {isProtectionDragging && <span className="text-xs text-zinc-500">(ajustando...)</span>}
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-xs">Ajusta SL/TP para previsualizar riesgo.</p>
                  )}
                </div>

                {slPreview?.riskIncreased && !isProtectionDragging && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={overrideRiskIncrease}
                        onChange={(e) => setOverrideRiskIncrease(e.target.checked)}
                      />
                      Permitir override (aumento de riesgo)
                    </label>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full min-h-[84px] rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                      placeholder="Razón obligatoria (mínimo 10 caracteres)"
                    />
                  </div>
                )}

                {moveError && <p className="text-sm text-red-600">{moveError}</p>}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleBreakeven} disabled={!isOpen || moveLoading || !Number.isFinite(entryPrice)}>
                    Breakeven
                  </Button>
                  <Button variant="outline" onClick={handleTrail} disabled={!isOpen || moveLoading || !Number.isFinite(slCurrent)}>
                    Trail
                  </Button>
                  <Button
                    onClick={() => executeSaveProtection({
                      stopLoss: draftSL,
                      takeProfit: Number.isFinite(draftTP) && draftTP > 0 ? draftTP : null,
                      source: moveSource,
                    })}
                    disabled={!canSaveMove || moveLoading}
                  >
                    {moveLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Aplicar protección SL/TP
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs uppercase text-zinc-500">Disciplina sesión</p>
                  <p className="text-sm">Estado mental: <b>{session?.mental_state || "--"}</b></p>
                  <p className="text-sm">Reglas confirmadas: <b>{session?.rules_confirmed ? "Sí" : "No"}</b></p>
                  <p className="text-sm">Pérdidas consecutivas: <b>{session?.consecutive_losses_today ?? "--"}</b></p>
                  <p className="text-sm">Saldo snapshot: <b>{Number.isFinite(balanceUsdt) ? `$${balanceUsdt.toFixed(2)}` : "--"}</b></p>
                  {session?.blocked_until && (
                    <p className="text-xs text-amber-600">Bloqueado hasta: {new Date(session.blocked_until).toLocaleString()}</p>
                  )}
                </div>

                <div className="rounded-md border p-3 space-y-2 text-sm">
                  <p className="text-xs uppercase text-zinc-500">Riesgo / R:R</p>
                  <p>Riesgo USDT: <b>{formatMoney(liveTrade.risk_amount_usdt)}</b></p>
                  <p>Riesgo %: <b>{Number.isFinite(asNumber(liveTrade.risk_percent, NaN)) ? `${asNumber(liveTrade.risk_percent, NaN).toFixed(2)}%` : "--"}</b></p>
                  <p>RR inicial (TP/SL plan): <b>{Number.isFinite(rrInitialPlanned as number) ? (rrInitialPlanned as number).toFixed(2) : "--"}</b></p>
                  <p>RR estimado (BD): <b>{Number.isFinite(asNumber(liveTrade.rr_estimated, NaN)) ? asNumber(liveTrade.rr_estimated, NaN).toFixed(2) : "--"}</b></p>
                  <p>RR actual: <b>{Number.isFinite(rrActualLive) ? rrActualLive.toFixed(2) : "--"}</b></p>
                  <p>RR max posible: <b>{Number.isFinite(asNumber(liveTrade.rr_max_possible, NaN)) ? asNumber(liveTrade.rr_max_possible, NaN).toFixed(2) : "--"}</b></p>
                </div>

                <div className="rounded-md border p-3 space-y-2 text-sm">
                  <p className="text-xs uppercase text-zinc-500">Evolución RR en tiempo real</p>
                  {snapshotChartData.length > 2 ? (
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={snapshotChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="label" minTickGap={36} tick={{ fontSize: 10 }} />
                          <YAxis orientation="right" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                          <Tooltip
                            formatter={(value: any, name?: any) => {
                              if (name === "rr") return [Number(value).toFixed(2), "RR"];
                              return [Number(value).toFixed(4), "Precio"];
                            }}
                          />
                          <Line type="linear" isAnimationActive={false} connectNulls dataKey="rr" stroke="#22c55e" strokeWidth={1} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Aún no hay suficientes snapshots de evolución.</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bitacora" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Tesis de entrada</Label>
                  <textarea
                    value={entryTesis}
                    onChange={(e) => setEntryTesis(e.target.value)}
                    className="w-full min-h-[96px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
                    placeholder="¿Cuál fue la tesis exacta de ejecución?"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notas de aprendizaje</Label>
                  <textarea
                    value={journalNotes}
                    onChange={(e) => setJournalNotes(e.target.value)}
                    className="w-full min-h-[110px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notas de cierre</Label>
                  <textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    className="w-full min-h-[110px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
                  />
                </div>

                <Button onClick={handleSaveJournal} disabled={savingJournal}>
                  {savingJournal && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Guardar bitácora
                </Button>
              </div>

              <div className="space-y-3">
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs uppercase text-zinc-500">Screenshot del trade</p>
                  {screenshotSrc ? (
                    <button
                      type="button"
                      className="w-full rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800"
                      onClick={() => setIsScreenshotOpen(true)}
                    >
                      <img
                        src={screenshotSrc || undefined}
                        alt="Trade screenshot"
                        className="w-full h-[180px] object-cover hover:scale-[1.02] transition-transform"
                        onError={handleScreenshotError}
                      />
                    </button>
                  ) : (
                    <p className="text-sm text-zinc-500">No hay screenshot adjunto para este trade.</p>
                  )}
                </div>

                <div className="rounded-md border p-3 space-y-2 text-sm">
                  <p className="text-xs uppercase text-zinc-500">Contexto del trade</p>
                  <p>Checklist confirmado: <b>{liveTrade.checklist_confirmed ? "Sí" : "No"}</b></p>
                  <p>Mental state sesión: <b>{liveTrade.session_mental_state || "--"}</b></p>
                  <p>Setup / TF: <b>{liveTrade.setup_tag || "--"} / {liveTrade.timeframe || "--"}</b></p>
                  <p>Emoción: <b>{liveTrade.emocion_entrada || "--"}</b></p>
                  <p>SL movimientos: <b>{liveTrade.sl_move_count ?? 0}</b></p>
                  <p>Dirección SL: <b>{liveTrade.sl_move_direction || "not_moved"}</b></p>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs uppercase text-zinc-500">Evolución precio vs SL</p>
                  {snapshotChartData.length > 2 ? (
                    <div className="h-[170px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={snapshotChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="label" minTickGap={36} tick={{ fontSize: 10 }} />
                          <YAxis orientation="right" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                          <Tooltip
                            formatter={(value: any, name?: any) => {
                              if (name === "price") return [Number(value).toFixed(4), "Precio"];
                              if (name === "sl") return [Number(value).toFixed(4), "SL"];
                              return [Number(value).toFixed(2), "RR"];
                            }}
                          />
                          <Line type="linear" isAnimationActive={false} connectNulls dataKey="price" stroke="#3b82f6" strokeWidth={1} dot={false} />
                          <Line type="linear" isAnimationActive={false} connectNulls dataKey="sl" stroke="#ef4444" strokeWidth={1} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Aún no hay datos suficientes para la evolución.</p>
                  )}
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs uppercase text-zinc-500">Historial SL (realtime)</p>
                  {slMovements.length === 0 ? (
                    <p className="text-sm text-zinc-500">Aún no hay movimientos de SL.</p>
                  ) : (
                    <div className="max-h-[250px] overflow-y-auto space-y-2">
                      {slMovements.map((move: any) => (
                        <div key={move.id} className="rounded border p-2 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="font-mono">{formatNum(move.original_sl)} → {formatNum(move.new_sl)}</span>
                            <span className={move.risk_increased ? "text-red-500 font-semibold" : "text-emerald-500 font-semibold"}>
                              {move.direction}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between text-zinc-500">
                            <span>{move.source}</span>
                            <span>{new Date(move.moved_at).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cierre" className="space-y-4">
            {!isOpen ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-sm space-y-2">
                  <p className="font-semibold">Trade cerrado</p>
                  <p>
                    Cerrado desde{" "}
                    <b>{liveTrade.fecha_cierre ? new Date(liveTrade.fecha_cierre).toLocaleString() : "--"}</b>
                  </p>
                  <p>PnL final: <b>{formatMoney(liveTrade.pnl_realizado)}</b></p>
                  <p>RR final: <b>{Number.isFinite(rrActualLive) ? rrActualLive.toFixed(2) : "--"}</b></p>
                  <p>Comisión final: <b>{formatMoney(liveTrade.comision)}</b></p>
                </div>

                <div className="rounded-md border p-4 text-sm space-y-2">
                  <p className="text-xs uppercase text-zinc-500">Resumen congelado</p>
                  <p>Entry: <b className="font-mono">{formatNum(entryPrice)}</b></p>
                  <p>Salida: <b className="font-mono">{formatNum(liveTrade.precio_salida)}</b></p>
                  <p>SL final: <b className="font-mono">{formatNum(slCurrent)}</b></p>
                  <p>TP final: <b className="font-mono">{formatNum(tpCurrent)}</b></p>
                  <Separator />
                  <p>MAE: <b className="font-mono">{formatNum(liveTrade.max_adverse_excursion)}</b></p>
                  <p>MFE: <b className="font-mono">{formatNum(liveTrade.max_favorable_excursion)}</b></p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Precio de salida</Label>
                    <Input
                      value={exitPrice}
                      onChange={(e) => setExitPrice(e.target.value)}
                      type="number"
                      step="0.00000001"
                      placeholder="Ej: 2419.36"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notas de cierre (mínimo 20)</Label>
                    <textarea
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      className="w-full min-h-[96px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
                      placeholder="¿Qué pasó en el cierre y por qué ejecutaste así?"
                    />
                    <p className={`text-xs ${closeNotesLength >= 20 ? "text-emerald-600" : "text-zinc-500"}`}>
                      {closeNotesLength}/20 mínimos
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Lección aprendida (opcional)</Label>
                    <textarea
                      value={learningNotes}
                      onChange={(e) => setLearningNotes(e.target.value)}
                      className="w-full min-h-[84px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Calificación ejecución (1-5)</Label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`h-10 w-10 rounded-full border flex items-center justify-center transition ${
                            closeRating >= value
                              ? "border-amber-400 bg-amber-50 text-amber-600"
                              : "border-zinc-300 text-zinc-400"
                          }`}
                          onClick={() => setCloseRating(value)}
                        >
                          <Sparkles className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {requiresReflection && (
                    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                      <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Se detectó movimiento SL. Reflexión obligatoria.
                      </div>
                      <textarea
                        value={slMoveReflection}
                        onChange={(e) => setSlMoveReflection(e.target.value)}
                        className="w-full min-h-[84px] rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                        placeholder="¿Qué pensabas cuando moviste el SL? (mínimo 10)"
                      />
                    </div>
                  )}

                  {closeError && <p className="text-sm text-red-600">{closeError}</p>}

                  <Button onClick={handleCloseTrade} disabled={!canCloseTrade || closeLoading}>
                    {closeLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Guardar y cerrar trade
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <p className="text-xs uppercase text-zinc-500">Contexto de cierre</p>
                    <p>Entry: <b className="font-mono">{formatNum(entryPrice)}</b></p>
                    <p>SL: <b className="font-mono">{formatNum(slCurrent)}</b></p>
                    <p>TP: <b className="font-mono">{formatNum(tpCurrent)}</b></p>
                    <Separator />
                    <p>MAE (live): <b className="font-mono">{Number.isFinite(asNumber(liveExtremes?.mae, NaN)) ? formatNum(liveExtremes?.mae) : "--"}</b></p>
                    <p>MFE (live): <b className="font-mono">{Number.isFinite(asNumber(liveExtremes?.mfe, NaN)) ? formatNum(liveExtremes?.mfe) : "--"}</b></p>
                  </div>

                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <p className="text-xs uppercase text-zinc-500">PnL actual</p>
                    <div className="flex items-center gap-2">
                      {asNumber(liveTrade.pnl_realizado, 0) >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <b>{formatMoney(liveTrade.pnl_realizado)}</b>
                    </div>
                    <p>Comisión: <b>{formatMoney(liveTrade.comision)}</b></p>
                    <p>RR actual: <b>{Number.isFinite(rrActualLive) ? rrActualLive.toFixed(2) : "--"}</b></p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isScreenshotOpen} onOpenChange={setIsScreenshotOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-2">
            {screenshotSrc ? (
              <img
                src={screenshotSrc || undefined}
                alt="Trade screenshot full"
                className="w-full h-auto max-h-[82vh] object-contain rounded-md"
                onError={handleScreenshotError}
              />
            ) : (
              <p className="text-sm text-zinc-500 p-4">No screenshot disponible.</p>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
