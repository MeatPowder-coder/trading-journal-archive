"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, gql } from "@apollo/client";
import { Loader2 } from "lucide-react";

const UPDATE_JOURNAL_MUTATION = gql`
  mutation UpdateTradeJournal(
    $id: Int!
    $setup_tag: String
    $timeframe: String
    $tendencia_macro: tendencia_type
    $contexto_mercado: contexto_mercado_type
    $stop_loss: numeric
    $take_profit: numeric
    $zona_entrada: String
    $emocion_entrada: String
    $calificacion_personal: calificacion_personal_type
    $notas_aprendizaje: String
    $notas_cierre: String
  ) {
    update_trades_activos_by_pk(
      pk_columns: { id: $id }
      _set: {
        setup_tag: $setup_tag
        timeframe: $timeframe
        tendencia_macro: $tendencia_macro
        contexto_mercado: $contexto_mercado
        stop_loss: $stop_loss
        take_profit: $take_profit
        zona_entrada: $zona_entrada
        emocion_entrada: $emocion_entrada
        calificacion_personal: $calificacion_personal
        notas_aprendizaje: $notas_aprendizaje
        notas_cierre: $notas_cierre
      }
    ) {
      id
    }
  }
`;

const SETUP_TAGS = [
  "Breakout",
  "Reversal",
  "Liquidity Grab",
  "Trend Continuation",
  "Range Fade",
  "Scalp",
  "Other"
];

const TIMEFRAMES = ["5m", "15m", "1h"];

const EMOCIONES = [
  "Calmado",
  "Confiado",
  "Ansioso",
  "Impulsivo",
  "Dudoso"
];

type WizardMode = "open" | "close";

interface TradeJournalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: any;
  mode: WizardMode;
  onCompleted?: () => void;
}

export function TradeJournalWizard({ open, onOpenChange, trade, mode, onCompleted }: TradeJournalWizardProps) {
  const [step, setStep] = useState(1);
  const [allowClose, setAllowClose] = useState(false);

  const [form, setForm] = useState({
    setup_tag: trade?.setup_tag || "",
    timeframe: trade?.timeframe || "5m",
    tendencia_macro: trade?.tendencia_macro || "",
    contexto_mercado: trade?.contexto_mercado || "",
    stop_loss: trade?.stop_loss?.toString() || "",
    take_profit: trade?.take_profit?.toString() || "",
    zona_entrada: trade?.zona_entrada || "",
    emocion_entrada: trade?.emocion_entrada || "",
    calificacion_personal: trade?.calificacion_personal || "",
    notas_aprendizaje: trade?.notas_aprendizaje || "",
    notas_cierre: trade?.notas_cierre || ""
  });

  useEffect(() => {
    setForm({
      setup_tag: trade?.setup_tag || "",
      timeframe: trade?.timeframe || "5m",
      tendencia_macro: trade?.tendencia_macro || "",
      contexto_mercado: trade?.contexto_mercado || "",
      stop_loss: trade?.stop_loss?.toString() || "",
      take_profit: trade?.take_profit?.toString() || "",
      zona_entrada: trade?.zona_entrada || "",
      emocion_entrada: trade?.emocion_entrada || "",
      calificacion_personal: trade?.calificacion_personal || "",
      notas_aprendizaje: trade?.notas_aprendizaje || "",
      notas_cierre: trade?.notas_cierre || ""
    });
    setStep(1);
    setAllowClose(false);
  }, [trade, open]);

  const [updateJournal, { loading }] = useMutation(UPDATE_JOURNAL_MUTATION, {
    onCompleted: () => {
      setAllowClose(true);
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err) => {
      console.error("Error updating journal:", err);
      alert("Error al guardar journal: " + err.message);
    }
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateOpenStep = () => {
    if (step === 1) {
      return !!form.setup_tag && !!form.timeframe && !!form.tendencia_macro && !!form.contexto_mercado;
    }
    if (step === 2) {
      return !!form.zona_entrada;
    }
    if (step === 3) {
      return !!form.emocion_entrada;
    }
    return true;
  };

  const validateClose = () => {
    return !!form.notas_cierre && !!form.notas_aprendizaje && !!form.calificacion_personal;
  };

  const handleSubmit = async () => {
    if (!trade?.id) return;

    if (mode === "open" && !validateOpenStep()) {
      alert("Completa todos los campos obligatorios de este paso.");
      return;
    }

    if (mode === "close" && !validateClose()) {
      alert("Completa los campos obligatorios del cierre.");
      return;
    }

    const variables: any = {
      id: Number(trade.id),
      setup_tag: form.setup_tag || null,
      timeframe: form.timeframe || null,
      tendencia_macro: form.tendencia_macro || null,
      contexto_mercado: form.contexto_mercado || null,
      stop_loss: form.stop_loss ? Number(form.stop_loss) : null,
      take_profit: form.take_profit ? Number(form.take_profit) : null,
      zona_entrada: form.zona_entrada || null,
      emocion_entrada: form.emocion_entrada || null,
      calificacion_personal: form.calificacion_personal || null,
      notas_aprendizaje: form.notas_aprendizaje || null,
      notas_cierre: form.notas_cierre || null
    };

    await updateJournal({ variables });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !allowClose) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[620px] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "open" ? "Journal de Apertura" : "Journal de Cierre"}</DialogTitle>
          <DialogDescription>
            {mode === "open"
              ? "Completa el journal obligatorio antes de continuar."
              : "Cierre obligatorio para registrar aprendizajes y disciplina."}
          </DialogDescription>
        </DialogHeader>

        {mode === "open" ? (
          <div className="space-y-6">
            {step === 1 && (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Setup</Label>
                  <Select value={form.setup_tag} onValueChange={(v) => handleChange("setup_tag", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona setup" /></SelectTrigger>
                    <SelectContent>
                      {SETUP_TAGS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Timeframe</Label>
                    <Select value={form.timeframe} onValueChange={(v) => handleChange("timeframe", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEFRAMES.map((tf) => (
                          <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tendencia Macro</Label>
                    <Select value={form.tendencia_macro} onValueChange={(v) => handleChange("tendencia_macro", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALCISTA">ALCISTA</SelectItem>
                        <SelectItem value="BAJISTA">BAJISTA</SelectItem>
                        <SelectItem value="LATERAL">LATERAL</SelectItem>
                        <SelectItem value="NO_SE">NO_SE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Contexto de Mercado</Label>
                  <Select value={form.contexto_mercado} onValueChange={(v) => handleChange("contexto_mercado", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TENDENCIA_ALCISTA">TENDENCIA_ALCISTA</SelectItem>
                      <SelectItem value="TENDENCIA_BAJISTA">TENDENCIA_BAJISTA</SelectItem>
                      <SelectItem value="RANGO">RANGO</SelectItem>
                      <SelectItem value="CONSOLIDACION">CONSOLIDACION</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stop Loss</Label>
                    <Input
                      value={form.stop_loss}
                      onChange={(e) => handleChange("stop_loss", e.target.value)}
                      placeholder="Auto si está vacío"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Take Profit</Label>
                    <Input
                      value={form.take_profit}
                      onChange={(e) => handleChange("take_profit", e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Zona de Entrada</Label>
                  <Input
                    value={form.zona_entrada}
                    onChange={(e) => handleChange("zona_entrada", e.target.value)}
                    placeholder="Ej: ruptura + retest"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Emoción al Entrar</Label>
                  <Select value={form.emocion_entrada} onValueChange={(v) => handleChange("emocion_entrada", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      {EMOCIONES.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>¿Seguiste las reglas?</Label>
                  <Select value={form.calificacion_personal} onValueChange={(v) => handleChange("calificacion_personal", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEGUI_REGLAS">SEGUI_REGLAS</SelectItem>
                      <SelectItem value="ROMPI_REGLAS">ROMPI_REGLAS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
                Atrás
              </Button>
              {step < 3 ? (
                <Button onClick={() => {
                  if (!validateOpenStep()) {
                    alert("Completa los campos obligatorios de este paso.");
                    return;
                  }
                  setStep((s) => s + 1);
                }}>
                  Siguiente
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Notas de Cierre</Label>
              <Input
                value={form.notas_cierre}
                onChange={(e) => handleChange("notas_cierre", e.target.value)}
                placeholder="Qué ocurrió al cerrar"
              />
            </div>
            <div className="space-y-2">
              <Label>Notas de Aprendizaje</Label>
              <Input
                value={form.notas_aprendizaje}
                onChange={(e) => handleChange("notas_aprendizaje", e.target.value)}
                placeholder="Qué aprendiste"
              />
            </div>
            <div className="space-y-2">
              <Label>Calificación Personal</Label>
              <Select value={form.calificacion_personal} onValueChange={(v) => handleChange("calificacion_personal", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEGUI_REGLAS">SEGUI_REGLAS</SelectItem>
                  <SelectItem value="ROMPI_REGLAS">ROMPI_REGLAS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
