import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Dev API to proxy to. Defaults to the Docker API; override to point the UI at
// a local `npm run dev` API (port 4001) or a Lite/SQLite instance:
//   LOGNOG_API_TARGET=http://localhost:4001 npm run dev
const apiTarget = process.env.LOGNOG_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: apiTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
});
