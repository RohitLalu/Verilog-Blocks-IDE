'use strict';
// Runs a cocotb test (Python) against the design with Icarus Verilog. Needs Python 3 with cocotb installed
// (python -m pip install cocotb); iverilog/vvp come from PATH, which in the desktop app means its bundled copies.
// Shared by the desktop app and the Docker server.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.js');

const DEFAULT_TIMEOUT_MS = Number(process.env.VBIDE_COCOTB_TIMEOUT_MS) || 120000;
const PYTHONS = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];

// cocotb's Python runner: build with Icarus, run test_top.py against the module "top"
const RUN_PY = `import os, sys
try:
    from cocotb_tools.runner import get_runner   # cocotb 2.x
except ImportError:
    try:
        from cocotb.runner import get_runner     # cocotb 1.8 / 1.9
    except ImportError:
        sys.exit("VBIDE: cocotb is not installed for this Python. Install it with:  python -m pip install cocotb")
r = get_runner("icarus")
# the desktop app's space-free alias of its tools folder (iverilog breaks on a space in its own path)
extra = ["-B" + os.environ["VBIDE_IVL_BASE"]] if os.environ.get("VBIDE_IVL_BASE") else []
r.build(sources=["top.v"], hdl_toplevel="top", always=True, timescale=("1ns", "1ps"), build_args=extra)
r.test(hdl_toplevel="top", test_module="test_top")
`;

// cocotb prints "** TESTS=2 PASS=1 FAIL=1 SKIP=0 ..." at the end
function parseSummary(out) {
  const m = out.match(/TESTS=(\d+)\s+PASS=(\d+)\s+FAIL=(\d+)(?:\s+SKIP=(\d+))?/);
  return m ? { tests: +m[1], passed: +m[2], failed: +m[3], skipped: +(m[4] || 0) } : null;
}

async function runCocotb({ dir, verilog, testPy, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(path.join(dir, 'sim_build'), { recursive: true, force: true });   // never report an old run
  fs.writeFileSync(path.join(dir, 'top.v'), verilog || '');
  fs.writeFileSync(path.join(dir, 'test_top.py'), testPy || '');
  fs.writeFileSync(path.join(dir, 'run_cocotb.py'), RUN_PY);
  for (const py of [process.env.VBIDE_PYTHON, ...PYTHONS].filter(Boolean)) {
    const r = await run(py, py === 'py' ? ['-3', 'run_cocotb.py'] : ['run_cocotb.py'], { cwd: dir, timeoutMs });
    if (r.error?.code === 'ENOENT') continue;                                 // try the next name for Python
    if (r.error) return { ok: false, output: String(r.error) };
    if (r.timedOut) return { ok: false, output: r.out + `\n[timeout] cocotb stopped after ${timeoutMs / 1000}s.` };
    const summary = parseSummary(r.out);
    return { ok: !!summary && summary.failed === 0 && r.code === 0, summary, output: r.out };
  }
  return { ok: false, output: 'Python 3 was not found. cocotb tests need Python 3 with cocotb: install Python from https://www.python.org, then run  python -m pip install cocotb' };
}

module.exports = { runCocotb, parseSummary, PYTHONS };
