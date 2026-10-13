import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // The API is same-origin in production (Express serves dist/). In dev, proxy it so no CORS is needed.
  // Start the API first:  npm run server
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000', '/pdk': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist', emptyOutDir: true },
  publicDir: 'public',
});
