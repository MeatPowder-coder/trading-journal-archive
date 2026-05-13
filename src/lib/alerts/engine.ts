import crypto from 'crypto';
import { query } from '@/lib/db';
import {
    canSendAlertTest,
    getEffectiveAlertsConfig,
    logAlertTestEvent,
    updateAlertsConfigRuntime,
} from '@/lib/alerts/config';

const BINANCE_BASE_URL = 'https://fapi.binance.com';

type AlertStatus = 'SAFE' | 'CRITICAL_LOSS' | 'CRITICAL_GAIN';

type OpenTrade = {
    id: number;
    simbolo: string;
    direccion: string | null;
    precio_entrada: string | number | null;
    apalancamiento: string | number | null;
};

type TradeState = {
    last_status: AlertStatus;
    last_severity: number | null;
    last_notified_at: string | null;
    last_recovered_at: string | null;
    last_telegram_message_id: number | null;
};

type CheckSummary = {
    scanned: number;
    criticalDetected: number;
    alertsSent: number;
    recoveredSent: number;
    skippedByDedup: number;
    failures: number;
};

const BINANCE_FUTURES_API_KEY = process.env.BINANCE_FUTURES_API_KEY || '';
const BINANCE_FUTURES_API_SECRET = process.env.BINANCE_FUTURES_API_SECRET || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const N8N_FALLBACK_WEBHOOK_URL = process.env.N8N_FALLBACK_WEBHOOK_URL || '';

function sign(queryString: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function asNumber(value: string | number | null | undefined, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
    return new Date().toISOString();
}

function minutesBetween(a: string | null, b: Date) {
    if (!a) return Number.POSITIVE_INFINITY;
    const from = new Date(a).getTime();
    if (!Number.isFinite(from)) return Number.POSITIVE_INFINITY;
    return (b.getTime() - from) / (1000 * 60);
}

async function fetchOpenTrades(): Promise<OpenTrade[]> {
    const res = await query(
        `SELECT id, simbolo, direccion, precio_entrada, apalancamiento
     FROM trades_activos
     WHERE estado = 'OPEN'
       AND fecha_cierre IS NULL
       AND broker = 'BINANCE_FUTURES'
     ORDER BY id ASC`
    );
    return res.rows;
}

async function isTradeStillOpen(tradeId: number) {
    const res = await query(
        `SELECT 1
         FROM trades_activos
         WHERE id = $1
           AND estado = 'OPEN'
           AND fecha_cierre IS NULL
         LIMIT 1`,
        [tradeId]
    );

    return res.rows.length > 0;
}

async function fetchPositionRisk(symbol: string) {
    const ts = Date.now();
    const qs = `symbol=${symbol}&timestamp=${ts}`;
    const signature = sign(qs, BINANCE_FUTURES_API_SECRET);
    const url = `${BINANCE_BASE_URL}/fapi/v2/positionRisk?${qs}&signature=${signature}`;

    const res = await fetch(url, {
        headers: { 'X-MBX-APIKEY': BINANCE_FUTURES_API_KEY },
    });

    if (!res.ok) {
        throw new Error(`Binance positionRisk failed (${symbol}): ${await res.text()}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
}

function calculateLeveragedPnlPct(params: {
    entry: number;
    mark: number;
    leverage: number;
    direction: string;
}) {
    const { entry, mark, leverage, direction } = params;
    if (entry <= 0 || mark <= 0 || leverage <= 0) return 0;

    if (direction === 'LONG') {
        return ((mark - entry) / entry) * 100 * leverage;
    }

    return ((entry - mark) / entry) * 100 * leverage;
}

async function getTradeState(tradeId: number): Promise<TradeState | null> {
    const res = await query(
        `SELECT last_status, last_severity, last_notified_at, last_recovered_at, last_telegram_message_id
     FROM alert_trade_state
     WHERE trade_id = $1`,
        [tradeId]
    );
    return res.rows[0] || null;
}

async function setTradeState(params: {
    tradeId: number;
    status: AlertStatus;
    severity: number | null;
    notifiedAt?: string | null;
    recoveredAt?: string | null;
    eventKey?: string | null;
    telegramMessageId?: number | null;
}) {
    const { tradeId, status, severity, notifiedAt, recoveredAt, eventKey, telegramMessageId } = params;

    await query(
        `INSERT INTO alert_trade_state
      (trade_id, last_status, last_severity, last_event_key, last_notified_at, last_recovered_at, last_telegram_message_id, updated_at, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (trade_id) DO UPDATE SET
      last_status = EXCLUDED.last_status,
      last_severity = EXCLUDED.last_severity,
      last_event_key = EXCLUDED.last_event_key,
      last_notified_at = COALESCE(EXCLUDED.last_notified_at, alert_trade_state.last_notified_at),
      last_recovered_at = COALESCE(EXCLUDED.last_recovered_at, alert_trade_state.last_recovered_at),
      last_telegram_message_id = COALESCE(EXCLUDED.last_telegram_message_id, alert_trade_state.last_telegram_message_id),
      updated_at = NOW()`,
        [
            tradeId,
            status,
            severity,
            eventKey || null,
            notifiedAt || null,
            recoveredAt || null,
            telegramMessageId ?? null,
        ]
    );
}

async function logNotificationEvent(params: {
    tradeId: number;
    eventKey: string;
    status: AlertStatus;
    severity: number | null;
    success: boolean;
    error?: string;
    payload?: unknown;
    channel?: string;
}) {
    const { tradeId, eventKey, status, severity, success, error, payload, channel } = params;
    await query(
        `INSERT INTO alert_notification_events
      (trade_id, channel, event_key, status, severity, success, error, payload, sent_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
        [
            tradeId,
            channel || 'telegram',
            eventKey,
            status,
            severity,
            success,
            error || null,
            payload ? JSON.stringify(payload) : null,
        ]
    );
}

async function sendTelegramMessage(text: string): Promise<number> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        throw new Error('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing');
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
        throw new Error(`Telegram failed: ${JSON.stringify(data)}`);
    }

    const messageId = Number(data?.result?.message_id);
    if (!Number.isFinite(messageId)) {
        throw new Error('Telegram failed: missing message_id');
    }

    return messageId;
}

async function deleteTelegramMessage(messageId: number) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, message_id: messageId }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
        throw new Error(`deleteMessage failed: ${JSON.stringify(data)}`);
    }
}

async function editTelegramMessage(messageId: number, text: string): Promise<number> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        throw new Error('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing');
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
        throw new Error(`editMessageText failed: ${JSON.stringify(data)}`);
    }

    return messageId;
}

async function sendOrReplaceTelegramMessage(params: {
    text: string;
    previousMessageId: number | null | undefined;
    maxRetries: number;
}): Promise<number> {
    const { text, previousMessageId, maxRetries } = params;

    if (previousMessageId && Number.isFinite(previousMessageId)) {
        try {
            return await editTelegramMessage(previousMessageId, text);
        } catch {
            const sentMessageId = await sendWithRetry(text, maxRetries);
            try {
                await deleteTelegramMessage(previousMessageId);
            } catch {
                // noop: si no se puede borrar, mantener continuidad sin romper flujo
            }
            return sentMessageId;
        }
    }

    return sendWithRetry(text, maxRetries);
}

async function sendN8nFallback(payload: unknown) {
    if (!N8N_FALLBACK_WEBHOOK_URL) {
        throw new Error('N8N_FALLBACK_WEBHOOK_URL missing');
    }

    const res = await fetch(N8N_FALLBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`n8n fallback failed: ${await res.text()}`);
    }
}

function buildCriticalMessage(params: {
    symbol: string;
    direction: string;
    pnlPct: number;
    entry: number;
    mark: number;
    leverage: number;
    status: AlertStatus;
    thresholdPct: number;
}) {
    const { symbol, direction, pnlPct, entry, mark, leverage, status, thresholdPct } = params;
    const isLoss = status === 'CRITICAL_LOSS';
    return [
        isLoss ? '🚨 <b>ALERTA CRÍTICA (PÉRDIDA)</b> 🚨' : '🟢 <b>ALERTA CRÍTICA (GANANCIA)</b> 🟢',
        '',
        `<b>${symbol}</b> (${direction})`,
        `${isLoss ? '💥' : '📈'} PnL %: <b>${pnlPct.toFixed(2)}%</b>`,
        `📉 Entrada: ${entry.toFixed(4)}`,
        `📈 Mark: ${mark.toFixed(4)}`,
        `⚙️ Lev: ${leverage.toFixed(2)}x`,
        '',
        `Umbral crítico: ${thresholdPct.toFixed(2)}%`,
        `Hora: ${nowIso()}`,
    ].join('\n');
}

function buildRecoveryMessage(params: {
    symbol: string;
    direction: string;
    pnlPct: number;
}) {
    const { symbol, direction, pnlPct } = params;
    return [
        '✅ <b>RECUPERACIÓN DE RIESGO</b>',
        '',
        `<b>${symbol}</b> (${direction}) volvió a zona segura.`,
        `PnL % actual: <b>${pnlPct.toFixed(2)}%</b>`,
        `Hora: ${nowIso()}`,
    ].join('\n');
}

async function sendWithRetry(text: string, maxRetries: number): Promise<number> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await sendTelegramMessage(text);
        } catch (err: any) {
            lastError = err;
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            }
        }
    }

    throw lastError || new Error('Unknown telegram error');
}

export async function setN8nFallbackEnabled(enabled: boolean) {
    await updateAlertsConfigRuntime({ fallbackEnabled: enabled });
}

export async function getN8nFallbackEnabled() {
    const { config } = await getEffectiveAlertsConfig();
    return config.fallbackEnabled;
}

export async function sendTestAlert(params: { triggeredBy: string; triggeredEmail: string }) {
    const { triggeredBy, triggeredEmail } = params;
    const { config } = await getEffectiveAlertsConfig();

    if (!config.testNotificationsEnabled) {
        throw new Error('Test notifications are disabled');
    }

    const gate = await canSendAlertTest(triggeredBy, config.testCooldownSeconds);
    if (!gate.allowed) {
        throw new Error(`Cooldown active for test notifications (${gate.remainingSeconds}s restantes)`);
    }

    const text = [
        '🧪 <b>TEST DE ALERTAS</b>',
        '',
        'Este es un mensaje de prueba del sistema de notificaciones.',
        `Usuario: ${triggeredEmail}`,
        `Hora: ${nowIso()}`,
    ].join('\n');

    try {
        await sendWithRetry(text, config.maxRetries);
        await logAlertTestEvent({
            triggeredBy,
            triggeredEmail,
            success: true,
            payload: { type: 'TEST' },
        });
        return { success: true };
    } catch (err: any) {
        await logAlertTestEvent({
            triggeredBy,
            triggeredEmail,
            success: false,
            error: err?.message || 'test alert failed',
            payload: { type: 'TEST' },
        });
        throw err;
    }
}

export async function runCriticalAlertsCheck(): Promise<CheckSummary> {
    if (!BINANCE_FUTURES_API_KEY || !BINANCE_FUTURES_API_SECRET) {
        throw new Error('Missing BINANCE_FUTURES_API_KEY/BINANCE_FUTURES_API_SECRET');
    }

    const summary: CheckSummary = {
        scanned: 0,
        criticalDetected: 0,
        alertsSent: 0,
        recoveredSent: 0,
        skippedByDedup: 0,
        failures: 0,
    };

    const { config } = await getEffectiveAlertsConfig();

    const openTrades = await fetchOpenTrades();
    const now = new Date();

    for (const trade of openTrades) {
        summary.scanned++;
        const symbol = String(trade.simbolo || '').toUpperCase();

        try {
            const pos = await fetchPositionRisk(symbol);
            const positionAmt = asNumber(pos?.positionAmt, 0);
            if (Math.abs(positionAmt) === 0) {
                await setTradeState({
                    tradeId: trade.id,
                    status: 'SAFE',
                    severity: null,
                    eventKey: `${trade.id}:SAFE:NO_POSITION`,
                });
                continue;
            }

            const direction = String(trade.direccion || (positionAmt > 0 ? 'LONG' : 'SHORT')).toUpperCase();
            const entry = asNumber(trade.precio_entrada, asNumber(pos?.entryPrice, 0));
            const mark = asNumber(pos?.markPrice, 0);
            const leverage = asNumber(trade.apalancamiento, asNumber(pos?.leverage, 1));
            const pnlPct = calculateLeveragedPnlPct({ entry, mark, leverage, direction });

            const state = await getTradeState(trade.id);
            const previousStatus = state?.last_status || 'SAFE';

            const currentStatus: AlertStatus =
                previousStatus === 'CRITICAL_LOSS'
                    ? (pnlPct <= config.lossThresholdPct + config.hysteresisPct ? 'CRITICAL_LOSS' : 'SAFE')
                    : previousStatus === 'CRITICAL_GAIN'
                        ? (pnlPct >= config.gainThresholdPct - config.hysteresisPct ? 'CRITICAL_GAIN' : 'SAFE')
                        : pnlPct <= config.lossThresholdPct
                            ? 'CRITICAL_LOSS'
                            : pnlPct >= config.gainThresholdPct
                                ? 'CRITICAL_GAIN'
                                : 'SAFE';

            const severity = currentStatus !== 'SAFE' ? pnlPct : null;
            const previousSeverity = state?.last_severity ?? null;

            if (currentStatus !== 'SAFE') {
                summary.criticalDetected++;
            }

            if (config.recoveryEnabled && currentStatus === 'SAFE' && previousStatus !== 'SAFE') {
                const minutesSinceRecovery = minutesBetween(state?.last_recovered_at || null, now);
                if (minutesSinceRecovery < config.recoveryCooldownMinutes) {
                    await setTradeState({
                        tradeId: trade.id,
                        status: currentStatus,
                        severity,
                        eventKey: `${trade.id}:SAFE:RECOVERY_COOLDOWN:${Math.floor(now.getTime() / 60000)}`,
                    });
                    continue;
                }

                const eventKey = `${trade.id}:RECOVERY:${now.getTime()}`;
                const message = buildRecoveryMessage({ symbol, direction, pnlPct });

                try {
                    const sentMessageId = await sendOrReplaceTelegramMessage({
                        text: message,
                        previousMessageId: state?.last_telegram_message_id,
                        maxRetries: config.maxRetries,
                    });

                    summary.recoveredSent++;
                    await logNotificationEvent({
                        tradeId: trade.id,
                        eventKey,
                        status: currentStatus,
                        severity,
                        success: true,
                        payload: { symbol, direction, pnlPct, type: 'RECOVERY' },
                    });
                    await setTradeState({
                        tradeId: trade.id,
                        status: currentStatus,
                        severity,
                        eventKey,
                        recoveredAt: nowIso(),
                        telegramMessageId: sentMessageId,
                    });
                } catch (err: any) {
                    summary.failures++;
                    await logNotificationEvent({
                        tradeId: trade.id,
                        eventKey,
                        status: currentStatus,
                        severity,
                        success: false,
                        error: err?.message || 'recovery send failed',
                        payload: { symbol, direction, pnlPct, type: 'RECOVERY' },
                    });
                }

                continue;
            }

            if (currentStatus === 'SAFE') {
                await setTradeState({
                    tradeId: trade.id,
                    status: currentStatus,
                    severity,
                    eventKey: `${trade.id}:SAFE:${Math.floor(now.getTime() / 60000)}`,
                });
                continue;
            }

            const minutesSinceLast = minutesBetween(state?.last_notified_at || null, now);
            const isNewCritical = previousStatus !== currentStatus;
            const isEscalation =
                config.escalationEnabled &&
                previousStatus === currentStatus &&
                previousSeverity !== null &&
                severity !== null &&
                (currentStatus === 'CRITICAL_LOSS'
                    ? severity <= previousSeverity - config.escalationStepPct
                    : severity >= previousSeverity + config.escalationStepPct);
            const cooldownPassed = minutesSinceLast >= config.cooldownMinutes;

            if (config.strictOpenEscalationOnly) {
                if (!isNewCritical && !isEscalation) {
                    summary.skippedByDedup++;
                    await setTradeState({
                        tradeId: trade.id,
                        status: currentStatus,
                        severity,
                        eventKey: `${trade.id}:CRITICAL:STRICT_SKIP:${Math.floor(now.getTime() / 60000)}`,
                    });
                    continue;
                }
            }

            if (config.dedupEnabled && !isNewCritical && !isEscalation && !cooldownPassed) {
                summary.skippedByDedup++;
                await setTradeState({
                    tradeId: trade.id,
                    status: currentStatus,
                    severity,
                    eventKey: `${trade.id}:CRITICAL:DEDUP:${Math.floor(now.getTime() / 60000)}`,
                });
                continue;
            }

            const eventType = isNewCritical ? 'OPEN' : isEscalation ? 'ESCALATION' : 'REMINDER';
            const eventBucket = currentStatus === 'CRITICAL_LOSS' ? 'LOSS' : 'GAIN';
            const eventKey = `${trade.id}:${eventBucket}:${eventType}:${Math.floor(now.getTime() / 60_000)}`;
            const message = buildCriticalMessage({
                symbol,
                direction,
                pnlPct,
                entry,
                mark,
                leverage,
                status: currentStatus,
                thresholdPct:
                    currentStatus === 'CRITICAL_LOSS' ? config.lossThresholdPct : config.gainThresholdPct,
            });

            // Guard against race condition: position/trade can close between initial scan and send.
            const stillOpen = await isTradeStillOpen(trade.id);
            if (!stillOpen) {
                await setTradeState({
                    tradeId: trade.id,
                    status: 'SAFE',
                    severity: null,
                    eventKey: `${trade.id}:SAFE:RACE_CLOSED:${Math.floor(now.getTime() / 60000)}`,
                });
                continue;
            }

            try {
                const sentMessageId = await sendOrReplaceTelegramMessage({
                    text: message,
                    previousMessageId: state?.last_telegram_message_id,
                    maxRetries: config.maxRetries,
                });

                summary.alertsSent++;

                await logNotificationEvent({
                    tradeId: trade.id,
                    eventKey,
                    status: currentStatus,
                    severity,
                    success: true,
                    payload: { symbol, direction, pnlPct, entry, mark, leverage, eventType },
                });

                await setTradeState({
                    tradeId: trade.id,
                    status: currentStatus,
                    severity,
                    eventKey,
                    notifiedAt: nowIso(),
                    telegramMessageId: sentMessageId,
                });
            } catch (err: any) {
                summary.failures++;

                await logNotificationEvent({
                    tradeId: trade.id,
                    eventKey,
                    status: currentStatus,
                    severity,
                    success: false,
                    error: err?.message || 'critical send failed',
                    payload: { symbol, direction, pnlPct, entry, mark, leverage, eventType },
                });

                if (config.fallbackEnabled) {
                    try {
                        await sendN8nFallback({
                            type: currentStatus,
                            tradeId: trade.id,
                            symbol,
                            direction,
                            pnlPct,
                            entry,
                            mark,
                            leverage,
                            eventType,
                            failedChannel: 'telegram',
                            failedAt: nowIso(),
                        });

                        await logNotificationEvent({
                            tradeId: trade.id,
                            eventKey: `${eventKey}:N8N_FALLBACK`,
                            status: currentStatus,
                            severity,
                            success: true,
                            payload: { via: 'n8n_fallback' },
                            channel: 'n8n_fallback',
                        });
                    } catch (fallbackErr: any) {
                        summary.failures++;
                        await logNotificationEvent({
                            tradeId: trade.id,
                            eventKey: `${eventKey}:N8N_FALLBACK`,
                            status: currentStatus,
                            severity,
                            success: false,
                            error: fallbackErr?.message || 'n8n fallback failed',
                            payload: { via: 'n8n_fallback' },
                            channel: 'n8n_fallback',
                        });
                    }
                }
            }
        } catch (err) {
            summary.failures++;
            await logNotificationEvent({
                tradeId: trade.id,
                eventKey: `${trade.id}:CHECK_ERROR:${Math.floor(Date.now() / 60000)}`,
                status: 'SAFE',
                severity: null,
                success: false,
                error: err instanceof Error ? err.message : 'unknown check error',
                payload: { symbol },
            });
        }
    }

    return summary;
}
