'use strict';
// Formal verification with SymbiYosys: proves (or bounded-checks) the assertions in a properties module that wraps the
// design. Returns PASS / FAIL / UNKNOWN / ERROR and, on a failure, the counterexample as a VCD for the waveform viewer.
// Shared by the desktop app and the Docker server. sby comes from PATH; on Windows the bundled Python runs sby's script.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.js');

const DEFAULT_TIMEOUT_MS = Number(process.env.VBIDE_FORMAL_TIMEOUT_MS) || 120000;
const MODES = new Set(['prove', 'bmc']);

function sbyCommand() {
  const py = process.env.VBIDE_PYTHON;
  if (process.platform === 'win32' && py) {
    const bin = path.join(path.dirname(path.dirname(py)), 'bin');            // tools/lib/python3.exe -> tools/bin/
    const script = path.join(bin, 'sby-script.py');
    // sby starts yosys-smtbmc through cmd.exe; its .exe launcher starts python3 without quoting the path, which fails
    // when the app is installed under a folder with a space. So tell sby to run the script with our Python, quoted.
    if (fs.existsSync(script)) return [py, [script, '--smtbmc', `"${py}" "${path.join(bin, 'yosys-smtbmc-script.py')}"`]];
  }
  return ['sby', []];
}

// "DONE (PASS, rc=0)" / "DONE (FAIL, rc=2)" / "DONE (UNKNOWN, rc=4)" / "DONE (ERROR, rc=16)"
const parseStatus = out => (out.match(/DONE \((PASS|FAIL|UNKNOWN|ERROR|TIMEOUT)/) || [])[1] || 'ERROR';

function findTrace(dir) {
  const hits = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.vcd')) hits.push(p); } };
  if (fs.existsSync(dir)) walk(dir);
  return hits.find(p => path.basename(p) === 'trace.vcd') || hits[0] || null;
}

async function runFormal({ dir, verilog, props, mode = 'prove', depth = 20, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!MODES.has(mode)) return { ok: false, status: 'ERROR', output: `Unknown mode "${mode}" (use prove or bmc).` };
  depth = Math.max(1, Math.min(200, parseInt(depth, 10) || 20));
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(path.join(dir, 'check'), { recursive: true, force: true });       // never report an old run
  fs.writeFileSync(path.join(dir, 'top.v'), verilog || '');
  fs.writeFileSync(path.join(dir, 'props.sv'), props || '');
  fs.writeFileSync(path.join(dir, 'check.sby'), [
    '[options]', `mode ${mode}`, `depth ${depth}`, '', '[engines]', 'smtbmc yices', '',
    '[script]', 'read -formal top.v', 'read -formal props.sv', 'prep -top props', '', '[files]', 'top.v', 'props.sv', '',
  ].join('\n'));
  const [cmd, pre] = sbyCommand();
  const r = await run(cmd, [...pre, '-f', 'check.sby'], { cwd: dir, timeoutMs });
  if (r.error) return { ok: false, status: 'ERROR', output: r.error.code === 'ENOENT'
    ? 'SymbiYosys (sby) was not found. It comes with the desktop app; in development install OSS CAD Suite or SymbiYosys.' : String(r.error) };
  if (r.timedOut) return { ok: false, status: 'TIMEOUT', output: r.out + `\n[timeout] SymbiYosys stopped after ${timeoutMs / 1000}s.` };
  const status = parseStatus(r.out);
  const trace = status === 'FAIL' ? findTrace(path.join(dir, 'check')) : null;
  return { ok: status === 'PASS', status, mode, depth, output: r.out, vcd: trace ? fs.readFileSync(trace, 'utf8') : null };
}

module.exports = { runFormal, parseStatus };
