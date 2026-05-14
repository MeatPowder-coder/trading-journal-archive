import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { resolveDesktopAuth } from '../auth';
import { publishDesktopEvent } from '../events';

const paramsSchema = z.object({
  tradeId: z.coerce.number().int().positive(),
});

const sltpMoveInputSchema = z.object({
  moveType: z.enum(['SL', 'TP']),
  fromPrice: z.coerce.number().positive().nullable().optional(),
  toPrice: z.coerce.number().positive(),
  reason: z.string().max(2000).nullable().optional(),
  priceAtMove: z.coerce.number().positive().nullable().optional(),
  movedTowardEntry: z.boolean().nullable().optional(),
  rRatioAtMove: z.coerce.number().nullable().optional(),
});

const snapshotInputSchema = z.object({
  sltpMoveId: z.coerce.number().int().positive().nullable().optional(),
  trigger: z.enum(['ENTRY', 'EXIT', 'SL_MOVE', 'TP_MOVE', 'MANUAL']),
  imageUrl: z.string().min(1),
  timeframe: z.string().max(20).nullable().optional(),
  indicators: z.record(z.string(), z.unknown()).default({}),
});

const aiAnalysisInputSchema = z.object({
  snapshotId: z.coerce.number().int().positive().nullable().optional(),
  prompt: z.string().min(1),
  response: z.string().nullable().optional(),
  model: z.string().min(1),
  context: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(['PENDING', 'DONE', 'ERROR']).default('PENDING'),
  error: z.string().nullable().optional(),
});

async function requireDesktopAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = await resolveDesktopAuth(request);
  if (!auth) {
    reply.code(401).send({ error: 'Desktop access token required' });
    return null;
  }
  return auth;
}

export async function registerTradeTrackingRoutes(instance: FastifyInstance) {
  instance.get('/v1/trades/:tradeId/sltp-moves', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const { tradeId } = paramsSchema.parse(request.params);
    const result = await query(
      `SELECT *
       FROM sltp_moves
       WHERE trade_id = $1
       ORDER BY created_at DESC`,
      [tradeId]
    );
    return { success: true, moves: result.rows };
  });

  instance.post('/v1/trades/:tradeId/sltp-moves', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const { tradeId } = paramsSchema.parse(request.params);
    const body = sltpMoveInputSchema.parse(request.body);
    const result = await query(
      `INSERT INTO sltp_moves (
         trade_id, move_type, from_price, to_price, reason,
         price_at_move, moved_toward_entry, r_ratio_at_move
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tradeId,
        body.moveType,
        body.fromPrice ?? null,
        body.toPrice,
        body.reason ?? null,
        body.priceAtMove ?? null,
        body.movedTowardEntry ?? null,
        body.rRatioAtMove ?? null,
      ]
    );
    const move = result.rows[0];
    publishDesktopEvent({
      type: 'sltp.move.recorded',
      timestamp: Date.now(),
      tradeId,
      payload: { move },
    });
    return { success: true, move };
  });

  instance.get('/v1/trades/:tradeId/snapshots', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const { tradeId } = paramsSchema.parse(request.params);
    const result = await query(
      `SELECT *
       FROM chart_snapshots
       WHERE trade_id = $1
       ORDER BY created_at DESC`,
      [tradeId]
    );
    return { success: true, snapshots: result.rows };
  });

  instance.post('/v1/trades/:tradeId/snapshots', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const { tradeId } = paramsSchema.parse(request.params);
    const body = snapshotInputSchema.parse(request.body);
    const result = await query(
      `INSERT INTO chart_snapshots (
         trade_id, sltp_move_id, trigger, image_url, timeframe, indicators
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        tradeId,
        body.sltpMoveId ?? null,
        body.trigger,
        body.imageUrl,
        body.timeframe ?? null,
        JSON.stringify(body.indicators),
      ]
    );
    const snapshot = result.rows[0];
    publishDesktopEvent({
      type: 'snapshot.created',
      timestamp: Date.now(),
      tradeId,
      payload: { snapshot },
    });
    return { success: true, snapshot };
  });

  instance.get('/v1/trades/:tradeId/ai-analysis', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const { tradeId } = paramsSchema.parse(request.params);
    const result = await query(
      `SELECT *
       FROM ai_analyses
       WHERE trade_id = $1
       ORDER BY created_at DESC`,
      [tradeId]
    );
    return { success: true, analyses: result.rows };
  });

  instance.post('/v1/trades/:tradeId/ai-analysis', async (request, reply) => {
    if (!await requireDesktopAuth(request, reply)) return reply;
    const { tradeId } = paramsSchema.parse(request.params);
    const body = aiAnalysisInputSchema.parse(request.body);
    const result = await query(
      `INSERT INTO ai_analyses (
         trade_id, snapshot_id, prompt, response, model, context, status, error
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        tradeId,
        body.snapshotId ?? null,
        body.prompt,
        body.response ?? null,
        body.model,
        JSON.stringify(body.context),
        body.status,
        body.error ?? null,
      ]
    );
    const analysis = result.rows[0];
    if (analysis.status === 'DONE') {
      publishDesktopEvent({
        type: 'ai.analysis.ready',
        timestamp: Date.now(),
        tradeId,
        payload: { analysis },
      });
    }
    return { success: true, analysis };
  });
}
