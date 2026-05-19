import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const isDev = mode !== 'production';

  const apiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET ||
    env.VITE_API_URL ||
    env.VITE_BACKEND_URL ||
    'http://127.0.0.1:4000';

  const webProxyTarget =
    env.VITE_DEV_WEB_PROXY_TARGET ||
    env.VITE_WEB_APP_URL ||
    env.VITE_BACKEND_URL ||
    (isDev ? 'http://127.0.0.1:3000' : 'https://journal.agentame.xyz');

  const hasuraHttpUrl = env.VITE_HASURA_HTTP_URL || 'https://hasura.agentame.xyz/v1/graphql';
  const hasuraHttpTarget = hasuraHttpUrl.replace(/\/v1\/graphql\/?$/, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../../packages/journal-ui/src'),
      },
    },
    clearScreen: false,
    server: {
      fs: {
        allow: ['..', '../..'],
      },
      proxy: {
        '/v1/graphql': {
          target: hasuraHttpTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/api': {
          target: webProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/v1': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  };
});
