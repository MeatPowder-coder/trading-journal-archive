"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";

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
}

interface TradingStatsProps {
  trades: Trade[];
}

export function TradingStats({ trades }: TradingStatsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"day" | "week" | "month" | "year" | "all">("all");

  const stats = useMemo(() => {
    if (!trades || trades.length === 0) {
      return {
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        avgWin: 0,
        avgLoss: 0,
        periodData: [],
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

    return {
      totalPnL,
      winRate,
      totalTrades: filteredTrades.length,
      wins: wins.length,
      losses: losses.length,
      avgWin,
      avgLoss,
      periodData,
    };
  }, [trades, selectedPeriod]);

  return (
    <div className="space-y-6">
      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden group border-zinc-200/50 dark:border-zinc-800/50 hover:border-blue-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">PnL Total</CardTitle>
            <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className={`text-2xl font-bold tracking-tight ${stats.totalPnL >= 0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}`}>
              ${stats.totalPnL.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalTrades} trades en total
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden group border-zinc-200/50 dark:border-zinc-800/50 hover:border-purple-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Tasa de Éxito</CardTitle>
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold tracking-tight">{stats.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.wins} ganados / {stats.losses} perdidos
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden group border-zinc-200/50 dark:border-zinc-800/50 hover:border-green-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Ganancia Promedio</CardTitle>
            <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold tracking-tight text-green-600 dark:text-green-500">
              ${stats.avgWin.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Por trade ganador
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden group border-zinc-200/50 dark:border-zinc-800/50 hover:border-red-500/30 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium">Pérdida Promedio</CardTitle>
            <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-500">
              ${stats.avgLoss.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Por trade perdedor
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Rendimiento por Período</CardTitle>
              <CardDescription>Ganancias y pérdidas a lo largo del tiempo</CardDescription>
            </div>
            <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as any)} className="w-full sm:w-auto">
              <TabsList className="w-full grid grid-cols-5 h-auto sm:w-auto sm:inline-flex sm:h-9">
                <TabsTrigger value="day" className="px-0 sm:px-3">Día</TabsTrigger>
                <TabsTrigger value="week" className="px-0 sm:px-3">Semana</TabsTrigger>
                <TabsTrigger value="month" className="px-0 sm:px-3">Mes</TabsTrigger>
                <TabsTrigger value="year" className="px-0 sm:px-3">Año</TabsTrigger>
                <TabsTrigger value="all" className="px-0 sm:px-3">Todo</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {stats.periodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.periodData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  formatter={(value: any) => `$${Number(value).toFixed(2)}`}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: 'inherit' }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="ganancia" fill="var(--profit)" name="Ganancias" radius={[4, 4, 0, 0]} />
                <Bar dataKey="perdida" fill="var(--loss)" name="Pérdidas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-zinc-500">
              No hay datos para el período seleccionado
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfico de Línea - PnL Acumulado */}
      <Card>
        <CardHeader>
          <CardTitle>PnL Acumulado</CardTitle>
          <CardDescription>Evolución de las ganancias/pérdidas totales</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.periodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.periodData.map((d, i, arr) => ({
                ...d,
                acumulado: arr.slice(0, i + 1).reduce((sum, item) => sum + item.pnl, 0)
              }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAcumulado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  formatter={(value: any) => `$${Number(value).toFixed(2)}`}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: 'inherit' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Area
                  type="monotone"
                  dataKey="acumulado"
                  stroke="#06b6d4"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAcumulado)"
                  name="PnL Acumulado"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-zinc-500">
              No hay datos para el período seleccionado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
