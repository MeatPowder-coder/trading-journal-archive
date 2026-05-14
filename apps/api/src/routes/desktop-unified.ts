import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { resolveDesktopAuth } from '../auth';
import { publishDesktopEvent } from '../events';
import { query } from '../db';

const marketOrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['LONG', 'SHORT']),
  leverage: z.coerce.number().positive(),
  margin: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive().optional(),
  takeProfit: z.coerce.number().positive().optional(),
  entryTesis: z.string().max(5000).optional(),
  checklistConfirmed: z.boolean().optional(),
  checklistCheckedCount: z.coerce.number().int().min(0).max(20).optional(),
  checklistTotal: z.coerce.number().int().min(1).max(30).optional(),
  checklistMissing: z.array(z.string()).optional(),
  checklistTimestamp: z.string().optional(),
  mentalState: z.string().optional(),
  overrideCooldown: z.boolean().optional(),
  setupTag: z.string().max(120).optional(),
  timeframe: z.string().max(20).optional(),
  zonaEntrada: z.string().max(255).optional(),
  tendenciaMacro: z.string().max(40).optional(),
  contextoMercado: z.string().max(40).optional(),
  volatilidad: z.string().max(20).optional(),
  tipoLiquidez: z.string().max(20).optional(),
  estadoDelta: z.string().max(20).optional(),
  volumenEstado: z.string().max(20).optional(),
  absorcionDetectada: z.boolean().optional(),
  emocionEntrada: z.string().max(80).optional(),
  chatSessionId: z.string().max(120).optional(),
});

const limitOrderSchema = marketOrderSchema.extend({
  entryPrice: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive(),
});

const editOrderSchema = z.object({
  entryPrice: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive(),
  takeProfit: z.coerce.number().positive().nullable().optional(),
  margin: z.coerce.number().positive(),
  leverage: z.coerce.number().positive(),
  overrideRiskIncrease: z.boolean().optional(),
  overrideReason: z.string().max(2000).nullable().optional(),
  source: z.string().max(80).optional(),
});

const closePositionSchema = z.object({
  tradeId: z.coerce.number().int().positive().optional(),
  closePercent: z.coerce.number().positive().max(100).optional(),
  source: z.string().max(80).optional(),
});

const positionSltpSchema = z.object({
  tradeId: z.coerce.number().int().positive(),
  stopLoss: z.coerce.number().positive(),
  takeProfit: z.coerce.number().positive().nullable().optional(),
  overrideRiskIncrease: z.boolean().optional(),
  overrideReason: z.string().max(2000).nullable().optional(),
  source: z.string().max(80).optional(),
});

const chatSessionCreateSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  tradeId: z.coerce.number().int().positive().nullable().optional(),
  pendingOrderId: z.coerce.number().int().positive().nullable().optional(),
  agentType: z.string().max(40).optional(),
});

const chatMessageCreateSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  role: z.enum(['user', 'assistant', 'system', 'tool']).default('user'),
  content: z.string().min(1),
  fileUrl: z.string().max(2048).nullable().optional(),
  fileType: z.string().max(120).nullable().optional(),
});

const chatStreamSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  message: z.string().min(1),
  model: z.string().min(1).max(120).optional(),
});

async function requireDesktopAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = await resolveDesktopAuth(request);
  if (!auth) {
    reply.code(401).send({ error: 'Desktop access token required' });
    return null;
  }
  return auth;
}

function webBaseUrl() {
  const configured = (process.env.INTERNAL_WEB_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'http://127.0.0.1:3000';
}

async function proxyWebJson(path: string, options: { method?: string; body?: Record<string, unknown> | null }) {
  const response = await fetch(`${webBaseUrl()}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { error: raw || `HTTP ${response.status}` };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function ensureChatSessionOwnership(sessionId: number, userId: string) {
  const result = await query(
    `SELECT id, title, trade_id, pending_limit_order_id, agent_type, created_at, updated_at
     FROM react_chat_sessions
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [sessionId, userId]
  );
  return result.rows[0] || null;
}

async function generateAssistantReply(params: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: string; content: string }>;
}) {
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!anthropicKey) {
    return {
      text: `No hay ANTHROPIC_API_KEY configurada en el backend. Mensaje recibido: "${params.userMessage.slice(0, 240)}"`,
      model: 'fallback-local',
    };
  }

  const content = [
    ...params.history.slice(-14).map((message) => `${message.role.toUpperCase()}: ${message.content}`),
    `USER: ${params.userMessage}`,
  ].join('\n\n');

  const model = params.model || 'claude-sonnet-4-20250514';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: params.systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  });

  const payload = await response.json().catch(() => null as any);
  if (!response.ok) {
    const details = payload?.error?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Claude API error: ${details}`);
  }

  const text = Array.isArray(payload?.content)
    ? payload.content
        .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
        .map((block: any) => block.text)
        .join('\n')
    : '';

  return {
    text: text || 'Sin contenido de texto en la respuesta del modelo.',
    model,
  };
}

export async function registerDesktopUnifiedRoutes(instance: FastifyInstance) {
  instance.post('/v1/orders/market', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const body = marketOrderSchema.parse(request.body);

    const result = await proxyWebJson('/api/binance/open-position', {
      method: 'POST',
      body: {
        ...body,
        orderType: 'MARKET',
      },
    });

    if (!result.ok) return reply.code(result.status).send(result.payload);

    publishDesktopEvent({
      type: 'order.updated',
      timestamp: Date.now(),
      payload: {
        source: 'v1/orders/market',
        symbol: body.symbol,
        side: body.side,
      },
    });

    return result.payload;
  });

  instance.post('/v1/orders/limit', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const body = limitOrderSchema.parse(request.body);

    const result = await proxyWebJson('/api/binance/open-position', {
      method: 'POST',
      body: {
        ...body,
        orderType: 'LIMIT',
      },
    });

    if (!result.ok) return reply.code(result.status).send(result.payload);

    publishDesktopEvent({
      type: 'order.updated',
      timestamp: Date.now(),
      payload: {
        source: 'v1/orders/limit',
        symbol: body.symbol,
        side: body.side,
      },
    });

    return result.payload;
  });

  instance.patch('/v1/orders/:id', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;

    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = editOrderSchema.parse(request.body);

    const result = await proxyWebJson('/api/orders/limit/edit', {
      method: 'POST',
      body: {
        pendingOrderId: params.id,
        ...body,
      },
    });

    if (!result.ok) return reply.code(result.status).send(result.payload);

    publishDesktopEvent({
      type: 'order.updated',
      timestamp: Date.now(),
      payload: {
        source: 'v1/orders/:id',
        orderId: params.id,
      },
    });

    return result.payload;
  });

  instance.delete('/v1/orders/:id', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;

    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const reason = z.object({ reason: z.string().max(2000).optional() }).parse(request.body || {});

    const result = await proxyWebJson('/api/orders/limit/cancel', {
      method: 'POST',
      body: {
        pendingOrderId: params.id,
        reason: reason.reason,
      },
    });

    if (!result.ok) return reply.code(result.status).send(result.payload);

    publishDesktopEvent({
      type: 'order.updated',
      timestamp: Date.now(),
      payload: {
        source: 'v1/orders/:id/delete',
        orderId: params.id,
      },
    });

    return result.payload;
  });

  instance.post('/v1/positions/:symbol/close', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;

    const params = z.object({ symbol: z.string().min(1) }).parse(request.params);
    const body = closePositionSchema.parse(request.body || {});

    if (body.closePercent && body.closePercent < 100) {
      return reply.code(400).send({
        error: 'Close parcial aún no disponible en este endpoint. Usa closePercent=100.',
      });
    }

    const result = await proxyWebJson('/api/binance/close-position', {
      method: 'POST',
      body: { symbol: params.symbol.toUpperCase() },
    });

    if (!result.ok) return reply.code(result.status).send(result.payload);

    publishDesktopEvent({
      type: 'trade.updated',
      timestamp: Date.now(),
      payload: {
        source: 'v1/positions/:symbol/close',
        symbol: params.symbol.toUpperCase(),
        tradeId: body.tradeId || null,
      },
    });

    return result.payload;
  });

  instance.post('/v1/positions/:symbol/sltp', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;

    const params = z.object({ symbol: z.string().min(1) }).parse(request.params);
    const body = positionSltpSchema.parse(request.body);

    const result = await proxyWebJson('/api/trades/set-protection', {
      method: 'POST',
      body: {
        tradeId: body.tradeId,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit ?? null,
        overrideRiskIncrease: body.overrideRiskIncrease ?? false,
        overrideReason: body.overrideReason ?? null,
        source: body.source || 'DESKTOP_PANEL',
      },
    });

    if (!result.ok) return reply.code(result.status).send(result.payload);

    publishDesktopEvent({
      type: 'trade.updated',
      timestamp: Date.now(),
      tradeId: body.tradeId,
      payload: {
        source: 'v1/positions/:symbol/sltp',
        symbol: params.symbol.toUpperCase(),
      },
    });

    return result.payload;
  });

  instance.get('/v1/chat/sessions', async (request, reply) => {
    const auth = await requireDesktopAuth(request, reply);
    if (!auth) return reply;

    const filters = z.object({
      tradeId: z.coerce.number().int().positive().optional(),
      pendingOrderId: z.coerce.number().int().positive().optional(),
    }).parse(request.query || {});

    const whereParts = ['s.user_id = $1'];
    const params: unknown[] = [auth.userId];

    if (filters.tradeId) {
      whereParts.push(`s.trade_id = $${params.length + 1}`);
      params.push(filters.tradeId);
    }

    if (filters.pendingOrderId) {
      whereParts.push(`s.pending_limit_order_id = $${params.length + 1}`);
      params.push(filters.pendingOrderId);
    }

    const result = await query(
      `SELECT s.id, s.title, s.trade_id, s.pending_limit_order_id, s.created_at, s.updated_at, s.agent_type,
              (SELECT COUNT(*) FROM react_chat_messages WHERE session_id = s.id) AS message_count
       FROM react_chat_sessions s
       WHERE ${whereParts.join(' AND ')}
       ORDER BY s.updated_at DESC
       LIMIT 100`,
      params
    );

    return {
      success: true,
      sessions: result.rows,
    };
  });

  instance.post('/v1/chat/sessions', async (request, reply) => {
    const auth = await requireDesktopAuth(request, reply);
    if (!auth) return reply;

    const body = chatSessionCreateSchema.parse(request.body || {});
    const result = await query(
      `INSERT INTO react_chat_sessions (user_id, trade_id, pending_limit_order_id, title, agent_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, trade_id, pending_limit_order_id, created_at, updated_at, agent_type`,
      [
        auth.userId,
        body.tradeId ?? null,
        body.pendingOrderId ?? null,
        body.title ?? null,
        body.agentType || 'TRADER',
      ]
    );

    return reply.code(201).send({
      success: true,
      session: result.rows[0],
    });
  });

  instance.get('/v1/chat/messages', async (request, reply) => {
    const auth = await requireDesktopAuth(request, reply);
    if (!auth) return reply;

    const queryParams = z.object({ sessionId: z.coerce.number().int().positive() }).parse(request.query || {});
    const session = await ensureChatSessionOwnership(queryParams.sessionId, auth.userId);
    if (!session) return reply.code(404).send({ error: 'Chat session not found' });

    const result = await query(
      `SELECT id, role, content, file_url, file_type, created_at
       FROM react_chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [queryParams.sessionId]
    );

    return {
      success: true,
      session,
      messages: result.rows,
    };
  });

  instance.post('/v1/chat/messages', async (request, reply) => {
    const auth = await requireDesktopAuth(request, reply);
    if (!auth) return reply;

    const body = chatMessageCreateSchema.parse(request.body);
    const session = await ensureChatSessionOwnership(body.sessionId, auth.userId);
    if (!session) return reply.code(404).send({ error: 'Chat session not found' });

    const result = await query(
      `INSERT INTO react_chat_messages (session_id, role, content, file_url, file_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, role, content, file_url, file_type, created_at`,
      [body.sessionId, body.role, body.content, body.fileUrl ?? null, body.fileType ?? null]
    );

    await query('UPDATE react_chat_sessions SET updated_at = NOW() WHERE id = $1', [body.sessionId]);

    return reply.code(201).send({
      success: true,
      message: result.rows[0],
    });
  });

  instance.post('/v1/chat/stream', async (request, reply) => {
    const auth = await requireDesktopAuth(request, reply);
    if (!auth) return reply;

    const body = chatStreamSchema.parse(request.body);
    const session = await ensureChatSessionOwnership(body.sessionId, auth.userId);
    if (!session) return reply.code(404).send({ error: 'Chat session not found' });

    await query(
      `INSERT INTO react_chat_messages (session_id, role, content)
       VALUES ($1, 'user', $2)`,
      [body.sessionId, body.message]
    );

    const historyRes = await query(
      `SELECT role, content
       FROM react_chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 120`,
      [body.sessionId]
    );

    const modelResult = await generateAssistantReply({
      model: body.model || 'claude-sonnet-4-20250514',
      systemPrompt: 'Eres el asistente de trading del usuario. Responde en español, directo y accionable.',
      userMessage: body.message,
      history: historyRes.rows.map((row) => ({
        role: String(row.role || 'user'),
        content: String(row.content || ''),
      })),
    });

    const insertAssistant = await query(
      `INSERT INTO react_chat_messages (session_id, role, content)
       VALUES ($1, 'assistant', $2)
       RETURNING id, role, content, created_at`,
      [body.sessionId, modelResult.text]
    );

    await query('UPDATE react_chat_sessions SET updated_at = NOW() WHERE id = $1', [body.sessionId]);

    publishDesktopEvent({
      type: 'trade.updated',
      timestamp: Date.now(),
      payload: {
        source: 'v1/chat/stream',
        sessionId: body.sessionId,
      },
    });

    return {
      success: true,
      model: modelResult.model,
      assistantMessage: insertAssistant.rows[0],
    };
  });
}
