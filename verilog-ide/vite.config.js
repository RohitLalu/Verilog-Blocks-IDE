import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy for the built app (desktop and Docker), not the dev server (which needs inline HMR scripts).
// Scripts only from the app itself; network only to the app and the local Ollama (the learning assistant); no plugins,
// frames or form posts. Inline styles stay allowed: React sets them on elements.
export const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:",
  "connect-src 'self' http://127.0.0.1:11434 http://localhost:11434",
  "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
const csp = { name: 'csp', apply: 'build',
  transformIndexHtml: html => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`) };

export default defineConfig({
  plugins: [react(), csp],
  // Relative asset URLs: the packaged desktop app loads dist/index.html from file://, where an
  // absolute "/assets/..." resolves to the filesystem root and the window stays blank.
  base: './',
  // The API is same-origin in production (Express serves dist/). In dev, proxy it so no CORS is needed.
  // Start the API first:  npm run server
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000', '/pdk': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist', emptyOutDir: true },
  publicDir: 'public',
});
