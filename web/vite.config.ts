import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development every backend path is forwarded to the InvidiousTube server (npm run dev -w server),
// which in turn proxies Invidious and invidious-companion.
const backend = process.env.ITUBE_SERVER || 'http://localhost:8080';
// Anchored with a trailing slash so youtu.be-style paths like /xAbC123defG aren't proxied.
const proxied = '^/(api|vi|ggpht|sb|s_p|companion|auth|x)/';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    host: true,
    proxy: { [proxied]: { target: backend, changeOrigin: false } },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
