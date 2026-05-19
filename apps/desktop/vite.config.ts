import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const proxyTarget = process.env.VITE_DEV_PROXY_TARGET || process.env.VITE_BACKEND_URL || 'https://journal.agentame.xyz';

export default defineConfig({
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
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/v1': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
