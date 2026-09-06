import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Dev API to proxy to. Defaults to the Docker API; point the UI at a local
  // `npm run dev` API instead with either:
  //   LOGNOG_API_TARGET=http://localhost:4001 npm run dev   (any URL)
  //   npm run dev:lite                                      (port 4001, cross-platform)
  const apiTarget =
    process.env.LOGNOG_API_TARGET ||
    (mode === 'lite' ? 'http://localhost:4001' : 'http://localhost:4000');

  return {
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
  };
});
