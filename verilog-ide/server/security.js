'use strict';
// Request guards for the HTTP server. The server can read and write files, so it must only
// answer the page it serves — not arbitrary websites that happen to be open in the same browser.
//
//  * Host allow-list      -> stops DNS-rebinding (evil.example re-pointed at 127.0.0.1)
//  * same-origin check    -> stops cross-site requests (CORS is intentionally NOT enabled)
//  * JSON-only mutations  -> stops "simple" cross-site form posts that skip the CORS preflight

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
// `npm run dev`: the page is served by Vite on :5173 and its proxy forwards /api here. The proxy rewrites
// Host but (correctly) leaves Origin alone, so the dev origin has to be allowed explicitly — outside production only.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const resolveHost = (env = process.env) => env.VBIDE_HOST || '127.0.0.1';
const isLoopbackHost = h => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h);

function allowedHostnames(env = process.env) {
  const extra = (env.VBIDE_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return new Set([...LOOPBACK, ...extra]);
}

function allowedOrigins(env = process.env) {
  const extra = (env.VBIDE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  return new Set([...(env.NODE_ENV === 'production' ? [] : DEV_ORIGINS), ...extra]);
}

function hostnameOf(hostHeader) {
  const h = String(hostHeader || '').toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);   // [::1]:3000
  return h.split(':')[0];
}

function guards(env = process.env) {
  const allowed = allowedHostnames(env), origins = allowedOrigins(env);
  return [
    (req, res, next) => {
      const name = hostnameOf(req.headers.host);
      if (allowed.has(name)) return next();
      res.status(403).json({ error: `Host "${req.headers.host || ''}" is not allowed. To serve this app under another name, start the server with VBIDE_ALLOWED_HOSTS=<hostname>.` });
    },
    (req, res, next) => {
      const origin = req.headers.origin;
      if (!origin) return next();                       // same-origin GETs and non-browser clients send none
      let host = null;
      try { host = new URL(origin).host; } catch { /* malformed */ }
      if (host === req.headers.host || origins.has(origin.replace(/\/$/, ''))) return next();
      res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    },
    (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      if (req.is('application/json') !== false) return next();   // null = no body
      res.status(415).json({ error: 'Content-Type must be application/json.' });
    },
  ];
}

module.exports = { guards, resolveHost, isLoopbackHost, allowedHostnames, allowedOrigins, hostnameOf };
