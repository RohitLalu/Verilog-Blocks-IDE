'use strict';
// Shared iverilog/vvp runner used by both the HTTP server (server.js) and the
// Electron main process (electron-main.js), so the two can't drift apart.
//
// Fixes over the previous inline versions:
//  * vvp runs with cwd = the simulation directory. The generated testbench calls
//    $dumpfile("wave.vcd") with a relative path, so before this the waveform was
//    written to the *server's* working directory and never found.
//  * Artifacts from the previous run (*.vcd, sim.out) are deleted first, so a
//    stale waveform is never returned for a run that didn't produce one.
//  * Runaway simulations (a testbench with no $finish) are killed after a timeout.
//  * Console output is capped, and `ok` reflects the real exit status.

const fs = require('fs');
const path = require('path');
const { run } = require('./proc.js');

const DEFAULT_TIMEOUT_MS = Number(process.env.VBIDE_SIM_TIMEOUT_MS) || 30000;

const NOT_FOUND = tool =>
  `ERROR: ${tool} not found on PATH.\n` +
  `Docker: rebuild the image (docker build -t verilogblocks .).\n` +
  `Desktop: install Icarus Verilog (e.g. brew install icarus-verilog).`;

function findVcd(simDir) {
  const files = fs.readdirSync(simDir).filter(f => f.toLowerCase().endsWith('.vcd'));
  if (!files.length) return null;
  const pick = files.includes('wave.vcd') ? 'wave.vcd' : files[0];
  return fs.readFileSync(path.join(simDir, pick), 'utf8');
}

async function runSimulation({ simDir, verilog, testbench, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  fs.mkdirSync(simDir, { recursive: true });
  fs.writeFileSync(path.join(simDir, 'top.v'), verilog || '');
  fs.writeFileSync(path.join(simDir, 'top_tb.v'), testbench || '');

  // Never return a waveform left over from an earlier run
  fs.rmSync(path.join(simDir, 'sim.out'), { force: true });
  fs.readdirSync(simDir).filter(f => f.toLowerCase().endsWith('.vcd'))
    .forEach(f => fs.rmSync(path.join(simDir, f), { force: true }));

  const comp = await run('iverilog', ['-g2012', '-o', 'sim.out', 'top_tb.v', 'top.v'], { cwd: simDir, timeoutMs });
  if (comp.error) return { ok: false, output: comp.error.code === 'ENOENT' ? NOT_FOUND('iverilog') : String(comp.error), vcd: null };
  if (comp.timedOut) return { ok: false, output: `Compile timed out after ${timeoutMs / 1000}s.`, vcd: null };
  if (comp.code !== 0) return { ok: false, output: 'Compile error:\n' + comp.out, vcd: null };

  const sim = await run('vvp', ['sim.out'], { cwd: simDir, timeoutMs });
  if (sim.error) return { ok: false, output: sim.error.code === 'ENOENT' ? NOT_FOUND('vvp') : String(sim.error), vcd: null };

  const vcd = findVcd(simDir);   // a partial waveform is still useful after a timeout
  let output = sim.out;
  if (sim.timedOut) {
    output += `\n[timeout] Simulation killed after ${timeoutMs / 1000}s — the testbench probably never calls $finish.`;
    return { ok: false, output, vcd };
  }
  if (!vcd) output += '\n[note] No .vcd file was produced — the testbench must call $dumpfile("wave.vcd") and $dumpvars.';
  return { ok: sim.code === 0, output, vcd };
}

module.exports = { runSimulation, DEFAULT_TIMEOUT_MS };
