
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
            "aspect-square p-1.5 sm:p-2 flex flex-col justify-between cursor-pointer transition-all relative group",
            isSelected ? "ring-2 ring-blue-500 z-10 bg-zinc-900" : "hover:bg-zinc-800/50 bg-[#09090b]/40",
            data?.pnl > 0 && !isSelected && "bg-[rgba(6,182,212,0.05)] hover:bg-[rgba(6,182,212,0.1)]",
            data?.pnl < 0 && !isSelected && "bg-[rgba(239,68,68,0.05)] hover:bg-[rgba(239,68,68,0.1)]"
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
              <span className="text-[9px] text-zinc-400 font-medium">
                {data.count}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center justify-center flex-1">
            {data && (
              <span className={cn(
                "text-[10px] sm:text-xs font-bold tracking-tighter",
                data.pnl > 0 ? "text-[var(--profit)]" : "text-[var(--loss)]"
              )}>
                {data.pnl > 0 ? "+" : ""}{data.pnl.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      );
    }

    return days;
  };

  const StatCard = ({ title, value, subtext }: { title: string, value: number, subtext: string }) => (
    <div className="bento-inner-card p-5 group hover:bg-zinc-800/50 transition-colors relative flex flex-col justify-between">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-3 relative z-10">{title}</p>
      <div className={cn(
        "text-3xl font-bold tracking-tight flex items-center gap-2 relative z-10",
        value > 0 ? "text-green-500" : value < 0 ? "text-red-500" : "text-white"
      )}>
        {value !== 0 && (value > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />)}
        {value > 0 ? "+" : ""}{value.toFixed(2)}
      </div>
      <p className="text-sm font-medium text-zinc-500 mt-2 relative z-10">{subtext}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#09090b] rounded-[1rem] border border-white/5 overflow-hidden shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
      <div className="p-6 pb-2">
        <div className="flex flex-row items-center justify-between pb-4">
          <h3 className="text-sm font-bold tracking-wide text-zinc-100 uppercase flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-cyan-500" />
            HEATMAP PNL
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 hover:bg-zinc-800">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-xs tracking-widest uppercase min-w-[120px] text-center text-zinc-400">
              {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 hover:bg-zinc-800">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
            <div key={day} className="text-center text-[10px] tracking-widest font-bold text-zinc-600 uppercase py-2">
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* The Grid Heatmap */}
      <div className="flex-1 p-2 pt-0 w-full">
        <div className="grid grid-cols-7 bg-[#121214] gap-px rounded-lg overflow-hidden border border-white/[0.02] mb-4">
          {renderCalendarDays()}
        </div>
      </div>

      {/* Compact Footer for Resumen del Mes */}
      <div className="grid grid-cols-3 gap-2 px-6 py-4 mt-auto border-t border-white/5 bg-[#121214]">
        <div className="flex flex-col items-center text-center">
          <span className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase mb-1">Día Sel.</span>
          <span className={cn("text-xs sm:text-base font-bold", stats.dailyPnL > 0 ? "text-green-500" : stats.dailyPnL < 0 ? "text-red-500" : "text-zinc-100")}>
            {stats.dailyPnL > 0 ? "+" : ""}{stats.dailyPnL.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col items-center text-center border-x border-white/5">
          <span className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase mb-1">Semana</span>
          <span className={cn("text-xs sm:text-base font-bold", stats.weeklyPnL > 0 ? "text-green-500" : stats.weeklyPnL < 0 ? "text-red-500" : "text-zinc-100")}>
            {stats.weeklyPnL > 0 ? "+" : ""}{stats.weeklyPnL.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col items-center text-center">
          <span className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase mb-1">Mes</span>
          <span className={cn("text-xs sm:text-base font-bold", stats.monthlyPnL > 0 ? "text-green-500" : stats.monthlyPnL < 0 ? "text-red-500" : "text-zinc-100")}>
            {stats.monthlyPnL > 0 ? "+" : ""}{stats.monthlyPnL.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
