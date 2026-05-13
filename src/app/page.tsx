"use client";

import { DayTradingTable } from "@/components/DayTradingTable";
import { PortfolioList } from "@/components/PortfolioList";
import { TransactionList } from "@/components/TransactionList";
import { TradingStats } from "@/components/TradingStats";
import { CalendarPnL } from "@/components/CalendarPnL";
import { ActiveTrades } from "@/components/ActiveTrades";
import { AccountBalance } from "@/components/AccountBalance";
import { OpenTradeModal } from "@/components/OpenTradeModal";
import { AlertsSettingsPanel } from "@/components/AlertsSettingsPanel";
import { useRealTimePnL } from "@/hooks/useRealTimePnL";
import { useSubscription, gql } from "@apollo/client";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useSearchParams } from "next/navigation";

const TRADES_SUBSCRIPTION = gql`
  subscription GetTrades {
    trades_activos(order_by: {id: desc}) {
      id
      simbolo
      precio_entrada
      precio_salida
      pnl_realizado
      pnl_bruto
      comision
      estado
      direccion
      apalancamiento
      ticker_api
      broker
      fecha_apertura
      fecha_cierre
      monto_margin
      cuenta_id
      tipo_estrategia
      screenshot_url
      nombre_jugada
      setup_tag
      timeframe
      emocion_entrada
      zona_entrada
      tendencia_macro
      contexto_mercado
      volatilidad
      tipo_liquidez
      estado_delta
      volumen_estado
      absorcion_detectada
      calificacion_personal
      notas_aprendizaje
      notas_cierre
      stop_loss
      take_profit
      sl_original
      sl_was_moved
      sl_move_direction
      sl_move_count
      max_adverse_excursion
      max_favorable_excursion
      rr_estimated
      rr_actual
      rr_max_possible
      checklist_confirmed
      checklist_timestamp
      entry_tesis
      session_mental_state
      close_rating
      sl_move_reflection
      risk_amount_usdt
      risk_percent
      consecutive_losses_snapshot
      order_type
      entry_order_status
    }
  }
`;

function isLivePosition(trade: any) {
  if (trade?.estado !== 'OPEN') return false;
  const orderType = String(trade?.order_type || 'MARKET').toUpperCase();
  const entryStatus = String(trade?.entry_order_status || 'FILLED').toUpperCase();
  if (orderType !== 'LIMIT') return true;
  return entryStatus === 'FILLED' || entryStatus === 'PARTIALLY_FILLED';
}

export default function Home() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "trading";

  const { data, loading, error } = useSubscription(TRADES_SUBSCRIPTION);
  const trades = data?.trades_activos || [];
  const { calculateRealTimePnL, prices, tradeExtremes } = useRealTimePnL(trades, ['USDCOP=X']);

  // Crear una versión de los trades con el PnL actualizado para las estadísticas (solo visual)
  const tradesWithRealTimePnL = trades.map((trade: any) => {
    if (isLivePosition(trade)) {
      return {
        ...trade,
        pnl_realizado: calculateRealTimePnL(trade)
      };
    }
    return trade;
  });

  return (
    <div className="min-h-screen bg-transparent overflow-x-hidden pt-12 md:pt-0">
      {/* Header removed - moved to Sidebar */}

      <main className="w-full xl:max-w-[1600px] mx-auto px-4 py-4 md:px-6 md:py-8 lg:px-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
            <p className="text-zinc-500 dark:text-zinc-400">Monitor your active positions and performance.</p>
          </div>
          <div className="hidden sm:block">
            <OpenTradeModal />
          </div>
        </div>

        <Tabs value={activeTab} className="space-y-6">
          {/* TabsList removed - Navigation handled by Sidebar */}

          <TabsContent value="trading" className="space-y-6">
            {/* Top Row: Active Trades takes full width if exists, else hidden */}
            <div className="w-full">
              <ActiveTrades
                trades={trades}
                prices={prices}
                calculateRealTimePnL={calculateRealTimePnL}
                tradeExtremes={tradeExtremes}
              />
            </div>

            {/* The Bento Grid Core */}
            <TradingStats
              trades={tradesWithRealTimePnL.filter((t: any) => t.tipo_estrategia === 'TRADING' || !t.tipo_estrategia || t.tipo_estrategia === 'null')}
              rightAux={<CalendarPnL trades={trades} />}
            />

            {/* Bottom Section - Full Width Table */}
            <div className="mt-6">
              <DayTradingTable
                trades={trades.filter((t: any) => t.tipo_estrategia === 'TRADING' || !t.tipo_estrategia || t.tipo_estrategia === 'null')}
                loading={loading}
                error={error}
                prices={prices}
                calculateRealTimePnL={calculateRealTimePnL}
                tradeExtremes={tradeExtremes}
              />
            </div>

          </TabsContent>

          <TabsContent value="alertas" className="space-y-6">
            <AlertsSettingsPanel />
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-4">
            <PortfolioList
              trades={trades}
              loading={loading}
              prices={prices}
            />
          </TabsContent>

          <TabsContent value="cuentas" className="space-y-4">
            <AccountBalance
              trades={trades}
              prices={prices}
              calculateRealTimePnL={calculateRealTimePnL}
            />
          </TabsContent>

          <TabsContent value="transacciones" className="space-y-4">
            <TransactionList />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
