import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { registerDesktopRoutes } from './routes/desktop';
import { registerTradeTrackingRoutes } from './routes/trade-tracking';
import { registerDesktopUnifiedRoutes } from './routes/desktop-unified';

function allowedOrigins() {
  const raw = process.env.CORS_ORIGINS || 'http://tauri.localhost,tauri://localhost,http://localhost:1420';
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  const origins = allowedOrigins();
  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (origins.includes(origin)) return cb(null, true);
      if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
  });

  await app.register(websocket);
  await registerDesktopRoutes(app);
  await registerTradeTrackingRoutes(app);
  await registerDesktopUnifiedRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: error.issues,
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: error.message || 'Internal server error',
    });
  });

  return app;
}
