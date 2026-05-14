import type { FastifyInstance } from 'fastify';
import { resolveDesktopAuth } from '../auth';
import { query } from '../db';
import { addEventClient } from '../events';

export async function registerDesktopRoutes(instance: FastifyInstance) {
  instance.get('/health', async () => ({
    ok: true,
    service: 'trading-journal-api',
    timestamp: new Date().toISOString(),
  }));

  instance.get('/v1/desktop/session', async (request, reply) => {
    const auth = resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    return {
      authenticated: true,
      user: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
      },
      deviceSessionId: auth.deviceSessionId,
    };
  });

  instance.get('/v1/desktop/cockpit', async (request, reply) => {
    const auth = resolveDesktopAuth(request);
    if (!auth) return reply.code(401).send({ error: 'Desktop access token required' });

    const [openTrades, pendingOrders] = await Promise.all([
      query(
        `SELECT *
         FROM trades_activos
         WHERE estado = 'OPEN'
         ORDER BY fecha_apertura DESC
         LIMIT 100`
      ),
      query(
        `SELECT *
         FROM pending_limit_orders
         WHERE order_status IN ('NEW', 'PARTIALLY_FILLED')
         ORDER BY created_at DESC
         LIMIT 100`
      ).catch(() => ({ rows: [] })),
    ]);

    return {
      success: true,
      asOf: new Date().toISOString(),
      openTrades: openTrades.rows,
      pendingOrders: pendingOrders.rows,
    };
  });

  instance.get('/v1/desktop/events', { websocket: true }, (socket, request) => {
    const auth = resolveDesktopAuth(request);
    if (!auth) {
      socket.close(1008, 'Desktop access token required');
      return;
    }

    addEventClient(socket);
    socket.send(JSON.stringify({
      type: 'risk.updated',
      timestamp: Date.now(),
      payload: {
        connected: true,
        deviceSessionId: auth.deviceSessionId,
      },
    }));
  });
}
