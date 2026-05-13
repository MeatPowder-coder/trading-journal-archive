"use client";

import { useState } from "react";
import { useMutation, gql } from "@apollo/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Activity, 
  BarChart2, 
  ShieldAlert, 
  ShieldCheck,
  Calendar,
  DollarSign,
  RefreshCw,
  X,
  Maximize2,
  Pencil,
  Save,
  Loader2
} from "lucide-react";
import { 
    getMarketContextConfig, 
    getLiquidityConfig, 
    getVolumeConfig, 
    getDeltaConfig, 
    getPsychologyConfig, 
    getAbsorptionConfig, 
    getVolatilityConfig, 
    ConfigResult
} from "@/utils/tradingMappings";

const UPDATE_TRADE_NOTES_MUTATION = gql`
  mutation UpdateTradeNotes($id: Int!, $notas_aprendizaje: String, $notas_cierre: String) {
    update_trades_activos_by_pk(
      pk_columns: { id: $id }
      _set: {
        notas_aprendizaje: $notas_aprendizaje
        notas_cierre: $notas_cierre
      }
    ) {
      id
      notas_aprendizaje
      notas_cierre
    }
  }
`;

interface Trade {
  id: number | string;
  simbolo: string;
  direccion: string;
  precio_entrada: number;
  precio_salida: number | null;
  pnl_realizado: number;
  pnl_bruto: number;
  comision: number;
  estado: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_margin: number;
  broker?: string | null;
  apalancamiento: number;
  ticker_api?: string; 
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

interface TradeDetailModalProps {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calculateRealTimePnL?: (trade: any) => number;
}

const InterviewItem = ({ label, config }: { label: string, config: ConfigResult }) => (
    <div className="space-y-1">
        <label className="text-xs text-zinc-500">{label}</label>
        <div className={`font-medium text-sm flex items-center gap-2 ${config.color} ${config.bg ? `px-2 py-1 rounded-md w-fit border ${config.bg}` : ''}`}>
            {config.icon}
            <span>{config.label}</span>
        </div>
    </div>
);

export function TradeDetailModal({ trade, open, onOpenChange, calculateRealTimePnL }: TradeDetailModalProps) {
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesForm, setNotesForm] = useState({
      notas_aprendizaje: "",
      notas_cierre: ""
  });

  const [updateNotes, { loading: savingNotes }] = useMutation(UPDATE_TRADE_NOTES_MUTATION, {
      onCompleted: () => {
          setIsEditingNotes(false);
      },
      onError: (error) => {
          alert("Error al guardar notas: " + error.message);
      }
  });

  if (!trade) return null;

  const isOpen = trade.estado === "OPEN";
  const realTimePnL = isOpen && calculateRealTimePnL ? calculateRealTimePnL(trade) : 0;
  
  const isWin = !isOpen ? trade.pnl_realizado > 0 : realTimePnL > 0;
  const isLoss = !isOpen ? trade.pnl_realizado < 0 : realTimePnL < 0;

  // Get Mappings
  const marketContext = getMarketContextConfig(trade.contexto_mercado || null);
  const volatility = getVolatilityConfig(trade.volatilidad || null);
  const liquidity = getLiquidityConfig(trade.tipo_liquidez || null);
  const delta = getDeltaConfig(trade.estado_delta || null);
  const volume = getVolumeConfig(trade.volumen_estado || null);
  const absorption = getAbsorptionConfig(trade.absorcion_detectada || null);
  const psychology = getPsychologyConfig(trade.calificacion_personal || null);

  const startEditing = () => {
      setNotesForm({
          notas_aprendizaje: trade.notas_aprendizaje || "",
          notas_cierre: trade.notas_cierre || ""
      });
      setIsEditingNotes(true);
  };

  const saveNotes = async () => {
      await updateNotes({
          variables: {
              id: trade.id,
              notas_aprendizaje: notesForm.notas_aprendizaje,
              notas_cierre: notesForm.notas_cierre
          }
      });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => {
          if (!val) setIsEditingNotes(false);
          onOpenChange(val);
      }}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="p-4 sm:p-6 pb-4 border-b bg-white dark:bg-zinc-900 sticky top-0 z-10 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
              <div className="flex items-center gap-4">
                  <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                      <span className="text-zinc-400 font-mono text-lg">#{trade.id}</span>
                      {trade.simbolo}
                      <Badge 
                          variant={trade.direccion === 'LONG' ? 'default' : 'destructive'} 
                          className={trade.direccion === 'LONG' ? 'bg-green-600' : 'bg-red-600'}
                      >
                          {trade.direccion}
                      </Badge>
                  </DialogTitle>
                  <div className="text-sm text-zinc-500 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span className="hidden sm:inline">{new Date(trade.fecha_apertura).toLocaleDateString()}</span>
                      <span className="sm:hidden">{new Date(trade.fecha_apertura).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}</span>
                  </div>
              </div>
              
              <div className="flex items-center gap-3">
                  {trade.nombre_jugada && (
                      <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                          {trade.nombre_jugada}
                      </Badge>
                  )}
                  {isOpen ? (
                      <Badge variant="secondary" className="animate-pulse bg-blue-100 text-blue-800">OPEN</Badge>
                  ) : (
                      <Badge variant="outline" className={isWin ? "text-green-600 border-green-200 bg-green-50" : isLoss ? "text-red-600 border-red-200 bg-red-50" : ""}>
                          {isWin ? "WIN" : isLoss ? "LOSS" : "BREAK EVEN"}
                      </Badge>
                  )}
              </div>
            </div>
            <DialogDescription className="hidden">Trade details</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                  {/* Left Column: Image & Notes */}
                  <div className="p-4 sm:p-6 space-y-6 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 order-2 md:order-1">
                      {/* Screenshot */}
                      <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 aspect-video relative group">
                          {trade.screenshot_url ? (
                              <>
                                <img 
                                    src={trade.screenshot_url} 
                                    alt="Trade Screenshot" 
                                    className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                                    onClick={() => setIsImageOpen(true)}
                                />
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => setIsImageOpen(true)}
                                        className="bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full"
                                    >
                                        <Maximize2 className="h-4 w-4" />
                                    </button>
                                </div>
                              </>
                          ) : (
                              <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                                  <Activity className="h-12 w-12 mb-2 opacity-20" />
                                  <p className="text-sm">No screenshot available</p>
                              </div>
                          )}
                      </div>

                      {/* Learning Notes */}
                      <div className="space-y-3">
                          <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                  <ShieldCheck className="h-4 w-4 text-purple-500" />
                                  Tesis / Notas de Aprendizaje
                              </h3>
                              {!isEditingNotes ? (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={startEditing}>
                                      <Pencil className="h-3 w-3 text-zinc-400 hover:text-zinc-600" />
                                  </Button>
                              ) : (
                                  <div className="flex gap-2">
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setIsEditingNotes(false)} disabled={savingNotes}>
                                          <X className="h-3 w-3 text-red-500" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveNotes} disabled={savingNotes}>
                                          {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 text-green-500" />}
                                      </Button>
                                  </div>
                              )}
                          </div>
                          
                          {isEditingNotes ? (
                              <textarea
                                  className="w-full min-h-[100px] p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  value={notesForm.notas_aprendizaje}
                                  onChange={(e) => setNotesForm({...notesForm, notas_aprendizaje: e.target.value})}
                                  placeholder="Escribe tus notas de aprendizaje..."
                              />
                          ) : (
                              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                                  {trade.notas_aprendizaje || "No hay notas registradas para este trade."}
                              </div>
                          )}
                      </div>

                      {/* Closing Notes */}
                      <div className="space-y-3">
                          <div className="flex items-center justify-between">
                               <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                  <Target className="h-4 w-4 text-orange-500" />
                                  Notas de Cierre
                              </h3>
                              {!isEditingNotes && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={startEditing}>
                                      <Pencil className="h-3 w-3 text-zinc-400 hover:text-zinc-600" />
                                  </Button>
                              )}
                          </div>
                          
                          {isEditingNotes ? (
                              <textarea
                                  className="w-full min-h-[100px] p-3 rounded-lg border border-orange-200 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-950/10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                  value={notesForm.notas_cierre}
                                  onChange={(e) => setNotesForm({...notesForm, notas_cierre: e.target.value})}
                                  placeholder="Escribe tus notas de cierre..."
                              />
                          ) : (
                              <div className="bg-orange-50 dark:bg-orange-950/10 p-4 rounded-lg border border-orange-100 dark:border-orange-900/20 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                                  {trade.notas_cierre || "Sin comentarios de cierre."}
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Right Column: The Interview (Stats) */}
                  <div className="p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-950 space-y-8 order-1 md:order-2">
                      
                      {/* Financial Result Section */}
                      <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                                      {isOpen ? "PnL No Realizado (Live)" : "Resultado PnL"}
                                  </p>
                                <div className={`text-3xl font-bold flex items-center gap-1 ${isOpen ? (realTimePnL > 0 ? 'text-green-600' : realTimePnL < 0 ? 'text-red-600' : 'text-zinc-500') : (isWin ? 'text-green-600' : isLoss ? 'text-red-600' : 'text-zinc-700')}`}>
                                    {isOpen ? (
                                        <>
                                            {realTimePnL > 0 ? <TrendingUp className="h-6 w-6" /> : realTimePnL < 0 ? <TrendingDown className="h-6 w-6" /> : <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />}
                                            {realTimePnL > 0 ? "+" : ""}${realTimePnL.toFixed(2)}
                                        </>
                                    ) : (
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                {isWin ? <TrendingUp className="h-6 w-6" /> : isLoss ? <TrendingDown className="h-6 w-6" /> : null}
                                                {isWin ? "+" : ""}${Number(trade.pnl_realizado).toFixed(2)}
                                            </div>
                                            <div className="text-[10px] text-zinc-400 font-normal mt-1">
                                                Bruto: ${Number(trade.pnl_bruto || 0).toFixed(2)} | Com: ${Number(trade.comision || 0).toFixed(2)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Riesgo / Margin</p>
                                  <div className="text-xl font-semibold text-zinc-700 dark:text-zinc-300">
                                      ${Number(trade.monto_margin).toFixed(2)}
                                  </div>
                                  <div className="text-xs text-zinc-400 mt-1">Lev: {trade.apalancamiento}x</div>
                              </div>
                          </div>
                      </div>

                      {/* The Interview Grid */}
                      <div>
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4 border-b pb-2">
                              La Entrevista (Contexto)
                          </h3>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                              
                              <InterviewItem label="Contexto Mercado" config={marketContext} />
                              <InterviewItem label="Volatilidad" config={volatility} />
                              <InterviewItem label="Tipo Liquidez" config={liquidity} />
                              <InterviewItem label="Estado Delta" config={delta} />
                              <InterviewItem label="Volumen" config={volume} />
                              <InterviewItem label="Absorción" config={absorption} />

                              <div className="col-span-2 mt-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                  <label className="text-xs text-zinc-500 block mb-2">Evaluación Psicológica</label>
                                  <div className={`flex items-center gap-2 p-2 rounded-md border w-fit ${psychology.badgeColor} ${psychology.bg ? `border ${psychology.bg}` : ''}`}>
                                      {psychology.icon}
                                      <span className="font-bold text-sm">{psychology.label}</span>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Technical Details */}
                      <div>
                           <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4 border-b pb-2">
                              Datos Técnicos
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="flex justify-between">
                                  <span className="text-zinc-500">Entrada:</span>
                                  <span className="font-mono">${Number(trade.precio_entrada).toFixed(4)}</span>
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-zinc-500">Salida:</span>
                                  <span className="font-mono">{trade.precio_salida ? `$${Number(trade.precio_salida).toFixed(4)}` : '---'}</span>
                              </div>
                              <div className="flex justify-between col-span-2">
                                  <span className="text-zinc-500">Zona:</span>
                                  <span className="font-medium">{trade.zona_entrada || "---"}</span>
                              </div>
                          </div>
                      </div>

                  </div>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isImageOpen} onOpenChange={setIsImageOpen}>
        <DialogContent className="max-w-[98vw] h-[95vh] p-0 bg-transparent border-none shadow-none flex flex-col items-center justify-center z-[200]">
            <div className="relative w-full h-full flex items-center justify-center">
                <Button 
                    className="absolute top-2 right-2 rounded-full h-10 w-10 bg-black/50 hover:bg-black/80 text-white border-none z-50"
                    size="icon"
                    onClick={() => setIsImageOpen(false)}
                >
                    <X className="h-6 w-6" />
                </Button>
                {trade.screenshot_url && (
                    <img 
                        src={trade.screenshot_url} 
                        alt="Full View" 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    />
                )}
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
