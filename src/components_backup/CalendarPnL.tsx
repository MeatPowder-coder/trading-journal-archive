"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Trade {
  id: number | string;
  fecha_cierre?: string | null;
  pnl_realizado?: number | null;
  pnl_bruto?: number | null;
  comision?: number | null;
  estado?: string;
  simbolo?: string;
}

interface CalendarPnLProps {
  trades: Trade[];
}

export function CalendarPnL({ trades }: CalendarPnLProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Helper to get days in month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  // Helper to get first day of month (0 = Sunday)
  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Group trades by date (YYYY-MM-DD)
  const tradesByDate = useMemo(() => {
    const groups: Record<string, { pnl: number; count: number }> = {};

    trades.forEach(trade => {
      if (trade.estado === "CLOSED") {
        if (trade.fecha_cierre && trade.pnl_realizado !== null && trade.pnl_realizado !== undefined) {
          const date = new Date(trade.fecha_cierre);
          // Usar Hora Local para alinear con la percepción del usuario
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const key = `${year}-${month}-${day}`;

          if (!groups[key]) {
            groups[key] = { pnl: 0, count: 0 };
          }
          groups[key].pnl += Number(trade.pnl_realizado);
          groups[key].count += 1;
        }
      }
    });

    return groups;
  }, [trades]);

  // Calculate Stats
  const stats = useMemo(() => {
    // Daily (Selected Date)
    let dailyPnL = 0;
    if (selectedDate) {
      const year = selectedDate.getFullYear(); // selectedDate is local from calendar click, but we treat it as the "day"
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      dailyPnL = tradesByDate[key]?.pnl || 0;
    }

    // Monthly (Current displayed month)
    let monthlyPnL = 0;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    Object.entries(tradesByDate).forEach(([key, data]) => {
      const [y, m] = key.split('-').map(Number);
      if (y === year && m === month + 1) {
        monthlyPnL += data.pnl;
      }
    });

    // Weekly (Week of selected date)
    let weeklyPnL = 0;
    if (selectedDate) {
      const current = new Date(selectedDate);
      const day = current.getDay(); // 0 (Sun) - 6 (Sat)

      // Get start of week (Sunday)
      const startOfWeek = new Date(current);
      startOfWeek.setDate(current.getDate() - day);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get end of week (Saturday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Sum trades in this range
      trades.forEach(trade => {
        if (trade.estado === "CLOSED" && trade.fecha_cierre && trade.pnl_realizado) {
          const tradeDate = new Date(trade.fecha_cierre);
          if (tradeDate >= startOfWeek && tradeDate <= endOfWeek) {
            weeklyPnL += Number(trade.pnl_realizado);
          }
        }
      });
    }

    return { dailyPnL, weeklyPnL, monthlyPnL };
  }, [trades, tradesByDate, selectedDate, currentDate]);

  // Generate Calendar Grid
  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before first day of month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-16 sm:h-24 bg-zinc-50/20 dark:bg-zinc-900/10" />);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${d}`;

      const data = tradesByDate[key];
      const isSelected = selectedDate?.toDateString() === date.toDateString();
      const isToday = new Date().toDateString() === date.toDateString();

      days.push(
        <div
          key={day}
          onClick={() => setSelectedDate(date)}
          className={cn(
            "h-16 sm:h-24 p-1 sm:p-2 flex flex-col justify-between cursor-pointer transition-all relative overflow-hidden group",
            isSelected ? "ring-1 ring-primary z-10 bg-zinc-50 dark:bg-zinc-900/80" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 bg-white dark:bg-zinc-950/40"
          )}
        >
          <div className="flex justify-between items-start">
            <span className={cn(
              "text-[10px] sm:text-sm font-medium h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center rounded-full",
              isToday ? "bg-black text-white dark:bg-white dark:text-black" : "text-zinc-500"
            )}>
              {day}
            </span>
            {data && (
              <span className="hidden sm:inline text-[10px] text-zinc-400 font-medium">
                {data.count} {data.count === 1 ? 'trade' : 'trades'}
              </span>
            )}
          </div>

          {data ? (
            <div className="text-right">
              <div className={cn(
                "font-bold text-xs sm:text-sm truncate",
                data.pnl > 0 ? "text-[var(--profit)]" : "text-[var(--loss)]"
              )}>
                {data.pnl > 0 ? "+" : ""}{data.pnl.toFixed(2)}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    return days;
  };

  const StatCard = ({ title, value, subtext }: { title: string, value: number, subtext: string }) => (
    <div className="relative overflow-hidden group bg-zinc-50 dark:bg-zinc-900/30 rounded-lg p-4 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-primary/30 transition-colors">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1 relative z-10">{title}</p>
      <div className={cn(
        "text-2xl font-bold flex items-center gap-2 relative z-10 tracking-tight",
        value > 0 ? "text-[var(--profit)]" : value < 0 ? "text-[var(--loss)]" : "text-zinc-500"
      )}>
        {value !== 0 && (value > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />)}
        {value > 0 ? "+" : ""}{value.toFixed(2)}
      </div>
      <p className="text-xs text-zinc-400 mt-1 relative z-10">{subtext}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-zinc-200/50 dark:border-zinc-800/50 shadow-sm bg-white/80 dark:bg-zinc-950/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Calendario PnL
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[120px] text-center">
                {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </span>
              <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 mb-2">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-zinc-500 py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 bg-zinc-200/50 dark:bg-zinc-800/30 gap-px border border-zinc-200/50 dark:border-zinc-800/50 rounded-lg overflow-hidden">
              {renderCalendarDays()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-zinc-200/50 dark:border-zinc-800/50 shadow-sm h-full bg-white/80 dark:bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="text-lg">Resumen de Rendimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatCard
              title="Día Seleccionado"
              value={stats.dailyPnL}
              subtext={selectedDate?.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) || 'Selecciona un día'}
            />
            <StatCard
              title="Esta Semana"
              value={stats.weeklyPnL}
              subtext="Semana actual del día seleccionado"
            />
            <StatCard
              title="Este Mes"
              value={stats.monthlyPnL}
              subtext={currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
