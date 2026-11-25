'use strict';
// Which EDA tools the app can run, from where, and which version: shown in the app's Tools window.
// Shared by the desktop app (IPC) and the Docker server (/api/tools/status).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS = [
  { name: 'yosys', args: ['-V'], role: 'Synthesis, and the first step of ATPG' },
  { name: 'iverilog', args: ['-V'], role: 'Compiles the design and its testbench' },
  { name: 'vvp', args: ['-V'], role: 'Runs the simulation' },
  { name: 'atalanta', args: null, role: 'Test patterns and fault coverage (ATPG)' },   // has no version option
];

// The file spawn() runs for `name`: the first match on PATH (Windows adds .exe)
function whichTool(name, { envPath = process.env.PATH || '', platform = process.platform } = {}) {
  const ext = platform === 'win32' ? '.exe' : '';
  for (const dir of String(envPath).split(path.delimiter).filter(Boolean)) {
    const f = path.join(dir, name + ext);
    try { if (fs.statSync(f).isFile()) return f; } catch { /* not here */ }
  }
  return null;
}

// bundledDir: the app's own tools folder (packaged app), to tell bundled copies from ones installed on the system
function toolStatus({ bundledDir = null, envPath } = {}) {
  return TOOLS.map(t => {
    const p = whichTool(t.name, envPath === undefined ? {} : { envPath });
    let version = null;
    if (p && t.args) {
      const r = spawnSync(p, t.args, { encoding: 'utf8', timeout: 10000 });
      version = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').map(l => l.trim()).find(Boolean) || null;
    }
    return { name: t.name, role: t.role, found: !!p, path: p, version, bundled: !!(p && bundledDir && p.startsWith(bundledDir)) };
  });
}

module.exports = { toolStatus, whichTool, TOOLS };
