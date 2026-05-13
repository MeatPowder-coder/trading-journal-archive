/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('Missing DATABASE_URL');
        process.exit(1);
    }

    const files = [
        path.join(process.cwd(), 'migrations', '005_create_alerting_tables.sql'),
        path.join(process.cwd(), 'migrations', '006_backfill_tipo_estrategia_binance_open.sql'),
        path.join(process.cwd(), 'migrations', '007_alerts_runtime_config_v1.sql'),
        path.join(process.cwd(), 'migrations', '008_alerts_telegram_replace_last.sql'),
    ];

    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();

    try {
        for (const file of files) {
            const sql = fs.readFileSync(file, 'utf8');
            console.log(`[apply-alerts-sql] Applying ${path.basename(file)}...`);
            await client.query(sql);
            console.log(`[apply-alerts-sql] Applied ${path.basename(file)}`);
        }
        console.log('[apply-alerts-sql] Done');
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('[apply-alerts-sql] Failed:', err?.message || err);
    process.exit(1);
});
