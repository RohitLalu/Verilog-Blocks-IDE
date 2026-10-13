'use strict';
// Input validation shared by the HTTP server and the Electron main process.
// Everything a client sends that becomes a file path, or is persisted, goes through here.
const fs = require('fs');
const path = require('path');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Letters/digits first, then letters, digits, space, _ - . ( ). No separators, no "..", no
// trailing dot/space, so a name can only ever be ONE path segment.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.()-]{0,99}$/u;

function safeName(name, what = 'name') {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name.includes('..') || /[. ]$/.test(name)) {
    throw new HttpError(400, `Invalid ${what}: use letters, digits, spaces, "_", "-", "." or parentheses (max 100 characters, no slashes).`);
  }
  return name;
}

// path.resolve(base, ...parts), refusing anything that lands outside `base`.
function resolveInside(base, ...parts) {
  const root = path.resolve(base);
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) throw new HttpError(400, 'Path escapes its directory.');
  return full;
}

const projectDir = (projectsDir, name) => resolveInside(projectsDir, safeName(name, 'project name'));

// True if `file` really lives under one of `roots` once symlinks are resolved.
function insideAnyRoot(file, roots) {
  let real;
  try { real = fs.realpathSync(file); } catch { return false; }
  return roots.filter(Boolean).some(r => {
    try { const rr = fs.realpathSync(r); return real === rr || real.startsWith(rr + path.sep); }
    catch { return false; }
  });
}

const ID_RE = /^[a-z0-9_]{1,32}$/i;
const safeId = (id, what = 'id') => { if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, `Invalid ${what}.`); return id; };

// Only known preference keys are persisted; anything else is dropped.
function sanitizePrefs(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpError(400, 'Preferences must be an object.');
  const out = {};
  if ('pdkPaths' in p) {
    const pp = p.pdkPaths;
    if (!pp || typeof pp !== 'object' || Array.isArray(pp)) throw new HttpError(400, 'pdkPaths must be an object.');
    out.pdkPaths = {};
    for (const [id, v] of Object.entries(pp)) {
      if (!ID_RE.test(id)) continue;
      if (typeof v !== 'string' || v.length > 4096 || v.includes('\0')) throw new HttpError(400, `Invalid path for ${id}.`);
      out.pdkPaths[id] = v;
    }
  }
  if (typeof p.lastPDK === 'string' && ID_RE.test(p.lastPDK)) out.lastPDK = p.lastPDK;
  return out;
}

module.exports = { HttpError, safeName, safeId, resolveInside, projectDir, insideAnyRoot, sanitizePrefs };
