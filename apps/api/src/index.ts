import { loadApiEnv } from './env';
import { buildServer } from './server';

const loadedEnvFiles = loadApiEnv();
if (loadedEnvFiles.length > 0) {
  console.log(`[api] Loaded env files: ${loadedEnvFiles.join(', ')}`);
}

const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || '0.0.0.0';

const server = await buildServer();

await server.listen({ port, host });
