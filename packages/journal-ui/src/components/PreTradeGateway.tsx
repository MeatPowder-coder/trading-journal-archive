
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MENTAL_STATE_LABELS, MENTAL_STATES as MENTAL_STATES_VALUES, MentalState } from "@/lib/trading/mental-states";

const TRADING_RULES = [
  "No operes enojado, cansado, distraído o emocionalmente alterado.",
  "No arriesgues más del 2% de tu cuenta por trade.",
  "El Stop Loss es obligatorio y nunca se mueve para aumentar riesgo.",
  "Si el mercado está lateral o sin estructura, no operes.",
  "No hagas revenge trading tras pérdidas seguidas.",
  "Prioriza esperar setups de alta calidad.",
  "No promedies en contra.",
  "Registra win rate, R:R y duración con disciplina.",
  "Define tu tesis antes de ejecutar.",
  "Define Take Profit antes de entrar.",
  "Si perdiste más de $3, registra una lección antes del siguiente trade.",
];

const MENTAL_STATES = MENTAL_STATES_VALUES.map((value) => ({ value, label: MENTAL_STATE_LABELS[value] }));

type SessionPayload = {
  checklistConfirmed: boolean;
  checklistCheckedCount: number;
  checklistTotal: number;
  checklistMissing: string[];
  checklistTimestamp: string;
  mentalState: MentalState | null;
  session: any;
};

interface PreTradeGatewayProps {
  open: boolean;
  session: any;
  loadingSession?: boolean;
  onComplete: (payload: SessionPayload) => void;
}

export function PreTradeGateway({ open, session, loadingSession = false, onComplete }: PreTradeGatewayProps) {
  const [rulesChecked, setRulesChecked] = useState<boolean[]>(() => Array(TRADING_RULES.length).fill(false));
  const [mentalState, setMentalState] = useState<MentalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRulesChecked(Array(TRADING_RULES.length).fill(false));
      setError(null);
      setMentalState((session?.mental_state as MentalState | null) || null);
    }
  }, [open, session?.mental_state]);

  const requiresMentalState = useMemo(() => !session?.mental_state, [session]);
  const checkedCount = useMemo(() => rulesChecked.filter(Boolean).length, [rulesChecked]);
  const allRulesChecked = checkedCount === TRADING_RULES.length;
  const canContinue = !requiresMentalState || Boolean(mentalState);

  const toggleRule = (idx: number) => {
    setRulesChecked((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  };

  const handleContinue = async () => {
    if (!canContinue) return;

    const missingRules = TRADING_RULES.filter((_, idx) => !rulesChecked[idx]);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/trading-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentalState,
          rulesConfirmed: allRulesChecked,
          overrideUsed: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar pre-trade.");

      const nowIso = new Date().toISOString();
      onComplete({
        checklistConfirmed: allRulesChecked,
        checklistCheckedCount: checkedCount,
        checklistTotal: TRADING_RULES.length,
        checklistMissing: missingRules,
        checklistTimestamp: nowIso,
        mentalState,
        session: data.session,
      });
    } catch (err: any) {
      setError(err.message || "Error guardando pre-trade.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-4">
        <h3 className="text-lg font-semibold">Antes de operar</h3>
        <p className="text-sm text-zinc-500 mt-1">Checklist flexible: no bloquea la apertura, pero registra tu disciplina del día.</p>
      </div>

      {loadingSession && (
        <div className="text-sm text-zinc-500">Cargando sesión del día...</div>
      )}

      {(requiresMentalState || mentalState) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4" />
            Estado mental de la sesión
          </div>

          <div className="flex flex-wrap gap-2">
            {MENTAL_STATES.map((state) => (
              <Button
                key={state.value}
                type="button"
                variant={mentalState === state.value ? "default" : "outline"}
                size="sm"
                onClick={() => setMentalState(state.value)}
              >
                {state.label}
              </Button>
            ))}
          </div>

          {(mentalState === "anxious" || mentalState === "fatigued" || mentalState === "fomo") && (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Estado sensible detectado. Puedes continuar, pero te recomendamos reducir exposición y operar solo setup A+.
            </div>
          )}

          {mentalState === "avoid" && (
            <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Marcaste "Mejor No Operar". El sistema te dejará revisar ticket, pero bloqueará la ejecución.
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 max-h-[300px] overflow-y-auto space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Checklist de 11 reglas</span>
          <Badge variant="secondary">
            {checkedCount}/{TRADING_RULES.length}
          </Badge>
        </div>

        {TRADING_RULES.map((rule, idx) => (
          <button
            type="button"
            key={idx}
            onClick={() => toggleRule(idx)}
            className={`w-full text-left rounded-lg border p-3 text-sm transition ${
              rulesChecked[idx]
                ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${rulesChecked[idx] ? "text-emerald-500" : "text-zinc-400"}`} />
              <span>{rule}</span>
            </div>
          </button>
        ))}
      </div>

      {!allRulesChecked && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm">
          Vas a continuar con {TRADING_RULES.length - checkedCount} regla(s) sin marcar. Se guardará para análisis de disciplina.
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      <Button onClick={handleContinue} disabled={!canContinue || saving} className="w-full">
        {saving ? "Guardando..." : "Continuar al ticket rápido"}
      </Button>
    </div>
  );
}
