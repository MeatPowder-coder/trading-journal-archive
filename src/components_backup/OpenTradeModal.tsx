"use client";

import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

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
}

export function OpenTradeModal({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  initialValues,
  chatSessionId,
  showTrigger = true,
}: OpenTradeModalProps & { showTrigger?: boolean } = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (newOpen: boolean) => {
    if (isControlled && setControlledOpen) {
      setControlledOpen(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [leverage, setLeverage] = useState(20);
  const [margin, setMargin] = useState(50);
  const [step, setStep] = useState(1); // 1: Input, 2: Confirm

  // Sync initial values when modal opens
  useEffect(() => {
    if (open && initialValues) {
      if (initialValues.symbol) setSymbol(initialValues.symbol);
      if (initialValues.side) setSide(initialValues.side);
      if (initialValues.leverage) setLeverage(initialValues.leverage);
      if (initialValues.margin) setMargin(initialValues.margin);
    }
  }, [open, initialValues]);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/binance/open-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          side,
          leverage,
          margin,
          chatSessionId // Send session ID for linkage
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to open position");
      }

      alert(`Success! Opened ${side} on ${symbol} with ${data.details.qty} coins.`);
      setOpen(false);
      setStep(1);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const estimatedValue = margin * leverage;

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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Abrir Posición (Futures)" : "Confirmar Operación"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Configura los parámetros de tu operación con precisión."
              : "Revisa los detalles antes de enviar la orden a Binance."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="symbol" className="text-right">
                Símbolo
              </Label>
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="col-span-3"
                placeholder="ETHUSDT"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Dirección</Label>
              <div className="col-span-3 flex gap-2">
                <Button
                  type="button"
                  variant={side === "LONG" ? "default" : "outline"}
                  className={side === "LONG" ? "bg-green-600 hover:bg-green-700 w-full" : "w-full"}
                  onClick={() => setSide("LONG")}
                >
                  LONG
                </Button>
                <Button
                  type="button"
                  variant={side === "SHORT" ? "default" : "outline"}
                  className={side === "SHORT" ? "bg-red-600 hover:bg-red-700 w-full" : "w-full"}
                  onClick={() => setSide("SHORT")}
                >
                  SHORT
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="leverage" className="text-right">
                Leverage
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="leverage"
                  type="number"
                  min="1"
                  max="125"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                />
                <span className="text-sm text-zinc-500">x</span>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="margin" className="text-right">
                Margen (USDT)
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="margin"
                  type="number"
                  min="1"
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                />
                <span className="text-sm text-zinc-500">$</span>
              </div>
            </div>

            <div className="bg-zinc-100 p-3 rounded-md text-sm text-zinc-600 mt-2">
              <div className="flex justify-between">
                <span>Poder de Compra:</span>
                <span className="font-bold">${estimatedValue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div className={`p-4 rounded-lg border ${side === "LONG" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-lg">{symbol}</span>
                <span className={`font-bold ${side === "LONG" ? "text-green-700" : "text-red-700"}`}>{side}</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Apalancamiento:</span>
                  <b>{leverage}x</b>
                </div>
                <div className="flex justify-between">
                  <span>Tu Riesgo (Margen):</span>
                  <b>${margin.toFixed(2)}</b>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span>Tamaño Posición:</span>
                  <b>${estimatedValue.toFixed(2)}</b>
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-start text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>Al confirmar, se enviará una orden de mercado inmediata. Asegúrate de tener saldo suficiente en tu billetera de Futuros.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <Button onClick={() => setStep(2)}>Revisar</Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setStep(1)} disabled={loading} className="w-full">Atrás</Button>
              <Button onClick={handleOpen} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar y Abrir
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
