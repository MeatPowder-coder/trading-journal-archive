
import { useEffect, useMemo, useState } from "react";
import { gql, useSubscription } from "@apollo/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { PreTradeGateway } from "@/components/PreTradeGateway";
import { MENTAL_STATE_LABELS, MentalState } from "@/lib/trading/mental-states";

const SESSION_SUBSCRIPTION = gql`
  subscription TradingSessionToday($sessionDate: date!) {
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

const ACCOUNT_SNAPSHOT_SUBSCRIPTION = gql`
  subscription AccountSnapshotLatest {
    account_snapshots(order_by: { recorded_at: desc }, limit: 1) {
      id
      balance_usdt
      source
      recorded_at
    }
  }
`;

const ACCOUNT_BALANCE_SUBSCRIPTION = gql`
  subscription AccountBalanceFallback {
    cuentas_by_pk(id: 1) {
      id
      saldo_actual
    }
  }
`;

interface OpenTradeModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: {
    symbol?: string;
    side?: "LONG" | "SHORT";
    leverage?: number;
    margin?: number;
  };
  chatSessionId?: string;
  showTrigger?: boolean;
}

type PreTradePayload = {
  checklistConfirmed: boolean;
  checklistCheckedCount: number;
  checklistTotal: number;
  checklistMissing: string[];
  checklistTimestamp: string;
  mentalState: MentalState | null;
  session: any;
};

type OrderType = "MARKET" | "LIMIT";
type Stage = "gateway" | "ticket" | "postProtection";

function asNumber(value: string | number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function toTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function OpenTradeModal({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  initialValues,
  chatSessionId,
  showTrigger = true,
}: OpenTradeModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled && setControlledOpen) setControlledOpen(next);
    else setInternalOpen(next);
  };

  const getReadableApiError = (res: Response, raw: string, data: any, fallback: string) => {
    const jsonMessage = data?.error || data?.message;
    const isHtmlLike = (value: string) =>
      /^\s*<!doctype html/i.test(value) ||
      /^\s*<html/i.test(value) ||
      /<head[\s>]/i.test(value) ||
      /error code 502/i.test(value);

    if (typeof jsonMessage === "string" && jsonMessage.trim()) {
      if (isHtmlLike(jsonMessage)) {
        if (res.status === 502 || /error code 502/i.test(jsonMessage)) {
          return "Servicio temporalmente no disponible (502). Intenta nuevamente en unos segundos.";
        }
        if (res.status === 503) {
          return "Servicio temporalmente no disponible (503). Intenta nuevamente en unos segundos.";
        }
        return `Error del servidor (${res.status}). No se pudo procesar la solicitud en este momento.`;
      }
      return jsonMessage.trim();
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const looksLikeHtml =
      contentType.includes("text/html") ||
      isHtmlLike(raw);

    if (looksLikeHtml) {
      if (res.status === 502 || /error code 502/i.test(raw)) {
        return "Servicio temporalmente no disponible (502). Intenta nuevamente en unos segundos.";
      }
      if (res.status === 503) {
        return "Servicio temporalmente no disponible (503). Intenta nuevamente en unos segundos.";
      }
      return `Error del servidor (${res.status}). No se pudo procesar la solicitud en este momento.`;
    }

    if (raw && raw.trim()) {
      return raw.replace(/\s+/g, " ").trim().slice(0, 220);
    }
    return fallback;
  };

  const sessionDate = useMemo(() => toTodayDate(), [open]);
  const { data: sessionData, loading: sessionLoading, error: sessionSubError } = useSubscription(SESSION_SUBSCRIPTION, {
    variables: { sessionDate },
    skip: !open,
  });
  const { data: snapshotData, error: snapshotSubError } = useSubscription(ACCOUNT_SNAPSHOT_SUBSCRIPTION, { skip: !open });
  const { data: accountData, error: accountSubError } = useSubscription(ACCOUNT_BALANCE_SUBSCRIPTION, { skip: !open });

  const [stage, setStage] = useState<Stage>("gateway");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("ETHUSDT");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [leverage, setLeverage] = useState(20);
  const [margin, setMargin] = useState(50);

  const [limitEntryPrice, setLimitEntryPrice] = useState("");
  const [limitStopLoss, setLimitStopLoss] = useState("");
  const [limitTakeProfit, setLimitTakeProfit] = useState("");

  const [entryTesis, setEntryTesis] = useState("");
  const [setupTag, setSetupTag] = useState("");
  const [timeframe, setTimeframe] = useState("5m");
  const [zonaEntrada, setZonaEntrada] = useState("");
  const [tendenciaMacro, setTendenciaMacro] = useState("");
  const [contextoMercado, setContextoMercado] = useState("");
  const [volatilidad, setVolatilidad] = useState("");
  const [tipoLiquidez, setTipoLiquidez] = useState("");
  const [estadoDelta, setEstadoDelta] = useState("");
  const [volumenEstado, setVolumenEstado] = useState("");
  const [absorcionDetectada, setAbsorcionDetectada] = useState(false);
  const [emocionEntrada, setEmocionEntrada] = useState("");
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);

  const [postProtectionTradeId, setPostProtectionTradeId] = useState<number | null>(null);
  const [postProtectionSymbol, setPostProtectionSymbol] = useState<string>("");
  const [postProtectionEntry, setPostProtectionEntry] = useState<number | null>(null);
  const [postStopLoss, setPostStopLoss] = useState("");
  const [postTakeProfit, setPostTakeProfit] = useState("");

  const [preTrade, setPreTrade] = useState<PreTradePayload | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [consecutiveLossesToday, setConsecutiveLossesToday] = useState<number>(0);
  const [postCooldownConfirmed, setPostCooldownConfirmed] = useState<boolean>(false);
  const [fallbackPrecheck, setFallbackPrecheck] = useState<any>(null);

  const session = sessionData?.trading_sessions?.[0] || fallbackPrecheck?.session || null;

  const balanceUsdt = useMemo(() => {
    const snap = Number(snapshotData?.account_snapshots?.[0]?.balance_usdt || 0);
    if (Number.isFinite(snap) && snap > 0) return snap;
    const fallback = Number(accountData?.cuentas_by_pk?.saldo_actual || 0);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
    const apiFallback = Number(fallbackPrecheck?.balanceUsdt || 0);
    return Number.isFinite(apiFallback) ? apiFallback : 0;
  }, [snapshotData, accountData, fallbackPrecheck?.balanceUsdt]);

  useEffect(() => {
    if (!open) return;

    setStage("gateway");
    setError(null);
    setPreTrade(null);
    setFallbackPrecheck(null);
    setPostProtectionTradeId(null);
    setPostProtectionSymbol("");
    setPostProtectionEntry(null);
    setPostStopLoss("");
    setPostTakeProfit("");

    setSymbol(initialValues?.symbol?.toUpperCase() || "ETHUSDT");
    setSide(initialValues?.side || "LONG");
    setLeverage(initialValues?.leverage || 20);
    setMargin(initialValues?.margin || 50);

    setOrderType("MARKET");
    setLimitEntryPrice("");
    setLimitStopLoss("");
    setLimitTakeProfit("");

    setEntryTesis("");
    setSetupTag("");
    setTimeframe("5m");
    setZonaEntrada("");
    setTendenciaMacro("");
    setContextoMercado("");
    setVolatilidad("");
    setTipoLiquidez("");
    setEstadoDelta("");
    setVolumenEstado("");
    setAbsorcionDetectada(false);
    setEmocionEntrada("");
    setShowDetailedAnalysis(false);

    setPostCooldownConfirmed(false);
  }, [open, initialValues]);

  useEffect(() => {
    if (!open) return;
    if (!sessionSubError && !snapshotSubError && !accountSubError) return;

    let cancelled = false;
    const runFallback = async () => {
      try {
        const res = await fetch("/api/trades/precheck");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setFallbackPrecheck(data);
        }
      } catch {
        // keep subscription path
      }
    };

    void runFallback();
    return () => {
      cancelled = true;
    };
  }, [open, sessionSubError, snapshotSubError, accountSubError]);

  useEffect(() => {
    if (!session) {
      setBlockedUntil(null);
      setRemainingSeconds(0);
      setConsecutiveLossesToday(0);
      return;
    }

    const blocked = session?.blocked_until ? new Date(session.blocked_until) : null;
    const now = Date.now();
    const seconds = blocked ? Math.max(0, Math.ceil((blocked.getTime() - now) / 1000)) : 0;

    setBlockedUntil(session.blocked_until || null);
    setRemainingSeconds(seconds);
    setConsecutiveLossesToday(Number(session?.consecutive_losses_today || 0));
  }, [session?.blocked_until, session?.consecutive_losses_today]);

  useEffect(() => {
    if (!open || remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [open, remainingSeconds]);

  useEffect(() => {
    if (!open || !symbol || orderType !== "LIMIT") return;
    if (limitEntryPrice) return;

    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/binance/price/${symbol.toUpperCase()}`);
        const data = await res.json().catch(() => ({}));
        const price = Number(data?.price || 0);
        if (!cancelled && Number.isFinite(price) && price > 0) {
          setLimitEntryPrice(String(price));
        }
      } catch {
        // non-blocking
      }
    };

    void fetchPrice();
    return () => {
      cancelled = true;
    };
  }, [open, symbol, orderType, limitEntryPrice]);

  const limitEntry = asNumber(limitEntryPrice);
  const limitSL = asNumber(limitStopLoss);
  const limitTP = asNumber(limitTakeProfit);
  const postSLNum = asNumber(postStopLoss);
  const postTPNum = asNumber(postTakeProfit);

  const isAvoidState = (preTrade?.mentalState || session?.mental_state) === "avoid";

  const limitDirectionOk = useMemo(() => {
    if (!(Number.isFinite(limitEntry) && limitEntry > 0 && Number.isFinite(limitSL) && limitSL > 0)) return false;
    if (side === "LONG" && !(limitSL < limitEntry)) return false;
    if (side === "SHORT" && !(limitSL > limitEntry)) return false;

    if (Number.isFinite(limitTP) && limitTP > 0) {
      if (side === "LONG" && !(limitTP > limitEntry)) return false;
      if (side === "SHORT" && !(limitTP < limitEntry)) return false;
    }

    return true;
  }, [limitEntry, limitSL, limitTP, side]);

  const canSubmitTicket = useMemo(() => {
    if (!preTrade) return false;
    if (isAvoidState) return false;
    if (!symbol.trim()) return false;
    if (!Number.isFinite(asNumber(leverage)) || Number(leverage) < 1 || Number(leverage) > 125) return false;
    if (!Number.isFinite(asNumber(margin)) || Number(margin) <= 0) return false;
    if (remainingSeconds > 0) return false;
    if (remainingSeconds === 0 && consecutiveLossesToday >= 2 && !postCooldownConfirmed) return false;

    if (orderType === "LIMIT") {
      if (!(Number.isFinite(limitEntry) && limitEntry > 0)) return false;
      if (!(Number.isFinite(limitSL) && limitSL > 0)) return false;
      if (!limitDirectionOk) return false;
    }

    return true;
  }, [
    preTrade,
    isAvoidState,
    symbol,
    leverage,
    margin,
    remainingSeconds,
    consecutiveLossesToday,
    postCooldownConfirmed,
    orderType,
    limitEntry,
    limitSL,
    limitDirectionOk,
  ]);

  const canSubmitPostProtection = useMemo(() => {
    if (!postProtectionTradeId) return false;
    if (!(Number.isFinite(postSLNum) && postSLNum > 0)) return false;

    if (Number.isFinite(postProtectionEntry as number) && (postProtectionEntry as number) > 0) {
      if (side === "LONG" && !(postSLNum < (postProtectionEntry as number))) return false;
      if (side === "SHORT" && !(postSLNum > (postProtectionEntry as number))) return false;

      if (Number.isFinite(postTPNum) && postTPNum > 0) {
        if (side === "LONG" && !(postTPNum > (postProtectionEntry as number))) return false;
        if (side === "SHORT" && !(postTPNum < (postProtectionEntry as number))) return false;
      }
    }

    return true;
  }, [postProtectionTradeId, postSLNum, postTPNum, postProtectionEntry, side]);

  const handleOpenFastTicket = async () => {
    if (!canSubmitTicket) return;

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        symbol: symbol.toUpperCase(),
        side,
        orderType,
        leverage: Number(leverage),
        margin: Number(margin),
        checklistConfirmed: preTrade?.checklistConfirmed,
        checklistCheckedCount: preTrade?.checklistCheckedCount,
        checklistTotal: preTrade?.checklistTotal,
        checklistMissing: preTrade?.checklistMissing,
        checklistTimestamp: preTrade?.checklistTimestamp,
        mentalState: preTrade?.mentalState,
        overrideCooldown: postCooldownConfirmed,
        chatSessionId,
      };

      if (orderType === "LIMIT") {
        payload.entryPrice = Number(limitEntry);
        payload.stopLoss = Number(limitSL);
        payload.takeProfit = Number.isFinite(limitTP) && limitTP > 0 ? Number(limitTP) : null;
        payload.entryTesis = entryTesis.trim() || null;
        payload.setupTag = setupTag || null;
        payload.timeframe = timeframe || null;
        payload.zonaEntrada = zonaEntrada || null;
        payload.tendenciaMacro = tendenciaMacro || null;
        payload.contextoMercado = contextoMercado || null;
        payload.volatilidad = volatilidad || null;
        payload.tipoLiquidez = tipoLiquidez || null;
        payload.estadoDelta = estadoDelta || null;
        payload.volumenEstado = volumenEstado || null;
        payload.absorcionDetectada = absorcionDetectada;
        payload.emocionEntrada = emocionEntrada || null;
      }

      const res = await fetch("/api/binance/open-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      const data = (() => {
        try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
      })();
      if (!res.ok) {
        if (data.code === "TRADING_COOLDOWN_ACTIVE") {
          setBlockedUntil(data.blockedUntil || null);
          setRemainingSeconds(Number(data.remainingSeconds || 0));
        }
        throw new Error(getReadableApiError(res, raw, data, "No se pudo abrir la posición"));
      }

      if (data.requiresPostProtection && data.tradeId) {
        setPostProtectionTradeId(Number(data.tradeId));
        setPostProtectionSymbol(String(data?.details?.symbol || symbol));
        setPostProtectionEntry(Number(data?.details?.price || 0) || null);
        setPostStopLoss("");
        setPostTakeProfit("");
        setStage("postProtection");
        return;
      }

      alert(
        orderType === "LIMIT"
          ? `Orden LIMIT pendiente creada en ${symbol} (${side}). Estado: ${data.entryOrderStatus || "NEW"}. Orden #${data.pendingOrderId || "N/A"}`
          : `Posición abierta en ${symbol} (${side}). Trade #${data.tradeId}`
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pending-limits-updated"));
      }
      setOpen(false);
    } catch (err: any) {
      setError(err.message || "Error abriendo posición");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPostProtection = async () => {
    if (!canSubmitPostProtection || !postProtectionTradeId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/trades/set-protection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: postProtectionTradeId,
          stopLoss: Number(postSLNum),
          takeProfit: Number.isFinite(postTPNum) && postTPNum > 0 ? Number(postTPNum) : null,
          source: "UI_POST_ENTRY",
        }),
      });

      const raw = await res.text();
      const data = (() => {
        try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
      })();
      if (!res.ok) {
        throw new Error(getReadableApiError(res, raw, data, "No se pudo colocar la protección"));
      }

      // Persist optional context after successful protection.
      if (
        entryTesis.trim() ||
        setupTag || timeframe || zonaEntrada || tendenciaMacro || contextoMercado ||
        volatilidad || tipoLiquidez || estadoDelta || volumenEstado || emocionEntrada || absorcionDetectada
      ) {
        await fetch("/api/trades/post-entry-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId: postProtectionTradeId,
            entryTesis: entryTesis.trim() || null,
            setupTag: setupTag || null,
            timeframe: timeframe || null,
            zonaEntrada: zonaEntrada || null,
            tendenciaMacro: tendenciaMacro || null,
            contextoMercado: contextoMercado || null,
            volatilidad: volatilidad || null,
            tipoLiquidez: tipoLiquidez || null,
            estadoDelta: estadoDelta || null,
            volumenEstado: volumenEstado || null,
            absorcionDetectada,
            emocionEntrada: emocionEntrada || null,
          }),
        }).catch(() => undefined);
      }

      alert(`Protección aplicada al trade #${postProtectionTradeId}.`);
      setOpen(false);
    } catch (err: any) {
      setError(err.message || "Error configurando protección");
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyClose = async () => {
    if (!postProtectionSymbol) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/binance/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: postProtectionSymbol }),
      });

      const raw = await res.text();
      const data = (() => {
        try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
      })();
      if (!res.ok) throw new Error(getReadableApiError(res, raw, data, "No se pudo cerrar en emergencia"));

      alert(`Cierre de emergencia enviado para ${postProtectionSymbol}.`);
      setOpen(false);
    } catch (err: any) {
      setError(err.message || 'Error en cierre de emergencia');
    } finally {
      setLoading(false);
    }
  };

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <TrendingUp className="h-4 w-4" />
            Nueva Operación
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stage === "gateway" && "Pre-Trade Gateway"}
            {stage === "ticket" && "Ticket Rápido de Ejecución"}
            {stage === "postProtection" && "Protección Inmediata Post-Entrada"}
          </DialogTitle>
          <DialogDescription>
            {stage === "gateway" && "Checklist flexible + estado mental. No te frena la velocidad de entrada."}
            {stage === "ticket" && "Flujo rápido: MARKET por defecto y LIMIT opcional con precio de entrada."}
            {stage === "postProtection" && "Define SL obligatorio después de entrar en MARKET. TP opcional."}
          </DialogDescription>
        </DialogHeader>

        {remainingSeconds > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Bloqueo activo por 2 pérdidas consecutivas. Espera {mins}:{String(secs).padStart(2, "0")} para habilitar nueva operación.
          </div>
        )}

        {blockedUntil && remainingSeconds > 0 && (
          <p className="text-xs text-zinc-500">Bloqueo hasta: {new Date(blockedUntil).toLocaleString()}</p>
        )}

        {stage === "gateway" && (
          <PreTradeGateway
            open={open}
            session={session}
            loadingSession={sessionLoading}
            onComplete={(payload) => {
              setPreTrade(payload);
              setStage("ticket");
            }}
          />
        )}

        {stage === "ticket" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Símbolo</Label>
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="ETHUSDT" />
              </div>

              <div className="space-y-2">
                <Label>Dirección</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={side === "LONG" ? "default" : "outline"} className={side === "LONG" ? "w-full bg-emerald-600 hover:bg-emerald-700" : "w-full"} onClick={() => setSide("LONG")}>LONG</Button>
                  <Button type="button" variant={side === "SHORT" ? "default" : "outline"} className={side === "SHORT" ? "w-full bg-red-600 hover:bg-red-700" : "w-full"} onClick={() => setSide("SHORT")}>SHORT</Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de orden</Label>
              <div className="flex gap-2">
                <Button type="button" variant={orderType === "MARKET" ? "default" : "outline"} onClick={() => setOrderType("MARKET")}>MARKET (por defecto)</Button>
                <Button type="button" variant={orderType === "LIMIT" ? "default" : "outline"} onClick={() => setOrderType("LIMIT")}>LIMIT</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Margen (USDT)</Label>
                <Input type="number" min="1" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Leverage</Label>
                <Input type="number" min="1" max="125" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
              </div>
            </div>

            {orderType === "LIMIT" ? (
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Precio entrada (LIMIT)</Label>
                    <Input type="number" step="0.00000001" value={limitEntryPrice} onChange={(e) => setLimitEntryPrice(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Stop Loss (obligatorio)</Label>
                    <Input type="number" step="0.00000001" value={limitStopLoss} onChange={(e) => setLimitStopLoss(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Take Profit (opcional)</Label>
                    <Input type="number" step="0.00000001" value={limitTakeProfit} onChange={(e) => setLimitTakeProfit(e.target.value)} />
                  </div>
                </div>

                {!limitDirectionOk && limitEntryPrice && limitStopLoss && (
                  <div className="rounded-md border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
                    Revisa dirección y niveles: para LONG el SL debe estar debajo (y TP arriba); para SHORT, al revés.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-blue-300 bg-blue-50 text-blue-800 p-3 text-sm">
                En MARKET no necesitas precio de entrada previo. Se ejecuta de inmediato y luego fijas SL/TP.
              </div>
            )}

            {preTrade && (
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-sm space-y-1">
                <p>Checklist: <b>{preTrade.checklistCheckedCount}/{preTrade.checklistTotal}</b> reglas marcadas.</p>
                <p>Estado mental: <b>{preTrade.mentalState ? MENTAL_STATE_LABELS[preTrade.mentalState] : "--"}</b></p>
                {preTrade.checklistMissing.length > 0 && (
                  <p className="text-amber-600">Se guardará que abriste con reglas pendientes (no bloqueante).</p>
                )}
              </div>
            )}

            {isAvoidState && (
              <div className="rounded-md border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
                Bloqueado: seleccionaste "Mejor No Operar" como estado mental.
              </div>
            )}

            {remainingSeconds === 0 && consecutiveLossesToday >= 2 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                <p className="text-sm text-amber-900">
                  Hoy ya registras 2 pérdidas consecutivas. Confirma explícitamente que vas a operar solo si el setup es A+.
                </p>
                <Button
                  type="button"
                  variant={postCooldownConfirmed ? "default" : "outline"}
                  onClick={() => setPostCooldownConfirmed((v) => !v)}
                >
                  {postCooldownConfirmed ? "Confirmación aplicada" : "Confirmo continuar con disciplina"}
                </Button>
              </div>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        )}

        {stage === "postProtection" && (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 p-3 text-sm">
              Entrada ejecutada en Binance. Trade <b>#{postProtectionTradeId}</b> ({postProtectionSymbol}).
              {Number.isFinite(postProtectionEntry as number) && (
                <span> Entry aprox: <b>{Number(postProtectionEntry).toFixed(4)}</b>.</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stop Loss (obligatorio)</Label>
                <Input type="number" step="0.00000001" value={postStopLoss} onChange={(e) => setPostStopLoss(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Take Profit (opcional)</Label>
                <Input type="number" step="0.00000001" value={postTakeProfit} onChange={(e) => setPostTakeProfit(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tesis de entrada (opcional, recomendado)</Label>
              <textarea
                value={entryTesis}
                onChange={(e) => setEntryTesis(e.target.value)}
                placeholder="¿Qué validó esta entrada?"
                className="w-full min-h-[84px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-left text-sm"
              onClick={() => setShowDetailedAnalysis((v) => !v)}
            >
              {showDetailedAnalysis ? "Ocultar" : "Mostrar"} contexto adicional de bitácora
            </button>

            {showDetailedAnalysis && (
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Setup</Label>
                    <Input value={setupTag} onChange={(e) => setSetupTag(e.target.value)} placeholder="Breakout, Reversal..." />
                  </div>
                  <div>
                    <Label>Timeframe</Label>
                    <Input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="5m, 15m, 1h" />
                  </div>
                </div>

                <div>
                  <Label>Zona de entrada</Label>
                  <Input value={zonaEntrada} onChange={(e) => setZonaEntrada(e.target.value)} placeholder="Ruptura + retest" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Tendencia macro</Label>
                    <select value={tendenciaMacro} onChange={(e) => setTendenciaMacro(e.target.value)} className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                      <option value="">Selecciona</option>
                      <option value="ALCISTA">ALCISTA</option>
                      <option value="BAJISTA">BAJISTA</option>
                      <option value="LATERAL">LATERAL</option>
                      <option value="NO_SE">NO_SE</option>
                    </select>
                  </div>
                  <div>
                    <Label>Contexto mercado</Label>
                    <select value={contextoMercado} onChange={(e) => setContextoMercado(e.target.value)} className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                      <option value="">Selecciona</option>
                      <option value="TENDENCIA_ALCISTA">TENDENCIA_ALCISTA</option>
                      <option value="TENDENCIA_BAJISTA">TENDENCIA_BAJISTA</option>
                      <option value="RANGO">RANGO</option>
                      <option value="CONSOLIDACION">CONSOLIDACION</option>
                    </select>
                  </div>
                  <div>
                    <Label>Volatilidad</Label>
                    <select value={volatilidad} onChange={(e) => setVolatilidad(e.target.value)} className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                      <option value="">Selecciona</option>
                      <option value="BAJA">BAJA</option>
                      <option value="MEDIA">MEDIA</option>
                      <option value="ALTA">ALTA</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Tipo liquidez</Label>
                    <select value={tipoLiquidez} onChange={(e) => setTipoLiquidez(e.target.value)} className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                      <option value="">Selecciona</option>
                      <option value="SWEEP_HIGHS">SWEEP_HIGHS</option>
                      <option value="SWEEP_LOWS">SWEEP_LOWS</option>
                      <option value="INDUCEMENT">INDUCEMENT</option>
                      <option value="NINGUNA">NINGUNA</option>
                    </select>
                  </div>
                  <div>
                    <Label>Estado delta</Label>
                    <select value={estadoDelta} onChange={(e) => setEstadoDelta(e.target.value)} className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                      <option value="">Selecciona</option>
                      <option value="POSITIVO">POSITIVO</option>
                      <option value="NEGATIVO">NEGATIVO</option>
                      <option value="DIVERGENTE">DIVERGENTE</option>
                      <option value="NEUTRO">NEUTRO</option>
                    </select>
                  </div>
                  <div>
                    <Label>Volumen</Label>
                    <select value={volumenEstado} onChange={(e) => setVolumenEstado(e.target.value)} className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                      <option value="">Selecciona</option>
                      <option value="MUCHO_VOLUMEN">MUCHO_VOLUMEN</option>
                      <option value="POCO_VOLUMEN">POCO_VOLUMEN</option>
                      <option value="NORMAL">NORMAL</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Emoción entrada</Label>
                    <Input value={emocionEntrada} onChange={(e) => setEmocionEntrada(e.target.value)} placeholder="Calmado, ansioso..." />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input id="absorcion" type="checkbox" checked={absorcionDetectada} onChange={(e) => setAbsorcionDetectada(e.target.checked)} />
                    <Label htmlFor="absorcion">Absorción detectada</Label>
                  </div>
                </div>
              </div>
            )}

            {!canSubmitPostProtection && postStopLoss && (
              <div className="rounded-md border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
                Revisa coherencia de niveles con la dirección del trade antes de aplicar protección.
              </div>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5" />
              Si falla el envío de protección puedes reintentar o ejecutar cierre de emergencia en Binance.
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === "ticket" && (
            <Button variant="outline" onClick={() => setStage("gateway")} disabled={loading}>
              Volver
            </Button>
          )}

          {stage === "ticket" && (
            <Button onClick={handleOpenFastTicket} disabled={!canSubmitTicket || loading} className="bg-blue-600 hover:bg-blue-700">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {orderType === "MARKET" ? "Abrir MARKET ahora" : "Crear orden LIMIT"}
            </Button>
          )}

          {stage === "postProtection" && (
            <>
              <Button variant="outline" onClick={handleEmergencyClose} disabled={loading}>
                Cierre de emergencia
              </Button>
              <Button onClick={handleApplyPostProtection} disabled={!canSubmitPostProtection || loading} className="bg-emerald-600 hover:bg-emerald-700">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Aplicar protección ahora
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
