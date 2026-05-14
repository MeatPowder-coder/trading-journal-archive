import { buildServer } from './server';

const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || '0.0.0.0';

const server = await buildServer();

await server.listen({ port, host });
