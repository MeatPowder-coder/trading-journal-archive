
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Star } from "lucide-react";
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

interface Trade {
  id: number | string;
  simbolo: string;
  direccion: string;
  sl_was_moved?: boolean | null;
}

interface TradeExtremes {
  mae?: number;
  mfe?: number;
}

interface CloseTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: Trade | null;
  currentPrice?: number | null;
  liveExtremes?: TradeExtremes | null;
  onClosed?: () => void;
}

export function CloseTradeModal({
  open,
  onOpenChange,
  trade,
  currentPrice,
  liveExtremes,
  onClosed,
}: CloseTradeModalProps) {
  const [exitPrice, setExitPrice] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [learningNotes, setLearningNotes] = useState("");
  const [closeRating, setCloseRating] = useState<number>(0);
  const [slMoveReflection, setSlMoveReflection] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setExitPrice(currentPrice && Number.isFinite(currentPrice) ? String(currentPrice) : "");
    setCloseNotes("");
    setLearningNotes("");
    setCloseRating(0);
    setSlMoveReflection("");
    setError(null);
  }, [open, currentPrice, trade?.id]);

  const requiresReflection = Boolean(trade?.sl_was_moved);
  const closeNotesCount = closeNotes.trim().length;
  const canSubmit = useMemo(() => {
    if (!trade) return false;
    const parsed = Number(exitPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) return false;
    if (closeNotesCount < 20) return false;
    if (closeRating < 1 || closeRating > 5) return false;
    if (requiresReflection && slMoveReflection.trim().length < 10) return false;
    return true;
  }, [trade, exitPrice, closeNotesCount, closeRating, requiresReflection, slMoveReflection]);

  const handleSubmit = async () => {
    if (!trade || !canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/trades/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: Number(trade.id),
          exitPrice: Number(exitPrice),
          closeNotes: closeNotes.trim(),
          learningNotes: learningNotes.trim() || null,
          closeRating,
          slMoveReflection: requiresReflection ? slMoveReflection.trim() : null,
          maxAdverseExcursion: liveExtremes?.mae ?? null,
          maxFavorableExcursion: liveExtremes?.mfe ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "No se pudo cerrar el trade");
      }

      onOpenChange(false);
      onClosed?.();
    } catch (err: any) {
      setError(err.message || "Error cerrando trade");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cerrar trade #{trade?.id}</DialogTitle>
          <DialogDescription>
            Completa el cierre disciplinado: precio de salida, notas (mínimo 20) y evaluación de ejecución.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
            <Label>Notas de cierre (mínimo 20 caracteres)</Label>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="w-full min-h-[92px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
              placeholder="¿Qué pasó en el cierre y por qué ejecutaste así?"
            />
            <div className={`text-xs ${closeNotesCount >= 20 ? "text-emerald-600" : "text-zinc-500"}`}>
              {closeNotesCount}/20 mínimos
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lección aprendida (opcional)</Label>
            <textarea
              value={learningNotes}
              onChange={(e) => setLearningNotes(e.target.value)}
              className="w-full min-h-[84px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm"
              placeholder="¿Qué te llevas de este trade para la próxima ejecución?"
            />
          </div>

          <div className="space-y-2">
            <Label>Calificación de ejecución (1 a 5)</Label>
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
                  <Star className="h-4 w-4" fill={closeRating >= value ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>

          {requiresReflection && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Se detectó que moviste el SL durante este trade
              </div>
              <Label className="text-amber-800">¿Qué pensabas cuando lo moviste? (mínimo 10)</Label>
              <textarea
                value={slMoveReflection}
                onChange={(e) => setSlMoveReflection(e.target.value)}
                className="w-full min-h-[84px] rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                placeholder="Describe tu razonamiento real en ese momento."
              />
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar y cerrar trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
