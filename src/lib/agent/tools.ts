import { tool, jsonSchema } from 'ai';
import { query } from '@/lib/db';
import { moveStopLossControlled, setTradeProtectionControlled } from '@/lib/trading/stop-loss';
import {
    cancelPendingLimitOrderControlled,
    editPendingLimitOrderControlled,
    getPendingLimitOrderById,
    listActivePendingLimitOrders,
} from '@/lib/trading/pending-limit-orders';

const ASSETS_BASE_URL = (process.env.ASSETS_BASE_URL || '').trim().replace(/\/+$/, '');

function toAssetUrl(pathOrUrl: string): string {
    if (!pathOrUrl.startsWith('/uploads/')) return pathOrUrl;
    return ASSETS_BASE_URL ? `${ASSETS_BASE_URL}${pathOrUrl}` : pathOrUrl;
}

/**
 * Tool: query_database
 * Ejecuta consultas SQL contra la base de datos.
 * 
 * NOTA IMPORTANTE: Se usa `inputSchema` (NO `parameters`) porque el AI SDK v6
 * internamente lee `tool.inputSchema` para obtener el JSON Schema que envía a OpenAI.
 * La función `tool()` simplemente retorna el objeto sin mapear, así que `parameters`
 * nunca se propaga y OpenAI recibía un schema vacío con type: "None".
 */
export const queryDatabase = tool({
    description: 'Ejecuta una consulta SQL contra la base de datos PostgreSQL. Usa esta herramienta para TODAS las operaciones de datos: leer saldos, registrar transacciones, consultar trades, etc.',
    inputSchema: jsonSchema({
        type: 'object',
        properties: {
            sql: { type: 'string', description: 'La consulta SQL SELECT, INSERT, UPDATE o DELETE a ejecutar.' },
        },
        required: ['sql'],
    }),
    execute: async ({ sql }: { sql: string }): Promise<{ success?: boolean; rowCount?: number; rows?: any[]; command?: string; error?: string; hint?: string }> => {
        console.log('[TOOL:queryDatabase] EXECUTING SQL:', sql);
        try {
            const forbidden = /\b(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;
            if (forbidden.test(sql)) {
                console.warn('[TOOL:queryDatabase] BLOCKED SQL:', sql);
                return { error: 'Operación no permitida. Solo SELECT, INSERT, UPDATE y DELETE están habilitados.' };
            }

            const result = await query(sql);
            console.log('[TOOL:queryDatabase] SUCCESS. Command:', result.command, 'Rows:', result.rowCount);

            if (result.command === 'SELECT') {
                return {
                    success: true,
                    rowCount: result.rowCount ?? undefined,
                    rows: result.rows.slice(0, 50),
                    hint: "Resultados obtenidos. Analízalos y responde al usuario en español mostrando los datos relevantes."
                };
            }

            return {
                success: true,
                command: result.command,
                rowCount: result.rowCount ?? undefined,
                hint: "Comando ejecutado. Confirma al usuario el resultado de la operación."
            };
        } catch (err: any) {
            console.error('[TOOL:queryDatabase] ERROR:', err.message);
            return { error: `Error SQL: ${err.message}` };
        }
    },
} as any);

/**
 * Genera las tools compartidas (Memoria).
 * Se llama en el route handler donde ya tenemos la sesión autenticada.
 */
export function createSharedTools(userId: string) {
    const saveMemory = tool({
        description: 'Guarda un hecho o dato importante del usuario para recordarlo en futuras conversaciones. Úsalo cuando detectes información relevante como preferencias, decisiones financieras, patrones de trading, etc.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                fact: { type: 'string', description: 'El hecho, dato o preferencia importante a guardar.' },
            },
            required: ['fact'],
        }),
        execute: async ({ fact }: { fact: string }) => {
            try {
                await query(
                    'INSERT INTO user_memories (user_id, fact, source) VALUES ($1, $2, $3)',
                    [userId, fact, 'react']
                );
                return { success: true, message: 'Hecho guardado en memoria.' };
            } catch (err: any) {
                return { error: `Error al guardar memoria: ${err.message}` };
            }
        },
    } as any);

    const searchMemories = tool({
        description: 'Busca en la memoria a largo plazo del usuario y en mensajes de conversaciones anteriores.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                searchTerm: { type: 'string', description: 'El término o frase para buscar en la memoria.' },
            },
            required: ['searchTerm'],
        }),
        execute: async ({ searchTerm }: { searchTerm: string }) => {
            try {
                const memoriesResult = await query(
                    `SELECT fact, created_at FROM user_memories 
           WHERE user_id = $1 AND fact ILIKE $2 
           ORDER BY created_at DESC LIMIT 10`,
                    [userId, `%${searchTerm}%`]
                );

                const messagesResult = await query(
                    `SELECT rcm.content, rcm.role, rcm.created_at, rcs.title as session_title
           FROM react_chat_messages rcm
           JOIN react_chat_sessions rcs ON rcm.session_id = rcs.id
           WHERE rcs.user_id = $1 AND rcm.content ILIKE $2
           ORDER BY rcm.created_at DESC LIMIT 10`,
                    [userId, `%${searchTerm}%`]
                );

                return {
                    memories: memoriesResult.rows,
                    messages: messagesResult.rows,
                    totalFound: (memoriesResult.rowCount || 0) + (messagesResult.rowCount || 0),
                };
            } catch (err: any) {
                return { error: `Error al buscar: ${err.message}` };
            }
        },
    } as any);

    return { save_memory: saveMemory, search_memories: searchMemories };
}

/**
 * Genera tools exclusivas de Trading (propose_live_trade).
 */
export function createTraderTools() {
    const proposeLiveTrade = tool({
        description: 'Propose a live trade on Binance Futures based on the analysis. ALWAYS provide a brief technical analysis in the assistant message BEFORE calling this tool. Use this tool only when you find a valid setup. It will display a card for the user to execute.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                analysis: { type: 'string', description: 'Análisis técnico breve y claro del setup. Requerido antes de la propuesta.' },
                symbol: { type: 'string', description: 'Trading pair symbol, e.g. ETHUSDT' },
                side: { type: 'string', enum: ['LONG', 'SHORT'], description: 'Direction of the trade' },
                leverage: { type: 'number', description: 'Leverage to use (1-125). Default 20.' },
                margin: { type: 'number', description: 'Margin amount in USDT. Default 12.' },
                reason: { type: 'string', description: 'Brief reason for the trade setup.' },
                stop_loss: { type: 'number', description: 'Suggested Stop Loss price.' },
                take_profit: { type: 'number', description: 'Suggested Take Profit price.' }
            },
            required: ['analysis', 'symbol', 'side', 'reason']
        }),
        execute: async (params: any) => {
            console.log("!!! [TOOLS] propose_live_trade EXECUTED !!!", JSON.stringify(params));
            return {
                success: true,
                proposal: params,
                message: `Trade proposal generated successfully for ${params.symbol} (${params.side}).`
            };
        }
    } as any);

    return { propose_live_trade: proposeLiveTrade };
}

/**
 * Tools de disciplina operacional (SL + contexto de sesión/riesgo).
 */
export function createDisciplineTools(userId: string) {
    const setTradeProtection = tool({
        description: 'Configura o actualiza la protección de un trade OPEN (SL obligatorio y TP opcional). Si ya existe SL, aplica reglas disciplinarias con override explícito.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                trade_id: { type: 'number', description: 'ID del trade a proteger.' },
                stop_loss: { type: 'number', description: 'Stop Loss objetivo (obligatorio).' },
                take_profit: { type: 'number', description: 'Take Profit opcional.' },
                source: { type: 'string', description: 'Origen de la acción (COPILOT, UI_POST_ENTRY, etc).' },
                override_risk_increase: { type: 'boolean', description: 'Permitir aumento de riesgo con justificación.' },
                override_reason: { type: 'string', description: 'Razón obligatoria cuando override_risk_increase=true (mín. 10).' },
            },
            required: ['trade_id', 'stop_loss'],
        }),
        execute: async (input: any) => {
            try {
                const result = await setTradeProtectionControlled({
                    tradeId: Number(input?.trade_id),
                    stopLoss: Number(input?.stop_loss),
                    takeProfit: input?.take_profit !== undefined ? Number(input.take_profit) : null,
                    source: typeof input?.source === 'string' ? input.source : 'COPILOT',
                    overrideRiskIncrease: Boolean(input?.override_risk_increase),
                    overrideReason: typeof input?.override_reason === 'string' ? input.override_reason : null,
                    actor: { type: 'copilot', id: userId },
                    action: 'SET_PROTECTION',
                });

                return {
                    ...result,
                    hint: 'Protección actualizada. Explica SL/TP aplicado, endpoint usado y si hubo fallback/override.',
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message || 'No se pudo configurar protección',
                    code: err?.code || 'SET_PROTECTION_FAILED',
                    details: err?.details || null,
                };
            }
        },
    } as any);

    const moveStopLoss = tool({
        description: 'Mueve el stop loss de un trade OPEN con reglas de disciplina. Bloquea aumentos de riesgo salvo override explícito con razón.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                trade_id: { type: 'number', description: 'ID del trade a modificar.' },
                new_stop_loss: { type: 'number', description: 'Nuevo precio de stop loss.' },
                source: { type: 'string', description: 'Origen de la acción (ej: COPILOT, UI_DRAG).' },
                override_risk_increase: { type: 'boolean', description: 'Permitir aumento de riesgo con justificación.' },
                override_reason: { type: 'string', description: 'Razón obligatoria cuando override_risk_increase=true (mín. 10).' },
            },
            required: ['trade_id', 'new_stop_loss'],
        }),
        execute: async (input: any) => {
            try {
                const result = await moveStopLossControlled({
                    tradeId: Number(input?.trade_id),
                    newStopLoss: Number(input?.new_stop_loss),
                    source: typeof input?.source === 'string' ? input.source : 'COPILOT',
                    overrideRiskIncrease: Boolean(input?.override_risk_increase),
                    overrideReason: typeof input?.override_reason === 'string' ? input.override_reason : null,
                    actor: { type: 'copilot', id: userId },
                });

                return {
                    ...result,
                    hint: 'Stop Loss actualizado con disciplina. Explica al usuario el tipo de movimiento y si hubo override.',
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message || 'No se pudo mover el Stop Loss',
                    code: err?.code || 'MOVE_STOP_LOSS_FAILED',
                    details: err?.details || null,
                };
            }
        },
    } as any);

    const getDisciplineContext = tool({
        description: 'Obtiene contexto disciplinario del día: sesión, balance, bloqueos y últimos movimientos SL.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                trade_id: { type: 'number', description: 'Trade opcional para traer su historial SL específico.' },
            },
            required: [],
        }),
        execute: async (input: any) => {
            try {
                const tradeId = Number(input?.trade_id || 0);
                const [sessionRes, snapshotRes, latestLossRes, slMovesRes, metricSnapshotsRes] = await Promise.all([
                    query(
                        `SELECT *
                         FROM trading_sessions
                         WHERE session_date = CURRENT_DATE
                         LIMIT 1`
                    ),
                    query(
                        `SELECT *
                         FROM account_snapshots
                         ORDER BY recorded_at DESC
                         LIMIT 1`
                    ),
                    query(
                        `SELECT id, simbolo, pnl_realizado, notas_aprendizaje, fecha_cierre
                         FROM trades_activos
                         WHERE estado = 'CLOSED'
                         ORDER BY fecha_cierre DESC NULLS LAST, id DESC
                         LIMIT 3`
                    ),
                    tradeId > 0
                        ? query(
                            `SELECT id, trade_id, original_sl, new_sl, direction, risk_increased, source, moved_at
                             FROM sl_movements
                             WHERE trade_id = $1
                             ORDER BY moved_at DESC
                             LIMIT 12`,
                            [tradeId]
                        )
                        : query(
                            `SELECT id, trade_id, original_sl, new_sl, direction, risk_increased, source, moved_at
                             FROM sl_movements
                             ORDER BY moved_at DESC
                             LIMIT 12`
                        ),
                    tradeId > 0
                        ? query(
                            `SELECT id, trade_id, recorded_at, price, stop_loss, take_profit, rr_actual, max_adverse_excursion, max_favorable_excursion
                             FROM trade_metric_snapshots
                             WHERE trade_id = $1
                             ORDER BY recorded_at DESC
                             LIMIT 30`,
                            [tradeId]
                        )
                        : query(
                            `SELECT id, trade_id, recorded_at, price, stop_loss, take_profit, rr_actual, max_adverse_excursion, max_favorable_excursion
                             FROM trade_metric_snapshots
                             ORDER BY recorded_at DESC
                             LIMIT 30`
                        ),
                ]);

                return {
                    success: true,
                    session_today: sessionRes.rows[0] || null,
                    latest_account_snapshot: snapshotRes.rows[0] || null,
                    latest_closed_trades: latestLossRes.rows,
                    recent_sl_movements: slMovesRes.rows,
                    recent_trade_snapshots: metricSnapshotsRes.rows,
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message || 'No se pudo consultar contexto disciplinario',
                };
            }
        },
    } as any);

    const editPendingLimitOrder = tool({
        description: 'Edita una orden LIMIT pendiente (no ejecutada) usando estrategia cancelar/recrear en Binance. Respeta disciplina: no aumentar riesgo de SL sin override explícito y motivo.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                pending_order_id: { type: 'number', description: 'ID de la orden LIMIT pendiente.' },
                entry_price: { type: 'number', description: 'Nuevo precio de entrada LIMIT.' },
                stop_loss: { type: 'number', description: 'Nuevo Stop Loss.' },
                take_profit: { type: 'number', description: 'Nuevo Take Profit opcional.' },
                margin: { type: 'number', description: 'Nuevo margen en USDT.' },
                leverage: { type: 'number', description: 'Nuevo leverage (1-125).' },
                source: { type: 'string', description: 'Origen de la acción (COPILOT, UI_PENDING_EDIT, etc).' },
                override_risk_increase: { type: 'boolean', description: 'Permitir aumento de riesgo de SL con justificación.' },
                override_reason: { type: 'string', description: 'Motivo obligatorio cuando override_risk_increase=true (mín. 10).' },
            },
            required: ['pending_order_id', 'entry_price', 'stop_loss', 'margin', 'leverage'],
        }),
        execute: async (input: any) => {
            try {
                const result = await editPendingLimitOrderControlled({
                    pendingOrderId: Number(input?.pending_order_id),
                    entryPrice: Number(input?.entry_price),
                    stopLoss: Number(input?.stop_loss),
                    takeProfit: input?.take_profit !== undefined ? Number(input.take_profit) : null,
                    margin: Number(input?.margin),
                    leverage: Number(input?.leverage),
                    source: typeof input?.source === 'string' ? input.source : 'COPILOT',
                    overrideRiskIncrease: Boolean(input?.override_risk_increase),
                    overrideReason: typeof input?.override_reason === 'string' ? input.override_reason : null,
                    actorType: 'copilot',
                    actorId: userId,
                });

                return {
                    ...result,
                    hint: 'Orden LIMIT pendiente actualizada. Explica el nuevo nivel de entrada/SL/TP y si hubo override disciplinario.',
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message || 'No se pudo editar la orden LIMIT pendiente',
                    code: err?.code || 'EDIT_PENDING_LIMIT_FAILED',
                    details: err?.details || null,
                };
            }
        },
    } as any);

    const cancelPendingLimitOrder = tool({
        description: 'Cancela una orden LIMIT pendiente (no ejecutada) en Binance y la marca como cancelada en el journal.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                pending_order_id: { type: 'number', description: 'ID de la orden LIMIT pendiente.' },
                reason: { type: 'string', description: 'Razón opcional de cancelación.' },
                source: { type: 'string', description: 'Origen de la acción (COPILOT, UI_PENDING_SECTION, etc).' },
            },
            required: ['pending_order_id'],
        }),
        execute: async (input: any) => {
            try {
                const result = await cancelPendingLimitOrderControlled({
                    pendingOrderId: Number(input?.pending_order_id),
                    source: typeof input?.source === 'string' ? input.source : 'COPILOT',
                    actorType: 'copilot',
                    actorId: userId,
                    reason: typeof input?.reason === 'string' ? input.reason : null,
                });

                return {
                    ...result,
                    hint: 'Orden LIMIT cancelada. Indica que no se creó trade y que quedó fuera de la lista activa.',
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message || 'No se pudo cancelar la orden LIMIT pendiente',
                    code: err?.code || 'CANCEL_PENDING_LIMIT_FAILED',
                    details: err?.details || null,
                };
            }
        },
    } as any);

    const getPendingLimitContext = tool({
        description: 'Obtiene contexto de órdenes LIMIT pendientes, su estado de disciplina y eventos recientes (ediciones/cancelaciones/fill).',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                pending_order_id: { type: 'number', description: 'ID opcional para traer una orden pendiente específica.' },
            },
            required: [],
        }),
        execute: async (input: any) => {
            try {
                const pendingOrderId = Number(input?.pending_order_id || 0);
                const [pending, events, sessionRes, snapshotRes] = await Promise.all([
                    pendingOrderId > 0
                        ? getPendingLimitOrderById(pendingOrderId)
                        : listActivePendingLimitOrders(),
                    pendingOrderId > 0
                        ? query(
                            `SELECT id, pending_order_id, event_type, actor_type, actor_id, reason, metadata, created_at
                             FROM pending_limit_order_events
                             WHERE pending_order_id = $1
                             ORDER BY created_at DESC
                             LIMIT 30`,
                            [pendingOrderId]
                        )
                        : query(
                            `SELECT id, pending_order_id, event_type, actor_type, actor_id, reason, metadata, created_at
                             FROM pending_limit_order_events
                             ORDER BY created_at DESC
                             LIMIT 50`
                        ),
                    query(
                        `SELECT *
                         FROM trading_sessions
                         WHERE session_date = CURRENT_DATE
                         LIMIT 1`
                    ),
                    query(
                        `SELECT *
                         FROM account_snapshots
                         ORDER BY recorded_at DESC
                         LIMIT 1`
                    ),
                ]);

                return {
                    success: true,
                    pending_order: pendingOrderId > 0 ? pending : null,
                    active_pending_orders: pendingOrderId > 0 ? null : pending,
                    recent_pending_events: events.rows,
                    session_today: sessionRes.rows[0] || null,
                    latest_account_snapshot: snapshotRes.rows[0] || null,
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message || 'No se pudo consultar el contexto de órdenes LIMIT pendientes',
                };
            }
        },
    } as any);

    return {
        set_trade_protection: setTradeProtection,
        move_stop_loss: moveStopLoss,
        get_discipline_context: getDisciplineContext,
        edit_pending_limit_order: editPendingLimitOrder,
        cancel_pending_limit_order: cancelPendingLimitOrder,
        get_pending_limit_context: getPendingLimitContext,
    };
}

/**
 * Genera tools específicas para trades (save_trade_screenshot).
 * Se llama cuando chatSession.trade_id existe.
 */
export function createTradeTools(tradeId: number, pendingImageBase64: string | null, lastImageUrl?: string | null) {
    const saveTradeScreenshot = tool({
        description: 'Guarda una imagen como screenshot/gráfico del trade actual. Usa esta herramienta cuando el usuario te envíe una imagen y pida vincularla al trade. La imagen que el usuario envió ya está disponible para ser guardada.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                description: { type: 'string', description: 'Descripción breve de la imagen para referencia futura.' },
            },
            required: [],
        }),
        execute: async ({ description }: { description?: string }) => {
            try {
                const { writeFile, readFile, mkdir } = await import('fs/promises');
                const { join } = await import('path');

                let fullUrl: string;

                if (pendingImageBase64) {
                    // --- Caso A: imagen nueva enviada en este turno (Data URI) ---
                    let base64Data = pendingImageBase64;
                    let mimeType = 'image/png';
                    if (pendingImageBase64.startsWith('data:')) {
                        const match = pendingImageBase64.match(/^data:([^;]+);base64,(.+)$/);
                        if (match) { mimeType = match[1]; base64Data = match[2]; }
                    }
                    const extMap: Record<string, string> = {
                        'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
                        'image/webp': 'webp', 'image/gif': 'gif',
                    };
                    const ext = extMap[mimeType] || 'png';
                    const uploadDir = join(process.cwd(), 'public', 'uploads', 'trades');
                    await mkdir(uploadDir, { recursive: true });
                    const filename = `trade_${tradeId}_${Date.now()}.${ext}`;
                    const filepath = join(uploadDir, filename);
                    await writeFile(filepath, Buffer.from(base64Data, 'base64'));
                    fullUrl = toAssetUrl(`/uploads/trades/${filename}`);

                } else if (lastImageUrl && typeof lastImageUrl === 'string') {
                    // --- Caso B: imagen del historial ya guardada en /uploads/chat-images/ ---
                    // Copiarla a /uploads/trades/ y generar URL de assets
                    if (lastImageUrl.startsWith('/uploads/')) {
                        const srcPath = join(process.cwd(), 'public', lastImageUrl);
                        const ext = lastImageUrl.split('.').pop() || 'png';
                        const uploadDir = join(process.cwd(), 'public', 'uploads', 'trades');
                        await mkdir(uploadDir, { recursive: true });
                        const filename = `trade_${tradeId}_${Date.now()}.${ext}`;
                        const destPath = join(uploadDir, filename);
                        const buf = await readFile(srcPath);
                        await writeFile(destPath, buf);
                        fullUrl = toAssetUrl(`/uploads/trades/${filename}`);
                    } else if (lastImageUrl.startsWith('http')) {
                        // Ya es una URL absoluta, usarla directamente
                        fullUrl = lastImageUrl;
                    } else {
                        return { error: 'No hay ninguna imagen disponible para vincular al trade. El usuario debe enviar una imagen primero.' };
                    }
                } else {
                    return { error: 'No hay ninguna imagen disponible para vincular al trade. El usuario debe enviar una imagen primero.' };
                }

                // Actualizar screenshot_url en la base de datos
                await query(
                    'UPDATE trades_activos SET screenshot_url = $1 WHERE id = $2',
                    [fullUrl, tradeId]
                );

                return {
                    success: true,
                    message: `Screenshot guardado y vinculado al trade #${tradeId}.`,
                    url: fullUrl,
                    description: description || 'Screenshot del trade',
                    hint: "CRÍTICO: La imagen se guardó correctamente. AHORA MISMO debes generar un párrafo de texto para decirle al usuario que la imagen ya se vinculó."
                };
            } catch (err: any) {
                return { error: `Error al guardar screenshot: ${err.message}` };
            }
        },
    } as any);

    return { save_trade_screenshot: saveTradeScreenshot };
}

/**
 * Tools específicas para órdenes LIMIT pendientes.
 * Permite guardar screenshot/análisis antes del fill.
 */
export function createPendingLimitTools(pendingOrderId: number, pendingImageBase64: string | null, lastImageUrl?: string | null) {
    const savePendingLimitScreenshot = tool({
        description: 'Guarda una imagen como evidencia de análisis en la orden LIMIT pendiente actual.',
        inputSchema: jsonSchema({
            type: 'object',
            properties: {
                description: { type: 'string', description: 'Descripción breve de la imagen.' },
            },
            required: [],
        }),
        execute: async ({ description }: { description?: string }) => {
            try {
                const { writeFile, readFile, mkdir } = await import('fs/promises');
                const { join } = await import('path');

                let fullUrl: string;

                if (pendingImageBase64) {
                    let base64Data = pendingImageBase64;
                    let mimeType = 'image/png';
                    if (pendingImageBase64.startsWith('data:')) {
                        const match = pendingImageBase64.match(/^data:([^;]+);base64,(.+)$/);
                        if (match) { mimeType = match[1]; base64Data = match[2]; }
                    }
                    const extMap: Record<string, string> = {
                        'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
                        'image/webp': 'webp', 'image/gif': 'gif',
                    };
                    const ext = extMap[mimeType] || 'png';
                    const uploadDir = join(process.cwd(), 'public', 'uploads', 'pending-limits');
                    await mkdir(uploadDir, { recursive: true });
                    const filename = `pending_limit_${pendingOrderId}_${Date.now()}.${ext}`;
                    const filepath = join(uploadDir, filename);
                    await writeFile(filepath, Buffer.from(base64Data, 'base64'));
                    fullUrl = toAssetUrl(`/uploads/pending-limits/${filename}`);
                } else if (lastImageUrl && typeof lastImageUrl === 'string') {
                    if (lastImageUrl.startsWith('/uploads/')) {
                        const srcPath = join(process.cwd(), 'public', lastImageUrl);
                        const ext = lastImageUrl.split('.').pop() || 'png';
                        const uploadDir = join(process.cwd(), 'public', 'uploads', 'pending-limits');
                        await mkdir(uploadDir, { recursive: true });
                        const filename = `pending_limit_${pendingOrderId}_${Date.now()}.${ext}`;
                        const destPath = join(uploadDir, filename);
                        const buf = await readFile(srcPath);
                        await writeFile(destPath, buf);
                        fullUrl = toAssetUrl(`/uploads/pending-limits/${filename}`);
                    } else if (lastImageUrl.startsWith('http')) {
                        fullUrl = lastImageUrl;
                    } else {
                        return { error: 'No hay imagen disponible para vincular a la orden LIMIT pendiente.' };
                    }
                } else {
                    return { error: 'No hay imagen disponible para vincular a la orden LIMIT pendiente.' };
                }

                await query(
                    'UPDATE pending_limit_orders SET screenshot_url = $1, updated_at = NOW() WHERE id = $2',
                    [fullUrl, pendingOrderId]
                );

                await query(
                    `INSERT INTO pending_limit_order_events (
                        pending_order_id, event_type, actor_type, reason, payload_after, metadata, created_at
                     ) VALUES ($1, 'edited', 'copilot', $2, '{}'::jsonb, $3::jsonb, NOW())`,
                    [
                        pendingOrderId,
                        'Screenshot vinculado por Copilot',
                        JSON.stringify({ screenshot_url: fullUrl }),
                    ]
                ).catch(() => undefined);

                return {
                    success: true,
                    message: `Screenshot guardado y vinculado a la orden LIMIT pendiente #${pendingOrderId}.`,
                    url: fullUrl,
                    description: description || 'Screenshot de orden LIMIT pendiente',
                    hint: 'Confirma al usuario que la evidencia quedó guardada en la orden pendiente.',
                };
            } catch (err: any) {
                return { error: `Error al guardar screenshot de orden pendiente: ${err.message}` };
            }
        },
    } as any);

    return { save_pending_limit_screenshot: savePendingLimitScreenshot };
}
