
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { MENTAL_STATES, MENTAL_STATE_LABELS } from "@/lib/trading/mental-states";

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
  fecha_apertura: string;
  fecha_cierre: string | null;
  broker?: string | null;
  sl_was_moved?: boolean | null;
  sl_move_direction?: string | null;
  sl_move_count?: number | null;
  rr_actual?: number | null;
  rr_max_possible?: number | null;
  session_mental_state?: string | null;
}

interface TradingStatsProps {
  trades: Trade[];
  rightAux?: React.ReactNode;
}

export function TradingStats({ trades, rightAux }: TradingStatsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"day" | "week" | "month" | "year" | "all">("all");

  const stats = useMemo(() => {
    if (!trades || trades.length === 0) {
      return {
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0,
        closedTradesCount: 0,
        wins: 0,
        losses: 0,
        avgWin: 0,
        avgLoss: 0,
        periodData: [],
        slRespectedPct: 0,
        slRespectedCount: 0,
        rrActualAvg: 0,
        mfeEfficiencyPct: 0,
        mentalStatePerformance: [] as Array<{ state: string; avgPnl: number; count: number; winRate: number; rrAvg: number }>,
        avgPnlSlRespected: 0,
        avgPnlSlMovedRiskUp: 0,
        slEvolutionData: [] as Array<{ date: string; moves: number; riskUp: number; rrAvg: number }>,
      };
    }

    // Filtrar trades por período
    const now = new Date();
    const filteredTrades = trades.filter((trade) => {
      // Usamos fecha_cierre si está disponible (trades cerrados), sino fecha_apertura
      const dateStr = trade.fecha_cierre || trade.fecha_apertura;
      if (!dateStr) return false;

      // Usar Hora Local para alinearse con la percepción del usuario
      const d = new Date(dateStr);
      const tradeDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      switch (selectedPeriod) {
        case "day":
          return tradeDate.getTime() === nowDate.getTime();
        case "week":
          const weekAgo = new Date(nowDate);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return tradeDate >= weekAgo;
        case "month":
          const monthAgo = new Date(nowDate);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return tradeDate >= monthAgo;
        case "year":
          const yearAgo = new Date(nowDate);
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          return tradeDate >= yearAgo;
        case "all":
        default:
          return true;
      }
    });

    const totalPnL = filteredTrades.reduce((sum, trade) => sum + Number(trade.pnl_realizado), 0);
    const wins = filteredTrades.filter((t) => Number(t.pnl_realizado) > 0);
    const losses = filteredTrades.filter((t) => Number(t.pnl_realizado) < 0);
    const winRate = filteredTrades.length > 0 ? (wins.length / filteredTrades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + Number(t.pnl_realizado), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + Number(t.pnl_realizado), 0) / losses.length : 0;
    const closedTrades = filteredTrades.filter((t) => t.estado !== "OPEN");

    // Agrupar PnL por día para el gráfico
    const pnlByDate: { [key: string]: number } = {};
    filteredTrades.forEach((trade) => {
      // Solo consideramos trades con PnL realizado (cerrados) para el gráfico de rendimiento
      if (!trade.fecha_cierre || trade.estado === "OPEN") return;

      const d = new Date(trade.fecha_cierre);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;
      pnlByDate[dateKey] = (pnlByDate[dateKey] || 0) + Number(trade.pnl_realizado);
    });

    const periodData = Object.entries(pnlByDate)
      .map(([dateKey, pnl]) => {
        const [y, m, d] = dateKey.split("-");
        return {
          date: `${d}/${m}/${y}`,
          rawDate: dateKey,
          pnl: Number(pnl.toFixed(2)),
          ganancia: pnl > 0 ? Number(pnl.toFixed(2)) : 0,
          perdida: pnl < 0 ? Number(pnl.toFixed(2)) : 0,
        };
      })
      .sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

    const slRespectedCount = closedTrades.filter((t) => String(t.sl_move_direction || "not_moved") !== "risk_increase").length;
    const slRespectedPct = closedTrades.length > 0 ? (slRespectedCount / closedTrades.length) * 100 : 0;

    const rrTrades = closedTrades.filter((t) => Number(t.rr_actual) > 0);
    const rrActualAvg = rrTrades.length > 0
      ? rrTrades.reduce((sum, t) => sum + Number(t.rr_actual), 0) / rrTrades.length
      : 0;

    const mfeEfficiencyTrades = closedTrades.filter((t) => Number(t.rr_actual) > 0 && Number(t.rr_max_possible) > 0);
    const mfeEfficiencyPct = mfeEfficiencyTrades.length > 0
      ? mfeEfficiencyTrades.reduce((sum, t) => {
          const rrActual = Number(t.rr_actual);
          const rrMax = Number(t.rr_max_possible);
          return sum + (rrActual / rrMax) * 100;
        }, 0) / mfeEfficiencyTrades.length
      : 0;

    const states = [...MENTAL_STATES];
    const mentalStatePerformance = states.map((state) => {
      const stateTrades = closedTrades.filter((t) => String(t.session_mental_state || "") === state);
      const avgPnl = stateTrades.length > 0
        ? stateTrades.reduce((sum, t) => sum + Number(t.pnl_realizado), 0) / stateTrades.length
        : 0;
      const winsCount = stateTrades.filter((t) => Number(t.pnl_realizado) > 0).length;
      const winRate = stateTrades.length > 0 ? (winsCount / stateTrades.length) * 100 : 0;
      const rrValues = stateTrades
        .map((t) => Number(t.rr_actual))
        .filter((rr) => Number.isFinite(rr) && rr > 0);
      const rrAvg = rrValues.length > 0 ? rrValues.reduce((sum, rr) => sum + rr, 0) / rrValues.length : 0;
      return { state, avgPnl, count: stateTrades.length, winRate, rrAvg };
    });

    const slRespectedTrades = closedTrades.filter((t) => String(t.sl_move_direction || "not_moved") !== "risk_increase");
    const slMovedRiskUpTrades = closedTrades.filter((t) => String(t.sl_move_direction || "") === "risk_increase");

    const avgPnlSlRespected = slRespectedTrades.length > 0
      ? slRespectedTrades.reduce((sum, t) => sum + Number(t.pnl_realizado), 0) / slRespectedTrades.length
      : 0;
    const avgPnlSlMovedRiskUp = slMovedRiskUpTrades.length > 0
      ? slMovedRiskUpTrades.reduce((sum, t) => sum + Number(t.pnl_realizado), 0) / slMovedRiskUpTrades.length
      : 0;

    const slByDate: Record<string, { moves: number; riskUp: number; rrValues: number[] }> = {};
    closedTrades.forEach((trade) => {
      const dateStr = trade.fecha_cierre || trade.fecha_apertura;
      if (!dateStr) return;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!slByDate[key]) slByDate[key] = { moves: 0, riskUp: 0, rrValues: [] };

      slByDate[key].moves += Number(trade.sl_move_count || 0);
      if (String(trade.sl_move_direction || "") === "risk_increase") {
        slByDate[key].riskUp += 1;
      }
      const rr = Number(trade.rr_actual);
      if (Number.isFinite(rr) && rr > 0) slByDate[key].rrValues.push(rr);
    });

    const slEvolutionData = Object.entries(slByDate)
      .map(([date, value]) => {
        const [y, m, d] = date.split("-");
        const rrAvg = value.rrValues.length
          ? value.rrValues.reduce((sum, v) => sum + v, 0) / value.rrValues.length
          : 0;
        return {
          date: `${d}/${m}`,
          moves: value.moves,
          riskUp: value.riskUp,
          rrAvg: Number(rrAvg.toFixed(2)),
        };
      })
      .sort((a, b) => {
        const [da, ma] = a.date.split("/").map(Number);
        const [db, mb] = b.date.split("/").map(Number);
        return ma === mb ? da - db : ma - mb;
      });

    return {
      totalPnL,
      winRate,
      totalTrades: filteredTrades.length,
      closedTradesCount: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      avgWin,
      avgLoss,
      periodData,
      slRespectedPct,
      slRespectedCount,
      rrActualAvg,
      mfeEfficiencyPct,
      mentalStatePerformance,
      avgPnlSlRespected,
      avgPnlSlMovedRiskUp,
      slEvolutionData,
    };
  }, [trades, selectedPeriod]);

  const stateLabel: Record<string, string> = MENTAL_STATE_LABELS as Record<string, string>;
  const mentalPnLScale = useMemo(() => {
    const values = stats.mentalStatePerformance.map((item) => Math.abs(item.avgPnl));
    if (values.length === 0) return 1;
    return Math.max(1, ...values);
  }, [stats.mentalStatePerformance]);

  return (
    <div className="space-y-6">
      {/* Tarjetas de Resumen Bento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bento-card p-6 border-t-[3px] border-t-zinc-700/50 group hover:border-t-zinc-500 hover:-translate-y-1 transition-all duration-300 relative flex flex-col justify-between min-h-[140px] hover:shadow-[0_8px_32px_-4px_rgba(255,255,255,0.05)]">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="flex flex-row items-center justify-between relative z-10 mb-6">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">PnL Total</span>
            <DollarSign className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="relative z-10">
            <div className={`text-4xl font-bold tracking-tight ${stats.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${stats.totalPnL.toFixed(2)}
            </div>
            <p className="text-sm font-medium text-zinc-500 mt-2">
              {stats.totalTrades} trades computados
            </p>
          </div>
        </div>

        <div className="bento-card p-6 border-t-[3px] border-t-zinc-700/50 group hover:border-t-zinc-500 hover:-translate-y-1 transition-all duration-300 relative flex flex-col justify-between min-h-[140px] hover:shadow-[0_8px_32px_-4px_rgba(255,255,255,0.05)]">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="flex flex-row items-center justify-between relative z-10 mb-6">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Tasa de Éxito</span>
            <Activity className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="relative z-10">
            <div className="text-4xl font-bold tracking-tight text-white">
              {stats.winRate.toFixed(1)}%
            </div>
            <p className="text-sm font-medium text-zinc-500 mt-2">
              {stats.wins} W / {stats.losses} L
            </p>
          </div>
        </div>

        <div className="bento-card p-6 border-t-[3px] border-t-zinc-700/50 group hover:border-t-zinc-500 hover:-translate-y-1 transition-all duration-300 relative flex flex-col justify-between min-h-[140px] hover:shadow-[0_8px_32px_-4px_rgba(34,197,94,0.15)]">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="flex flex-row items-center justify-between relative z-10 mb-6">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Promedio Ganador</span>
            <TrendingUp className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="relative z-10">
            <div className="text-4xl font-bold tracking-tight text-green-500">
              +${stats.avgWin.toFixed(2)}
            </div>
            <p className="text-sm font-medium text-zinc-500 mt-2">
              por trade positivo
            </p>
          </div>
        </div>

        <div className="bento-card p-6 border-t-[3px] border-t-zinc-700/50 group hover:border-t-zinc-500 hover:-translate-y-1 transition-all duration-300 relative flex flex-col justify-between min-h-[140px] hover:shadow-[0_8px_32px_-4px_rgba(239,68,68,0.15)]">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="flex flex-row items-center justify-between relative z-10 mb-6">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Promedio Perdedor</span>
            <TrendingDown className="h-4 w-4 text-zinc-600" />
          </div>
          <div className="relative z-10">
            <div className="text-4xl font-bold tracking-tight text-red-500">
              {stats.avgLoss.toFixed(2)}
            </div>
            <p className="text-sm font-medium text-zinc-500 mt-2">
              por trade negativo
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="bento-card p-6 xl:col-span-4 space-y-2">
          <h4 className="text-xs tracking-widest uppercase text-zinc-500">SL Respetados</h4>
          <div className="text-3xl font-bold text-zinc-100">{stats.slRespectedPct.toFixed(0)}%</div>
          <p className="text-sm text-zinc-500">
            {stats.slRespectedCount}/{stats.closedTradesCount} trades cerrados sin aumentar riesgo
          </p>
        </div>

        <div className="bento-card p-6 xl:col-span-4 space-y-2">
          <h4 className="text-xs tracking-widest uppercase text-zinc-500">R:R Efectivo Real</h4>
          <div className="text-3xl font-bold text-zinc-100">{stats.rrActualAvg.toFixed(2)}</div>
          <p className={`text-sm ${stats.rrActualAvg >= 1.5 ? "text-emerald-500" : "text-amber-500"}`}>
            Objetivo recomendado: ≥ 1.5
          </p>
        </div>

        <div className="bento-card p-6 xl:col-span-4 space-y-2">
          <h4 className="text-xs tracking-widest uppercase text-zinc-500">Eficiencia MFE</h4>
          <div className="text-3xl font-bold text-zinc-100">{stats.mfeEfficiencyPct.toFixed(0)}%</div>
          <p className="text-sm text-zinc-500">Cuánto recorrido potencial realmente capturas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bento-card p-6 space-y-2">
          <h4 className="text-xs tracking-widest uppercase text-zinc-500">Rendimiento Por Estado Mental</h4>
          <div className="space-y-2">
            {stats.mentalStatePerformance.map((item) => {
              const barPct = Math.min(100, Math.max(8, (Math.abs(item.avgPnl) / mentalPnLScale) * 100));
              const isPositive = item.avgPnl >= 0;
              return (
                <div key={item.state} className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-2.5">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-zinc-300">{stateLabel[item.state] || item.state}</span>
                    <span className={isPositive ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {isPositive ? "+" : ""}${item.avgPnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-1.5">
                    <div
                      className={`h-full rounded-full ${isPositive ? "bg-emerald-500" : "bg-red-500"}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{item.count} trades</span>
                    <span>Win {item.winRate.toFixed(0)}%</span>
                    <span>RR {item.rrAvg.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bento-card p-6 space-y-2">
          <h4 className="text-xs tracking-widest uppercase text-zinc-500">Impacto De Mover SL</h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">PnL promedio con SL respetado</span>
            <span className={stats.avgPnlSlRespected >= 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
              {stats.avgPnlSlRespected >= 0 ? "+" : ""}${stats.avgPnlSlRespected.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">PnL promedio con SL movido (riesgo ↑)</span>
            <span className={stats.avgPnlSlMovedRiskUp >= 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
              {stats.avgPnlSlMovedRiskUp >= 0 ? "+" : ""}${stats.avgPnlSlMovedRiskUp.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="bento-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs tracking-widest uppercase text-zinc-500">Evolución Global RR / Movimientos SL</h4>
          <span className="text-xs text-zinc-500">Por día</span>
        </div>

        {stats.slEvolutionData.length > 0 ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.slEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="moves" stroke="#06b6d4" strokeWidth={2} name="Movimientos SL" dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="riskUp" stroke="#ef4444" strokeWidth={2} name="SL riesgo ↑" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="rrAvg" stroke="#22c55e" strokeWidth={2} name="RR promedio" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No hay suficientes trades cerrados para construir evolución.</p>
        )}
      </div>

      {/* Area Inferior: Gráfico y Auxiliar (Calendario) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className={`bento-card p-6 flex flex-col w-full min-h-[400px] ${rightAux ? 'xl:col-span-8' : 'xl:col-span-12'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h3 className="text-sm font-bold tracking-wide text-zinc-100">RENDIMIENTO (PNL)</h3>
            </div>
            <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as any)} className="w-full sm:w-auto">
              <TabsList className="bg-zinc-900/50 border border-zinc-800/50 p-1 rounded-full h-auto flex">
                <TabsTrigger value="day" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Día</TabsTrigger>
                <TabsTrigger value="week" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Semana</TabsTrigger>
                <TabsTrigger value="month" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Mes</TabsTrigger>
                <TabsTrigger value="year" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Año</TabsTrigger>
                <TabsTrigger value="all" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Todo</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 w-full relative">
            {stats.periodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.periodData.map((d, i, arr) => ({
                  ...d,
                  acumulado: arr.slice(0, i + 1).reduce((sum, item) => sum + item.pnl, 0)
                }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAcumulado" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {/* No grid for ultra minimalist look */}
                  <Tooltip
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'PnL']}
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '4px', color: '#f4f4f5', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#06b6d4', fontWeight: 'bold' }}
                  />
                  {/* Glow effect duplicate line */}
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    stroke="#06b6d4"
                    strokeWidth={6}
                    fill="none"
                    style={{ filter: "blur(8px)", opacity: 0.5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorAcumulado)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-zinc-500 text-sm font-medium uppercase">
                No hay datos
              </div>
            )}
          </div>
        </div>

        {/* Renderizado Dinámico de Elemento Secundario a la derecha */}
        {rightAux && (
          <div className="xl:col-span-4 flex flex-col h-full min-h-[400px]">
            {rightAux}
          </div>
        )}
      </div>
    </div>
  );
}
