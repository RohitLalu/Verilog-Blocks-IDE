'use strict';
// Spawn a tool with a hard timeout and a cap on captured output.
const { spawn } = require('child_process');

const MAX_OUTPUT_BYTES = 1024 * 1024;

function run(cmd, args, { cwd, timeoutMs } = {}) {
  return new Promise(resolve => {
    let out = '', truncated = false, timedOut = false, settled = false, timer = null;
    const settle = r => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ ...r, out: truncated ? out + '\n[output truncated]' : out, timedOut });
    };
    const p = spawn(cmd, args, { cwd });
    if (timeoutMs) timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, timeoutMs);
    const collect = d => {
      if (out.length >= MAX_OUTPUT_BYTES) { truncated = true; return; }
      out += d;
    };
    p.stdout.on('data', collect);
    p.stderr.on('data', collect);
    p.on('error', error => settle({ code: null, error }));
    p.on('close', code => settle({ code }));
  });
}

module.exports = { run };
