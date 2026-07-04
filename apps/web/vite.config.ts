import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Dev proxy points the app at the local no-AWS harness (tools/dev-server):
 * `/api` → HTTP core, `/ws` → WebSocket core, `/pool` → bundled pool snapshot.
 * In production these are the API Gateway + CloudFront origins instead.
 */
const HARNESS = 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: HARNESS, changeOrigin: true },
      '/pool': { target: HARNESS, changeOrigin: true },
      '/ws': { target: HARNESS, ws: true, changeOrigin: true },
    },
  },
});
