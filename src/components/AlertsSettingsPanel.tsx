"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AlertsConfig = {
    version: 1;
    lossThresholdPct: number;
    gainThresholdPct: number;
    cooldownMinutes: number;
    strictOpenEscalationOnly: boolean;
    dedupEnabled: boolean;
    escalationEnabled: boolean;
    escalationStepPct: number;
    recoveryEnabled: boolean;
    recoveryCooldownMinutes: number;
    hysteresisPct: number;
    fallbackEnabled: boolean;
    maxRetries: number;
    testNotificationsEnabled: boolean;
    testCooldownSeconds: number;
};

const DEFAULTS: AlertsConfig = {
    version: 1,
    lossThresholdPct: -8,
    gainThresholdPct: 12,
    cooldownMinutes: 30,
    strictOpenEscalationOnly: true,
    dedupEnabled: true,
    escalationEnabled: true,
    escalationStepPct: 2,
    recoveryEnabled: true,
    recoveryCooldownMinutes: 30,
    hysteresisPct: 1,
    fallbackEnabled: false,
    maxRetries: 3,
    testNotificationsEnabled: true,
    testCooldownSeconds: 60,
};

export function AlertsSettingsPanel() {
    const [form, setForm] = useState<AlertsConfig>(DEFAULTS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<string>("");

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const res = await fetch("/api/alerts/config", { method: "GET" });
                const data = await res.json();
                if (!res.ok || !data?.success) {
                    throw new Error(data?.error || "No se pudo cargar la configuración");
                }
                setForm({ ...DEFAULTS, ...data.config });
            } catch (err: any) {
                setStatus(`Error al cargar: ${err?.message || "desconocido"}`);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const canSave = useMemo(() => {
        return !saving && !loading;
    }, [saving, loading]);

    const setNumber = (key: keyof AlertsConfig) => (value: string) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        setForm((prev) => ({ ...prev, [key]: parsed }));
    };

    const setBoolean = (key: keyof AlertsConfig) => (checked: boolean) => {
        setForm((prev) => ({ ...prev, [key]: checked }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setStatus("");
            const res = await fetch("/api/alerts/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                throw new Error(data?.error || "No se pudo guardar");
            }
            setForm({ ...DEFAULTS, ...data.config });
            setStatus("Configuración guardada correctamente");
        } catch (err: any) {
            setStatus(`Error al guardar: ${err?.message || "desconocido"}`);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        try {
            setTesting(true);
            setStatus("");
            const res = await fetch("/api/alerts/test", { method: "POST" });
            const data = await res.json();
            if (res.status === 429 && data?.deduplicated) {
                const remaining = Number(data?.remainingSeconds);
                if (Number.isFinite(remaining) && remaining > 0) {
                    setStatus(`Test deduplicado por cooldown. Reintenta en ${remaining}s.`);
                } else {
                    setStatus("Test deduplicado por cooldown.");
                }
                return;
            }
            if (!res.ok || !data?.success) {
                throw new Error(data?.error || "No se pudo enviar test");
            }
            setStatus("Notificación de prueba enviada a Telegram");
        } catch (err: any) {
            setStatus(`Error en test: ${err?.message || "desconocido"}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Configuración de Alertas</CardTitle>
                <CardDescription>
                    Controla umbrales, anti-spam, escalado, recovery, fallback y test desde el Journal.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {loading ? (
                    <p className="text-sm text-zinc-500">Cargando configuración...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="lossThresholdPct">Umbral pérdida (%)</Label>
                                <Input
                                    id="lossThresholdPct"
                                    type="number"
                                    step="0.1"
                                    value={form.lossThresholdPct}
                                    onChange={(e) => setNumber("lossThresholdPct")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="gainThresholdPct">Umbral ganancia (%)</Label>
                                <Input
                                    id="gainThresholdPct"
                                    type="number"
                                    step="0.1"
                                    value={form.gainThresholdPct}
                                    onChange={(e) => setNumber("gainThresholdPct")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="cooldownMinutes">Cooldown (min)</Label>
                                <Input
                                    id="cooldownMinutes"
                                    type="number"
                                    step="1"
                                    value={form.cooldownMinutes}
                                    onChange={(e) => setNumber("cooldownMinutes")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="recoveryCooldownMinutes">Cooldown recovery (min)</Label>
                                <Input
                                    id="recoveryCooldownMinutes"
                                    type="number"
                                    step="1"
                                    value={form.recoveryCooldownMinutes}
                                    onChange={(e) => setNumber("recoveryCooldownMinutes")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="hysteresisPct">Histéresis (%)</Label>
                                <Input
                                    id="hysteresisPct"
                                    type="number"
                                    step="0.1"
                                    value={form.hysteresisPct}
                                    onChange={(e) => setNumber("hysteresisPct")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="escalationStepPct">Paso de escalado (%)</Label>
                                <Input
                                    id="escalationStepPct"
                                    type="number"
                                    step="0.1"
                                    value={form.escalationStepPct}
                                    onChange={(e) => setNumber("escalationStepPct")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="maxRetries">Reintentos Telegram</Label>
                                <Input
                                    id="maxRetries"
                                    type="number"
                                    step="1"
                                    value={form.maxRetries}
                                    onChange={(e) => setNumber("maxRetries")(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="testCooldownSeconds">Cooldown test (s)</Label>
                                <Input
                                    id="testCooldownSeconds"
                                    type="number"
                                    step="1"
                                    value={form.testCooldownSeconds}
                                    onChange={(e) => setNumber("testCooldownSeconds")(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.strictOpenEscalationOnly}
                                    onChange={(e) => setBoolean("strictOpenEscalationOnly")(e.target.checked)}
                                />
                                Anti-spam estricto (solo OPEN y ESCALATION)
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.dedupEnabled}
                                    onChange={(e) => setBoolean("dedupEnabled")(e.target.checked)}
                                />
                                Deduplicación activa
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.escalationEnabled}
                                    onChange={(e) => setBoolean("escalationEnabled")(e.target.checked)}
                                />
                                Escalado activo
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.recoveryEnabled}
                                    onChange={(e) => setBoolean("recoveryEnabled")(e.target.checked)}
                                />
                                Mensajes de recovery activos
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.fallbackEnabled}
                                    onChange={(e) => setBoolean("fallbackEnabled")(e.target.checked)}
                                />
                                Fallback n8n activo
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.testNotificationsEnabled}
                                    onChange={(e) => setBoolean("testNotificationsEnabled")(e.target.checked)}
                                />
                                Habilitar notificaciones de prueba
                            </label>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button onClick={handleSave} disabled={!canSave}>
                                {saving ? "Guardando..." : "Guardar configuración"}
                            </Button>
                            <Button variant="secondary" onClick={handleTest} disabled={testing || loading}>
                                {testing ? "Enviando test..." : "Enviar prueba"}
                            </Button>
                        </div>

                        {status ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{status}</p> : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
