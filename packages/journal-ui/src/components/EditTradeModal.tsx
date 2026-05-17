
import { useState, useEffect } from "react";
import { useMutation, gql } from "@apollo/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const UPDATE_TRADE_MUTATION = gql`
  mutation UpdateTrade(
    $id: Int!
    $simbolo: String
    $ticker_api: String
    $direccion: String
    $precio_entrada: numeric
    $precio_salida: numeric
    $apalancamiento: numeric
    $monto_margin: numeric
    $estado: String
    $notas_aprendizaje: String
    $notas_cierre: String
    $fecha_apertura: timestamptz
    $fecha_cierre: timestamptz
    $comision: numeric
    $stop_loss: numeric
    $take_profit: numeric
    $setup_tag: String
    $timeframe: String
    $emocion_entrada: String
  ) {
    update_trades_activos_by_pk(
      pk_columns: { id: $id }
      _set: {
        simbolo: $simbolo
        ticker_api: $ticker_api
        direccion: $direccion
        precio_entrada: $precio_entrada
        precio_salida: $precio_salida
        apalancamiento: $apalancamiento
        monto_margin: $monto_margin
        estado: $estado
        notas_aprendizaje: $notas_aprendizaje
        notas_cierre: $notas_cierre
        fecha_apertura: $fecha_apertura
        fecha_cierre: $fecha_cierre
        comision: $comision
        stop_loss: $stop_loss
        take_profit: $take_profit
        setup_tag: $setup_tag
        timeframe: $timeframe
        emocion_entrada: $emocion_entrada
      }
    ) {
      id
    }
  }
`;

interface Trade {
  id: number | string;
  simbolo: string;
  ticker_api: string;
  direccion: string;
  precio_entrada: number;
  precio_salida: number | null;
  apalancamiento: number;
  monto_margin: number;
  estado: string;
  pnl_realizado: number;
  pnl_bruto: number;
  comision: number;
  notas_aprendizaje?: string;
  notas_cierre?: string;
  fecha_apertura?: string;
  fecha_cierre?: string | null;
  broker?: string | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  setup_tag?: string | null;
  timeframe?: string | null;
  emocion_entrada?: string | null;
}

interface EditTradeModalProps {
  trade: Trade;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (dateString?: string | null) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const pad = (n: number) => n < 10 ? `0${n}` : n;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function EditTradeModal({ trade, open, onOpenChange }: EditTradeModalProps) {
  const [formData, setFormData] = useState({
    simbolo: trade.simbolo || "",
    ticker_api: trade.ticker_api || "",
    direccion: trade.direccion || "LONG",
    precio_entrada: trade.precio_entrada?.toString() || "",
    precio_salida: trade.precio_salida?.toString() || "",
    apalancamiento: trade.apalancamiento?.toString() || "1",
    monto_margin: trade.monto_margin?.toString() || "",
    estado: trade.estado || "OPEN",
    pnl_realizado: trade.pnl_realizado?.toString() || "0",
    notas_aprendizaje: trade.notas_aprendizaje || "",
    notas_cierre: trade.notas_cierre || "",
    fecha_apertura: formatDate(trade.fecha_apertura),
    fecha_cierre: formatDate(trade.fecha_cierre),
    comision: trade.comision?.toString() || "0",
    stop_loss: trade.stop_loss?.toString() || "",
    take_profit: trade.take_profit?.toString() || "",
    setup_tag: trade.setup_tag || "",
    timeframe: trade.timeframe || "",
    emocion_entrada: trade.emocion_entrada || "",
  });

  // Actualizar formData cuando cambie el trade seleccionado
  useEffect(() => {
    setFormData({
      simbolo: trade.simbolo || "",
      ticker_api: trade.ticker_api || "",
      direccion: trade.direccion || "LONG",
      precio_entrada: trade.precio_entrada?.toString() || "",
      precio_salida: trade.precio_salida?.toString() || "",
      apalancamiento: trade.apalancamiento?.toString() || "1",
      monto_margin: trade.monto_margin?.toString() || "",
      estado: trade.estado || "OPEN",
      pnl_realizado: trade.pnl_realizado?.toString() || "0",
      notas_aprendizaje: trade.notas_aprendizaje || "",
      notas_cierre: trade.notas_cierre || "",
      fecha_apertura: formatDate(trade.fecha_apertura),
      fecha_cierre: formatDate(trade.fecha_cierre),
      comision: trade.comision?.toString() || "0",
      stop_loss: trade.stop_loss?.toString() || "",
      take_profit: trade.take_profit?.toString() || "",
      setup_tag: trade.setup_tag || "",
      timeframe: trade.timeframe || "",
      emocion_entrada: trade.emocion_entrada || "",
    });
  }, [trade]);

  const [updateTrade, { loading }] = useMutation(UPDATE_TRADE_MUTATION, {
    onCompleted: () => {
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error updating trade:", error);
      alert("Error al actualizar el trade: " + error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const variables = {
      id: Number(trade.id),
      simbolo: formData.simbolo,
      ticker_api: formData.ticker_api,
      direccion: formData.direccion,
      precio_entrada: parseFloat(formData.precio_entrada),
      precio_salida: formData.precio_salida ? parseFloat(formData.precio_salida) : null,
      apalancamiento: parseFloat(formData.apalancamiento),
      monto_margin: parseFloat(formData.monto_margin),
      estado: formData.estado,
      notas_aprendizaje: formData.notas_aprendizaje,
      notas_cierre: formData.notas_cierre,
      fecha_apertura: formData.fecha_apertura ? new Date(formData.fecha_apertura).toISOString() : null,
      fecha_cierre: formData.fecha_cierre ? new Date(formData.fecha_cierre).toISOString() : null,
      comision: parseFloat(formData.comision || "0"),
      stop_loss: formData.stop_loss ? parseFloat(formData.stop_loss) : null,
      take_profit: formData.take_profit ? parseFloat(formData.take_profit) : null,
      setup_tag: formData.setup_tag || null,
      timeframe: formData.timeframe || null,
      emocion_entrada: formData.emocion_entrada || null,
    };

    await updateTrade({ variables });
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Trade #{trade.id}</DialogTitle>
          <DialogDescription>
            Modifica los campos del trade. Haz clic en guardar cuando termines.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="simbolo">Símbolo</Label>
                <Input
                  id="simbolo"
                  value={formData.simbolo}
                  onChange={(e) => handleChange("simbolo", e.target.value)}
                  placeholder="BTC/USDT"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticker_api">Ticker API (Yahoo Finance)</Label>
                <Input
                  id="ticker_api"
                  value={formData.ticker_api}
                  onChange={(e) => handleChange("ticker_api", e.target.value)}
                  placeholder="BTC-USD"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Select
                  value={formData.direccion}
                  onValueChange={(value) => handleChange("direccion", value)}
                >
                  <SelectTrigger id="direccion">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG">LONG</SelectItem>
                    <SelectItem value="SHORT">SHORT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => handleChange("estado", value)}
                >
                  <SelectTrigger id="estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">OPEN</SelectItem>
                    <SelectItem value="CLOSED">CLOSED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stop_loss">Stop Loss</Label>
                <Input
                  id="stop_loss"
                  value={formData.stop_loss}
                  onChange={(e) => handleChange("stop_loss", e.target.value)}
                  placeholder="Precio SL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="take_profit">Take Profit</Label>
                <Input
                  id="take_profit"
                  value={formData.take_profit}
                  onChange={(e) => handleChange("take_profit", e.target.value)}
                  placeholder="Precio TP"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="setup_tag">Setup</Label>
                <Input
                  id="setup_tag"
                  value={formData.setup_tag}
                  onChange={(e) => handleChange("setup_tag", e.target.value)}
                  placeholder="Breakout, Reversal..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeframe">Timeframe</Label>
                <Input
                  id="timeframe"
                  value={formData.timeframe}
                  onChange={(e) => handleChange("timeframe", e.target.value)}
                  placeholder="5m, 15m, 1h"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emocion_entrada">Emoción</Label>
                <Input
                  id="emocion_entrada"
                  value={formData.emocion_entrada}
                  onChange={(e) => handleChange("emocion_entrada", e.target.value)}
                  placeholder="Calmado, Ansioso..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precio_entrada">Precio Entrada</Label>
                <Input
                  id="precio_entrada"
                  type="number"
                  step="0.00000001"
                  value={formData.precio_entrada}
                  onChange={(e) => handleChange("precio_entrada", e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="precio_salida">Precio Salida (opcional)</Label>
                <Input
                  id="precio_salida"
                  type="number"
                  step="0.00000001"
                  value={formData.precio_salida}
                  onChange={(e) => handleChange("precio_salida", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="apalancamiento">Apalancamiento</Label>
                <Input
                  id="apalancamiento"
                  type="number"
                  min="1"
                  max="125"
                  value={formData.apalancamiento}
                  onChange={(e) => handleChange("apalancamiento", e.target.value)}
                  placeholder="1"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monto_margin">Monto Margin</Label>
                <Input
                  id="monto_margin"
                  type="number"
                  step="0.01"
                  value={formData.monto_margin}
                  onChange={(e) => handleChange("monto_margin", e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha_apertura">Fecha Apertura</Label>
                <Input
                  id="fecha_apertura"
                  type="datetime-local"
                  value={formData.fecha_apertura}
                  onChange={(e) => handleChange("fecha_apertura", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fecha_cierre">Fecha Cierre</Label>
                <Input
                  id="fecha_cierre"
                  type="datetime-local"
                  value={formData.fecha_cierre}
                  onChange={(e) => handleChange("fecha_cierre", e.target.value)}
                />
              </div>
            </div>

            {/* Commission & PnL Breakdown */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Resultado Económico</h4>
              <div className="grid grid-cols-2 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="comision">Comisión (USDT)</Label>
                  <Input
                    id="comision"
                    type="number"
                    step="0.01"
                    value={formData.comision}
                    onChange={(e) => handleChange("comision", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="text-right space-y-1 pb-2">
                  <div className="text-xs text-zinc-500">PnL Bruto: ${Number(trade.pnl_bruto || 0).toFixed(2)}</div>
                  <div className="text-xs text-zinc-500">- Comisión: ${Number(formData.comision || 0).toFixed(2)}</div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 border-t pt-1">
                    PnL Neto: ${Number(trade.pnl_realizado || 0).toFixed(2)}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400 italic">
                * El PnL Neto se recalcula automáticamente en la base de datos al guardar la comisión.
              </p>
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <Label htmlFor="notas_aprendizaje">Tesis / Notas de Aprendizaje</Label>
              <textarea
                id="notas_aprendizaje"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.notas_aprendizaje}
                onChange={(e) => handleChange("notas_aprendizaje", e.target.value)}
                placeholder="Escribe aquí tus observaciones..."
              />
            </div>

             <div className="space-y-2">
              <Label htmlFor="notas_cierre">Notas de Cierre</Label>
              <textarea
                id="notas_cierre"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.notas_cierre}
                onChange={(e) => handleChange("notas_cierre", e.target.value)}
                placeholder="Conclusiones al cerrar el trade..."
              />
            </div>

          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
