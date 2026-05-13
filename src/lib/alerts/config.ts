import { z } from 'zod';
import { query } from '@/lib/db';

export const ALERTS_CONFIG_KEY = 'alerts_config_v1';

const AlertsConfigSchema = z.object({
    version: z.literal(1),
    lossThresholdPct: z.number().min(-100).max(-0.1),
    gainThresholdPct: z.number().min(0.1).max(500),
    cooldownMinutes: z.number().int().min(1).max(24 * 60),
    strictOpenEscalationOnly: z.boolean(),
    dedupEnabled: z.boolean(),
    escalationEnabled: z.boolean(),
    escalationStepPct: z.number().min(0.1).max(100),
    recoveryEnabled: z.boolean(),
    recoveryCooldownMinutes: z.number().int().min(1).max(24 * 60),
    hysteresisPct: z.number().min(0).max(20),
    fallbackEnabled: z.boolean(),
    maxRetries: z.number().int().min(1).max(10),
    testNotificationsEnabled: z.boolean(),
    testCooldownSeconds: z.number().int().min(10).max(3600),
});

export type AlertsConfig = z.infer<typeof AlertsConfigSchema>;

type ConfigSource = 'db' | 'env-default';

function envNumber(name: string, fallback: number) {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean) {
    const raw = process.env[name];
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function defaultAlertsConfig(): AlertsConfig {
    return {
        version: 1,
        lossThresholdPct: envNumber('ALERT_LOSS_THRESHOLD_PCT', -8),
        gainThresholdPct: envNumber('ALERT_GAIN_THRESHOLD_PCT', 12),
        cooldownMinutes: envNumber('ALERT_COOLDOWN_MINUTES', 30),
        strictOpenEscalationOnly: envBool('ALERT_STRICT_OPEN_ESCALATION_ONLY', true),
        dedupEnabled: envBool('ALERT_DEDUP_ENABLED', true),
        escalationEnabled: envBool('ALERT_ESCALATION_ENABLED', true),
        escalationStepPct: Math.abs(envNumber('ALERT_ESCALATION_STEP_PCT', 2)),
        recoveryEnabled: envBool('ALERT_RECOVERY_ENABLED', true),
        recoveryCooldownMinutes: envNumber('ALERT_RECOVERY_COOLDOWN_MINUTES', 30),
        hysteresisPct: Math.abs(envNumber('ALERT_HYSTERESIS_PCT', 1)),
        fallbackEnabled: envBool('ALERT_FALLBACK_ENABLED', false),
        maxRetries: Math.max(1, Math.floor(envNumber('ALERT_MAX_RETRIES', 3))),
        testNotificationsEnabled: envBool('ALERT_TEST_NOTIFICATIONS_ENABLED', true),
        testCooldownSeconds: Math.max(10, Math.floor(envNumber('ALERT_TEST_COOLDOWN_SECONDS', 60))),
    };
}

async function getLegacyFallbackEnabled() {
    const res = await query(
        `SELECT value
         FROM alert_runtime_config
         WHERE key = 'n8n_fallback_enabled'`
    );

    const row = res.rows[0];
    if (!row?.value || typeof row.value !== 'object') return null;
    return Boolean(row.value.enabled);
}

export async function getEffectiveAlertsConfig(): Promise<{
    config: AlertsConfig;
    sources: Record<keyof AlertsConfig, ConfigSource>;
}> {
    const defaults = defaultAlertsConfig();
    const sources = Object.keys(defaults).reduce((acc, key) => {
        acc[key as keyof AlertsConfig] = 'env-default';
        return acc;
    }, {} as Record<keyof AlertsConfig, ConfigSource>);

    const res = await query(
        `SELECT value
         FROM alert_runtime_config
         WHERE key = $1`,
        [ALERTS_CONFIG_KEY]
    );

    const maybeDb = res.rows[0]?.value;
    if (maybeDb && typeof maybeDb === 'object') {
        const parsed = AlertsConfigSchema.safeParse({ ...defaults, ...maybeDb });
        if (parsed.success) {
            const config = parsed.data;
            for (const key of Object.keys(maybeDb) as (keyof AlertsConfig)[]) {
                if (key in config) sources[key] = 'db';
            }
            return { config, sources };
        }
    }

    const legacyFallback = await getLegacyFallbackEnabled();
    if (typeof legacyFallback === 'boolean') {
        defaults.fallbackEnabled = legacyFallback;
    }

    const parsedDefaults = AlertsConfigSchema.parse(defaults);
    return { config: parsedDefaults, sources };
}

export async function updateAlertsConfigRuntime(
    partial: Partial<AlertsConfig>,
    actor?: { userId?: string | null; email?: string | null }
) {
    const current = await getEffectiveAlertsConfig();
    const merged = AlertsConfigSchema.parse({
        ...current.config,
        ...partial,
        version: 1,
    });

    await query(
        `INSERT INTO alert_runtime_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = NOW()`,
        [ALERTS_CONFIG_KEY, JSON.stringify(merged)]
    );

    await query(
        `INSERT INTO alert_runtime_config (key, value, updated_at)
         VALUES ('n8n_fallback_enabled', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = NOW()`,
        [JSON.stringify({ enabled: merged.fallbackEnabled })]
    );

    await query(
        `INSERT INTO alert_config_audit (changed_by, changed_email, previous_value, new_value, changed_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())`,
        [
            actor?.userId || null,
            actor?.email || null,
            JSON.stringify(current.config),
            JSON.stringify(merged),
        ]
    );

    return merged;
}

export async function canSendAlertTest(triggeredBy: string, cooldownSeconds: number): Promise<{
    allowed: boolean;
    remainingSeconds: number;
}> {
    const res = await query(
        `SELECT sent_at
         FROM alert_test_events
         WHERE triggered_by = $1
           AND success = true
         ORDER BY sent_at DESC
         LIMIT 1`,
        [triggeredBy]
    );

    const lastSentAt = res.rows[0]?.sent_at ? new Date(res.rows[0].sent_at).getTime() : 0;
    if (!lastSentAt) return { allowed: true, remainingSeconds: 0 };
    const elapsedSeconds = (Date.now() - lastSentAt) / 1000;
    if (elapsedSeconds >= cooldownSeconds) {
        return { allowed: true, remainingSeconds: 0 };
    }

    return {
        allowed: false,
        remainingSeconds: Math.max(1, Math.ceil(cooldownSeconds - elapsedSeconds)),
    };
}

export async function logAlertTestEvent(params: {
    triggeredBy: string;
    triggeredEmail: string;
    success: boolean;
    error?: string;
    payload?: unknown;
}) {
    const { triggeredBy, triggeredEmail, success, error, payload } = params;
    await query(
        `INSERT INTO alert_test_events (triggered_by, triggered_email, success, error, payload, sent_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
        [
            triggeredBy,
            triggeredEmail,
            success,
            error || null,
            payload ? JSON.stringify(payload) : null,
        ]
    );
}
