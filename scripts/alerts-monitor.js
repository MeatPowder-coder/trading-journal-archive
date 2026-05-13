/* eslint-disable no-console */

const DEFAULT_INTERVAL_MS = 60_000;

const baseUrl = process.env.ALERTS_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const token = process.env.ALERTS_INTERNAL_TOKEN || '';
const intervalMs = Number(process.env.ALERTS_INTERVAL_MS || DEFAULT_INTERVAL_MS);

if (!token) {
    console.error('Missing ALERTS_INTERNAL_TOKEN env var.');
    process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs < 10_000) {
    console.error('ALERTS_INTERVAL_MS must be a number >= 10000');
    process.exit(1);
}

async function runCheck() {
    const url = `${baseUrl.replace(/\/$/, '')}/api/alerts/check`;
    const started = Date.now();

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-alerts-token': token,
            },
        });

        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
            console.error(`[alerts-monitor] ${new Date().toISOString()} FAILED ${res.status}`, body);
            return;
        }

        const elapsed = Date.now() - started;
        console.log(`[alerts-monitor] ${new Date().toISOString()} OK ${elapsed}ms`, body.summary || body);
    } catch (err) {
        console.error(`[alerts-monitor] ${new Date().toISOString()} ERROR`, err?.message || err);
    }
}

async function main() {
    console.log(`[alerts-monitor] starting with interval=${intervalMs}ms baseUrl=${baseUrl}`);
    await runCheck();
    setInterval(runCheck, intervalMs);
}

main().catch((err) => {
    console.error('[alerts-monitor] fatal', err);
    process.exit(1);
});

