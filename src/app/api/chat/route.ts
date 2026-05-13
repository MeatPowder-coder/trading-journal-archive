import { NextRequest } from 'next/server';
import { streamText, stepCountIs, convertToModelMessages } from 'ai';
import { google } from '@ai-sdk/google';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { queryDatabase, createSharedTools, createTraderTools, createTradeTools, createDisciplineTools, createPendingLimitTools } from '@/lib/agent/tools';
import { getTradePrompt, getTraderPrompt, getAccountantPrompt, getPendingLimitPrompt } from '@/lib/agent/system-prompts';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { normalizeMediaUrl } from '@/lib/media-url';

export const maxDuration = 60;
const DEFAULT_KIMI_MODEL_ID = 'moonshotai/kimi-k2.5';
const DEFAULT_CHAT_MODEL_ID = 'gemini-3.1-flash-lite-preview';
function resolveModelAlias(modelId: string): string {
    const aliases: Record<string, string> = {
        // Legacy or unstable aliases mapped to stable runtime IDs.
        'gemini-3-flash-preview': 'gemini-2.5-flash',
        // Keep UI naming while routing to a known Lite model for reliability.
        'gemini-3.1-flash-lite-preview': 'gemini-2.5-flash-lite',
    };
    return aliases[modelId] || modelId;
}

/**
 * Helper: Determina el modelo adecuado según el ID.
 */
function getModel(modelId: string): any {
    const resolvedModelId = resolveModelAlias(modelId);

    // Alias interno "kimi-k2.5" -> modelo configurable en NVIDIA.
    const kimiModel = process.env.KIMI_MODEL_ID || DEFAULT_KIMI_MODEL_ID;

    if (resolvedModelId === 'kimi-k2.5' || resolvedModelId === kimiModel) {
        const nvidiaApiKey = (process.env.NVIDIA_API_KEY || '').trim();
        if (!nvidiaApiKey) {
            // Fallback preventivo: si no hay credencial NVIDIA en runtime, usar Gemini.
            return google('gemini-2.5-flash');
        }

        const nvidia = createOpenAI({
            baseURL: process.env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1',
            apiKey: nvidiaApiKey,
            name: 'nvidia',
        });
        // For NVIDIA NIM, force chat.completions path for better multimodal compatibility.
        return nvidia.chat(kimiModel);
    }

    // Permitir fallback para modelos gpt-*
    if (resolvedModelId.startsWith('gpt-')) {
        return openai(resolvedModelId);
    }
    // Default: Gemini
    return google(resolvedModelId);
}

/**
 * Helper: Carga una imagen local como Buffer si es un path relativo.
 */
async function getImageData(url: string): Promise<string | Buffer | URL> {
    if (url.startsWith('/uploads/')) {
        try {
            const filePath = join(process.cwd(), 'public', url);
            const buffer = await readFile(filePath);
            return buffer;
        } catch (error) {
            console.error(`Error loading local image ${url}:`, error);
            // Fallback: return URL (might fail if relative)
            return url;
        }
    } else if (url.startsWith('http')) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
            const arrayBuffer = await res.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.error(`Error downloading remote image ${url}:`, error);
            return url;
        }
    }
    return url;
}

/**
 * Helper: Save base64 image to public/uploads/chat-images
 */
async function saveChatImage(base64Data: string, sessionId: string): Promise<string | null> {
    try {
        // Remove header if present (data:image/png;base64,...)
        const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return null;
        }

        const ext = matches[1];
        const data = matches[2];
        const buffer = Buffer.from(data, 'base64');

        const timestamp = Date.now();
        const filename = `chat_${sessionId}_${timestamp}.${ext}`;
        const relativePath = `/uploads/chat-images/${filename}`;
        const absolutePath = join(process.cwd(), 'public', 'uploads', 'chat-images', filename);

        // Ensure dir exists
        await mkdir(join(process.cwd(), 'public', 'uploads', 'chat-images'), { recursive: true });

        await writeFile(absolutePath, buffer);
        console.log(`Saved chat image to ${absolutePath}`);

        return relativePath;
    } catch (error) {
        console.error("Error saving chat image:", error);
        return null;
    }
}

function extractUserText(msg: any): string {
    if (!msg) return '';
    if (Array.isArray(msg.parts)) {
        return msg.parts
            .filter((c: any) => c?.type === 'text' && typeof c?.text === 'string')
            .map((c: any) => c.text)
            .join('\n')
            .trim();
    }
    if (typeof msg.content === 'string') return msg.content.trim();
    if (Array.isArray(msg.content)) {
        return msg.content
            .filter((c: any) => c?.type === 'text' && typeof c?.text === 'string')
            .map((c: any) => c.text)
            .join('\n')
            .trim();
    }
    return '';
}

async function autoUpdateTradeFromUserText(tradeId: number, text: string): Promise<void> {
    const raw = (text || '').trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    const updates: Record<string, any> = {};

    // ENUM mappings
    if (/\b(bajista)\b/.test(lower)) updates.tendencia_macro = 'BAJISTA';
    else if (/\b(alcista)\b/.test(lower)) updates.tendencia_macro = 'ALCISTA';
    else if (/\b(lateral)\b/.test(lower)) updates.tendencia_macro = 'LATERAL';

    if (/\b(consolidaci[oó]n)\b/.test(lower)) updates.contexto_mercado = 'CONSOLIDACION';
    else if (/\b(rango|lateral)\b/.test(lower)) updates.contexto_mercado = 'RANGO';
    else if (/\b(impulso|tendencia alcista)\b/.test(lower)) updates.contexto_mercado = 'TENDENCIA_ALCISTA';
    else if (/\b(tendencia bajista)\b/.test(lower)) updates.contexto_mercado = 'TENDENCIA_BAJISTA';

    if (/\b(volatilidad)?\s*alta\b/.test(lower)) updates.volatilidad = 'ALTA';
    else if (/\b(volatilidad)?\s*media\b/.test(lower)) updates.volatilidad = 'MEDIA';
    else if (/\b(volatilidad)?\s*baja\b/.test(lower)) updates.volatilidad = 'BAJA';

    if (/sweep\s+of?\s*highs|sweep\s+highs|barrida\s+de\s+highs/.test(lower)) updates.tipo_liquidez = 'SWEEP_HIGHS';
    else if (/sweep\s+of?\s*lows|sweep\s+lows|barrida\s+de\s+lows/.test(lower)) updates.tipo_liquidez = 'SWEEP_LOWS';
    else if (/\binducement\b/.test(lower)) updates.tipo_liquidez = 'INDUCEMENT';
    else if (/\b(sin liquidez|ninguna liquidez|ninguna)\b/.test(lower)) updates.tipo_liquidez = 'NINGUNA';

    if (/\bdelta\s+negativ[oa]\b|\bse torn[oó] negativo\b/.test(lower)) updates.estado_delta = 'NEGATIVO';
    else if (/\bdelta\s+positiv[oa]\b/.test(lower)) updates.estado_delta = 'POSITIVO';
    else if (/\bdivergent[ea]|divergencia\b/.test(lower)) updates.estado_delta = 'DIVERGENTE';
    else if (/\bdelta\s+neutr[oa]\b/.test(lower)) updates.estado_delta = 'NEUTRO';

    if (/\bmucho volumen\b/.test(lower)) updates.volumen_estado = 'MUCHO_VOLUMEN';
    else if (/\bpoco volumen\b/.test(lower)) updates.volumen_estado = 'POCO_VOLUMEN';
    else if (/\bvolumen normal\b/.test(lower)) updates.volumen_estado = 'NORMAL';

    if (/\bno segu[ií]\s+las reglas\b|\bromp[ií]\s+las reglas\b/.test(lower)) updates.calificacion_personal = 'ROMPI_REGLAS';
    else if (/\bsegu[ií]\s+las reglas\b/.test(lower)) updates.calificacion_personal = 'SEGUI_REGLAS';

    // Free-text fields
    const timeframeMatch = raw.match(/\b(\d+\s?(?:m|h|d|w))\b/i);
    if (timeframeMatch) updates.timeframe = timeframeMatch[1].replace(/\s+/g, '');

    const setupTagMatch = raw.match(/(?:setup\s*tag|setup)\s*[:=]\s*([A-Za-z0-9_\-\/]+)/i);
    if (setupTagMatch) updates.setup_tag = setupTagMatch[1];

    const zonaMatch = raw.match(/(?:zona\s+de\s+entrada|zona\s+entrada)\s*[:=]\s*([^\n,.]+)/i);
    if (zonaMatch) updates.zona_entrada = zonaMatch[1].trim();

    if (/\bansiedad|ansios[oa]\b/.test(lower)) updates.emocion_entrada = 'ANSIEDAD';
    else if (/\bconfiad[oa]\b/.test(lower)) updates.emocion_entrada = 'CONFIADO';
    else if (/\bdudos[oa]\b/.test(lower)) updates.emocion_entrada = 'DUDOSO';

    const slMatch = raw.match(/(?:stop\s*loss|sl)\s*(?:de|:|=)?\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (slMatch) updates.stop_loss = parseFloat(slMatch[1].replace(',', '.'));
    const tpMatch = raw.match(/(?:take\s*profit|tp)\s*(?:de|:|=)?\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (tpMatch) updates.take_profit = parseFloat(tpMatch[1].replace(',', '.'));

    const keys = Object.keys(updates);
    if (keys.length === 0) return;

    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = keys.map((k) => updates[k]);
    await query(
        `UPDATE trades_activos SET ${setClause} WHERE id = $${keys.length + 1}`,
        [...values, tradeId]
    );
    console.log('[CHAT POST] Auto-updated trade fields from user text:', keys.join(', '));
}

export async function POST(req: NextRequest) {
    try {
        // Auth
        const session = await getAuthSession();
        if (!session) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { messages, sessionId, model } = await req.json();
        const currentModel = model || DEFAULT_CHAT_MODEL_ID;

        // Validar sesión y obtener agent_type
        const sessionResult = await query(
            'SELECT id, trade_id, pending_limit_order_id, agent_type FROM react_chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId || '', session.userId]
        );

        if (sessionResult.rowCount === 0) {
            return new Response('Session not found', { status: 404 });
        }

        const chatSession = sessionResult.rows[0];
        const sessionTradeId = Number(chatSession?.trade_id || 0) > 0 ? Number(chatSession.trade_id) : null;
        const sessionPendingLimitOrderId = Number(chatSession?.pending_limit_order_id || 0) > 0
            ? Number(chatSession.pending_limit_order_id)
            : null;
        const agentType = chatSession.agent_type || 'TRADER';

        let systemPrompt = agentType === 'ACCOUNTANT'
            ? await getAccountantPrompt()
            : await getTraderPrompt();

        // Base Tools (Universal): SQL + Memory
        let tools: any = {
            query_database: queryDatabase,
            ...createSharedTools(session.userId)
        };

        // Trader Tools (Only for TRADER agent)
        if (agentType === 'TRADER') {
            tools = {
                ...tools,
                ...createTraderTools(),
                ...createDisciplineTools(session.userId),
            };
        }
        let pendingImageBase64: string | null = null;
        const imageUrlsForHistory: string[] = [];
        let lastImageUrlForPersistence: string | null = null;
        let lastImageUrlForContext: string | null = null;
        let lastImageMediaType: string | null = null;

        function getMediaTypeFromDataUrl(url: string): string | null {
            const match = url.match(/^data:([^;]+);base64,/);
            return match ? match[1] : null;
        }

        async function normalizeMessages(input: any[]): Promise<any[]> {
            const arr = input || [];

            /** Index of the last user message — only its images are resolved to base64 */
            const lastUserIdx = arr.reduce((acc: number, m: any, i: number) => m?.role === 'user' ? i : acc, -1);

            /** Convert a local /uploads/ path to a base64 Data URI */
            async function resolveLocalToDataUri(url: string, mediaType: string): Promise<string | null> {
                try {
                    const filePath = join(process.cwd(), 'public', url);
                    const buf = await readFile(filePath);
                    return `data:${mediaType};base64,${buf.toString('base64')}`;
                } catch {
                    return null; // file not found → skip
                }
            }

            const results = await Promise.all(arr.map(async (m: any, idx: number) => {
                const isLastUser = idx === lastUserIdx;

                // Messages with a pre-built parts array (AI SDK v5 / useChat format)
                if (Array.isArray(m?.parts)) {
                    const resolvedParts: any[] = [];
                    for (const part of m.parts) {
                        if (part?.type === 'file') {
                            const mediaType = String(part?.mediaType || '');
                            const isImage = mediaType.startsWith('image/');
                            const partUrl = typeof part?.url === 'string' ? part.url : '';

                            // Evitar re-adjuntar imágenes históricas en cada turno.
                            // Solo la imagen del último mensaje del usuario viaja al modelo.
                            if (!isLastUser && (isImage || partUrl.startsWith('data:image/'))) {
                                continue;
                            }

                            if (partUrl.startsWith('/uploads/')) {
                                if (isLastUser) {
                                    // Last user message: resolve to base64 so Gemini can process it
                                    const fileMediaType = part.mediaType || 'image/png';
                                    const dataUri = await resolveLocalToDataUri(partUrl, fileMediaType);
                                    if (dataUri) resolvedParts.push({ ...part, url: dataUri });
                                    // If file read fails, we skip it (don't send a broken part)
                                }
                                // Historical messages: drop local file parts — the AI's text already
                                // captures the prior analysis; re-sending big base64 blobs on every
                                // request bloats the payload and causes timeouts.
                            } else {
                                resolvedParts.push(part);
                            }
                        } else {
                            resolvedParts.push(part);
                        }
                    }
                    return { ...m, parts: resolvedParts };
                }

                // Messages using content string / content array (legacy format)
                const parts: any[] = [];

                if (typeof m?.content === 'string') {
                    if (m.content.length > 0) parts.push({ type: 'text', text: m.content });
                } else if (Array.isArray(m?.content)) {
                    for (const part of m.content) {
                        if (part?.type === 'text' && typeof part.text === 'string') {
                            parts.push({ type: 'text', text: part.text });
                        } else if ((part?.type === 'image' || part?.type === 'file') && part.image) {
                            const mediaType = part.mediaType || getMediaTypeFromDataUrl(part.image) || 'image/png';
                            let url = part.image;
                            if (!isLastUser && (mediaType.startsWith('image/') || String(url).startsWith('data:image/'))) {
                                continue;
                            }
                            if (typeof url === 'string' && url.startsWith('/uploads/')) {
                                if (!isLastUser) continue; // skip historical
                                url = (await resolveLocalToDataUri(url, mediaType)) ?? url;
                            }
                            parts.push({ type: 'file', mediaType, url });
                        } else if (part?.type === 'file' && part.url) {
                            const mediaType = part.mediaType || getMediaTypeFromDataUrl(part.url) || 'application/octet-stream';
                            let url = part.url;
                            if (!isLastUser && (String(mediaType).startsWith('image/') || String(url).startsWith('data:image/'))) {
                                continue;
                            }
                            if (typeof url === 'string' && url.startsWith('/uploads/')) {
                                if (!isLastUser) continue; // skip historical
                                url = (await resolveLocalToDataUri(url, mediaType)) ?? url;
                            }
                            parts.push({ type: 'file', mediaType, url, filename: part.filename });
                        }
                    }
                }

                if (Array.isArray(m?.experimental_attachments)) {
                    for (const att of m.experimental_attachments) {
                        if (att?.url && att?.contentType) {
                            let url = att.url;
                            if (typeof url === 'string' && url.startsWith('/uploads/')) {
                                if (!isLastUser) continue;
                                url = (await resolveLocalToDataUri(url, att.contentType)) ?? url;
                            }
                            parts.push({ type: 'file', mediaType: att.contentType, url, filename: att.name });
                        }
                    }
                }

                return { ...m, parts };
            }));
            return results;
        }


        const normalizedMessages = await normalizeMessages(messages);

        // Detectar si el usuario envió una imagen en este turno (para las tools y persistencia).
        // IMPORTANTE: usar `messages` original (NO normalizedMessages) para preservar las URLs /uploads/
        // limpias; normalizedMessages convierte esas rutas a Data URIs solo para el SDK de AI.
        const rawLastMsg = (messages || [])[messages.length - 1];
        if (rawLastMsg?.role === 'user') {
            const rawParts: any[] = Array.isArray(rawLastMsg.parts)
                ? rawLastMsg.parts
                : Array.isArray(rawLastMsg.content)
                    ? rawLastMsg.content
                    : [];

            for (const part of rawParts) {
                if (part?.type === 'file' && typeof part.url === 'string' && part.mediaType?.startsWith('image/')) {
                    lastImageMediaType = part.mediaType;

                    if (part.url.startsWith('data:')) {
                        // Nueva imagen: guardar a disco
                        pendingImageBase64 = part.url;
                        const savedUrl = await saveChatImage(part.url, sessionId);
                        if (savedUrl) {
                            imageUrlsForHistory.push(savedUrl);
                            lastImageUrlForPersistence = savedUrl;
                            lastImageUrlForContext = savedUrl;
                        } else {
                            // Si no se pudo guardar en disco, no persistimos Data URI en la BD.
                            lastImageUrlForContext = part.url;
                        }
                    } else {
                        // Imagen ya guardada (URL local /uploads/ o http) — en el turno actual
                        const normalizedUrl = normalizeMediaUrl(part.url) || part.url;
                        imageUrlsForHistory.push(normalizedUrl);
                        lastImageUrlForPersistence = normalizedUrl;
                        lastImageUrlForContext = normalizedUrl;
                    }
                }
            }
        }

        // Si no se encontró imagen en el mensaje actual, buscar la última imagen del historial completo.
        // Esto permite que el modelo vincule la imagen aunque el usuario envíe solo texto en este turno.
        if (!lastImageUrlForContext) {
            for (let i = (messages || []).length - 1; i >= 0; i--) {
                const msg = messages[i];
                const parts: any[] = Array.isArray(msg?.parts)
                    ? msg.parts
                    : Array.isArray(msg?.content) ? msg.content : [];
                let found = false;
                for (const part of parts) {
                    if (part?.type === 'file' && typeof part.url === 'string'
                        && part.url.startsWith('/uploads/')
                        && part.mediaType?.startsWith('image/')) {
                        lastImageUrlForContext = normalizeMediaUrl(part.url) || part.url;
                        lastImageMediaType = part.mediaType;
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }

        function messageHasImagePart(msg: any): boolean {
            return Array.isArray(msg?.parts)
                && msg.parts.some((p: any) => p?.type === 'file' && typeof p?.mediaType === 'string' && p.mediaType.startsWith('image/'));
        }

        async function toDataUriIfLocal(url: string, mediaType: string): Promise<string> {
            if (!url.startsWith('/uploads/')) return url;
            try {
                const filePath = join(process.cwd(), 'public', url);
                const buf = await readFile(filePath);
                return `data:${mediaType};base64,${buf.toString('base64')}`;
            } catch {
                return url;
            }
        }

        // If the user asks follow-up analysis in a trade chat without re-uploading the image,
        // inject the latest known trade image into the last user message for model context.
        let modelInputMessages = normalizedMessages;
        if ((sessionTradeId || sessionPendingLimitOrderId) && lastImageUrlForContext && normalizedMessages.length > 0) {
            const lastIdx = normalizedMessages.length - 1;
            const lastNormalized = normalizedMessages[lastIdx];
            if (lastNormalized?.role === 'user' && !messageHasImagePart(lastNormalized)) {
                const mediaType = lastImageMediaType || getMediaTypeFromDataUrl(lastImageUrlForContext) || 'image/png';
                const imageUrlForModel = await toDataUriIfLocal(lastImageUrlForContext, mediaType);
                modelInputMessages = normalizedMessages.map((m, idx) => {
                    if (idx !== lastIdx) return m;
                    const existingParts = Array.isArray(m?.parts) ? m.parts : [];
                    return {
                        ...m,
                        parts: [
                            ...existingParts,
                            {
                                type: 'file',
                                mediaType,
                                url: imageUrlForModel,
                                filename: 'trade-context-image',
                            },
                        ],
                    };
                });
                console.log('[CHAT POST] Injected context image into last user turn for model analysis.');
            }
        }



        const userPlainText = extractUserText(rawLastMsg);

        // Persistir mensaje del usuario
        const lastUserMsg = rawLastMsg;
        console.log(`[CHAT POST] Processing last message role=${lastUserMsg.role}`);

        if (lastUserMsg.role === 'user') {
            console.log(`[CHAT POST] Full lastUserMsg:`, JSON.stringify(lastUserMsg));
            if (Array.isArray(lastUserMsg.parts)) {
                console.log(`[CHAT POST] Parts array:`, JSON.stringify(lastUserMsg.parts));
            } else if (Array.isArray(lastUserMsg.content)) {
                console.log(`[CHAT POST] Content array:`, JSON.stringify(lastUserMsg.content));
            }
            let contentStr = userPlainText;

            console.log(`[CHAT POST] Extracted contentStr: "${contentStr}"`);

            // Append images as Markdown to persist them in history
            if (imageUrlsForHistory.length > 0) {
                const imageMarkdown = imageUrlsForHistory.map(url => `\n![User Image](${url})`).join('');
                contentStr += imageMarkdown;
            }

            if (contentStr) {
                const insertRes = await query(
                    'INSERT INTO react_chat_messages (session_id, role, content, file_url, file_type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [sessionId, 'user', contentStr, lastImageUrlForPersistence, lastImageMediaType]
                );
                console.log(`[CHAT POST] User message inserted ID=${insertRes.rows[0]?.id}`);
            } else {
                console.warn(`[CHAT POST] contentStr is empty, skipping insert.`);
            }
        }

        // --- LÓGICA DE CONTEXTO (TRADE O PENDING LIMIT) ---
        if (sessionTradeId) {
            if (lastUserMsg?.role === 'user' && userPlainText) {
                try {
                    await autoUpdateTradeFromUserText(sessionTradeId, userPlainText);
                } catch (autoUpdateErr) {
                    console.error('Auto-update trade fields error:', autoUpdateErr);
                }
            }

            const tradeRes = await query(
                `SELECT * FROM trades_activos WHERE id = $1`,
                [sessionTradeId]
            );

            if ((tradeRes.rowCount ?? 0) > 0) {
                const trade = tradeRes.rows[0];
                systemPrompt = await getTradePrompt(trade);

                if (!lastImageUrlForContext && typeof trade.screenshot_url === 'string' && trade.screenshot_url.trim()) {
                    const tradeScreenshotUrl = trade.screenshot_url.trim();
                    lastImageUrlForContext = tradeScreenshotUrl;
                    if (!lastImageMediaType) {
                        const lower = tradeScreenshotUrl.toLowerCase();
                        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) lastImageMediaType = 'image/jpeg';
                        else if (lower.endsWith('.webp')) lastImageMediaType = 'image/webp';
                        else if (lower.endsWith('.gif')) lastImageMediaType = 'image/gif';
                        else lastImageMediaType = 'image/png';
                    }
                }

                const tradeTools = createTradeTools(sessionTradeId, pendingImageBase64, lastImageUrlForContext);
                tools = { ...tools, ...tradeTools };
            }
        } else if (sessionPendingLimitOrderId) {
            const pendingRes = await query(
                `SELECT * FROM pending_limit_orders WHERE id = $1`,
                [sessionPendingLimitOrderId]
            );

            if ((pendingRes.rowCount ?? 0) > 0) {
                const pendingOrder = pendingRes.rows[0];
                systemPrompt = await getPendingLimitPrompt(pendingOrder);

                if (!lastImageUrlForContext && typeof pendingOrder.screenshot_url === 'string' && pendingOrder.screenshot_url.trim()) {
                    const screenshotUrl = pendingOrder.screenshot_url.trim();
                    lastImageUrlForContext = screenshotUrl;
                    if (!lastImageMediaType) {
                        const lower = screenshotUrl.toLowerCase();
                        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) lastImageMediaType = 'image/jpeg';
                        else if (lower.endsWith('.webp')) lastImageMediaType = 'image/webp';
                        else if (lower.endsWith('.gif')) lastImageMediaType = 'image/gif';
                        else lastImageMediaType = 'image/png';
                    }
                }

                const pendingTools = createPendingLimitTools(
                    sessionPendingLimitOrderId,
                    pendingImageBase64,
                    lastImageUrlForContext
                );
                tools = { ...tools, ...pendingTools };
            }
        }

        // Convertir a CoreMessages para el SDK usando el helper oficial
        console.log("Calling convertToModelMessages with N messages:", modelInputMessages.length);
        const coreMessages = await convertToModelMessages(modelInputMessages as any, { tools });
        console.log("Conversion done. Count:", coreMessages.length);


        async function buildStreamResult(modelId: string) {
            return streamText({
                model: getModel(modelId),
                system: systemPrompt,
                messages: coreMessages,
                tools,
                maxSteps: 5,
                stepCount: stepCountIs(5),
                onFinish: async ({ text, reasoningText, toolCalls }: any) => {
                    let contentToSave = typeof text === 'string' ? text : '';

                    if (!contentToSave.trim() && typeof reasoningText === 'string') {
                        contentToSave = reasoningText;
                    }

                    if (!contentToSave.trim() && Array.isArray(toolCalls)) {
                        const tradeCall = toolCalls.find((t: any) => t.toolName === 'propose_live_trade');
                        const analysis = tradeCall?.input?.analysis;
                        const reason = tradeCall?.input?.reason;
                        if (typeof analysis === 'string' && analysis.trim()) {
                            contentToSave = analysis;
                        } else if (typeof reason === 'string' && reason.trim()) {
                            contentToSave = reason;
                        } else {
                            const calledNames = toolCalls
                                .map((t: any) => t?.toolName)
                                .filter((n: any) => typeof n === 'string');
                            if (calledNames.length > 0) {
                                contentToSave = `Listo. Ejecuté ${calledNames.join(', ')} y apliqué los cambios solicitados.`;
                            }
                        }
                    }

                    let toolMarker = '';
                    if (Array.isArray(toolCalls)) {
                        const tradeCall = toolCalls.find((t: any) => t.toolName === 'propose_live_trade');
                        if (tradeCall) {
                            let toolArgs = (tradeCall as any).input ?? (tradeCall as any).args ?? (tradeCall as any).arguments;
                            if (typeof toolArgs === 'string') {
                                try { toolArgs = JSON.parse(toolArgs); } catch { /* noop */ }
                            }
                            if (toolArgs && typeof toolArgs === 'object') {
                                toolMarker = `\n\n[[tool:propose_live_trade]]${JSON.stringify(toolArgs)}`;
                            }
                        }
                    }

                    if (contentToSave && contentToSave.trim()) {
                        await query(
                            'INSERT INTO react_chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
                            [sessionId, 'assistant', `${contentToSave}${toolMarker}`]
                        );
                        // Actualizar timestamp de sesión
                        await query('UPDATE react_chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
                    } else if (toolMarker) {
                        await query(
                            'INSERT INTO react_chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
                            [sessionId, 'assistant', toolMarker]
                        );
                        await query('UPDATE react_chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
                    }
                },
            } as any);
        }

        let effectiveModel = currentModel;
        const needsVision = Boolean((sessionTradeId || sessionPendingLimitOrderId) && lastImageUrlForContext);
        if (needsVision && currentModel.includes('flash-lite')) {
            effectiveModel = 'gemini-2.5-flash';
            console.log(`[CHAT POST] Vision override applied: ${currentModel} -> ${effectiveModel}`);
        }

        console.log("Calling streamText with model:", effectiveModel);
        let result: any;
        try {
            result = await buildStreamResult(effectiveModel);
        } catch (primaryErr: any) {
            const msg = String(primaryErr?.message || '');
            const kimiModel = process.env.KIMI_MODEL_ID || DEFAULT_KIMI_MODEL_ID;
            const isKimiRequest = effectiveModel === 'kimi-k2.5' || effectiveModel === kimiModel;
            const isGeminiRequest = effectiveModel.startsWith('gemini-');
            const canFallback =
                effectiveModel !== 'gemini-2.5-flash' &&
                (isKimiRequest ||
                    isGeminiRequest ||
                    msg.includes('404') ||
                    msg.toLowerCase().includes('not found') ||
                    msg.toLowerCase().includes('model') ||
                    msg.toLowerCase().includes('unauthorized') ||
                    msg.toLowerCase().includes('quota') ||
                    msg.toLowerCase().includes('rate'));

            if (!canFallback) throw primaryErr;

            console.warn(`Model ${effectiveModel} failed, retrying with gemini-2.5-flash`);
            result = await buildStreamResult('gemini-2.5-flash');
        }

        // Stream UI message response (SSE)
        return result.toUIMessageStreamResponse();

    } catch (error: any) {
        console.error("Chat error:", error);

        const isQuota = error.message?.includes('429') ||
            error.message?.toLowerCase().includes('quota') ||
            error.message?.toLowerCase().includes('limit') ||
            error.status === 429;

        if (isQuota) {
            return new Response(JSON.stringify({
                error: "Has excedido tu cuota de uso de la API (429). Por favor intenta más tarde o cambia de modelo."
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Return clear JSON error for frontend to display
        return new Response(JSON.stringify({
            error: error.message || "Error interno del servidor",
            details: error.toString()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
