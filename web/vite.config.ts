import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development every backend path is forwarded to the InvidiousTube server (npm run dev -w server),
// which in turn proxies Invidious and invidious-companion.
const backend = process.env.ITUBE_SERVER || 'http://localhost:8080';
const proxied = ['/api', '/vi', '/ggpht', '/sb', '/s_p', '/companion', '/auth', '/x'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: Object.fromEntries(proxied.map((p) => [p, { target: backend, changeOrigin: false }])),
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
