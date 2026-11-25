'use strict';
// cocotb testbenches: the generated Python test, and a real run with Icarus Verilog when Python + cocotb are installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { load } = require('./helpers/loadModule.js');
const { generateCocotbTest } = load('src/codegen/cocotbTemplate.js');
const { generateVerilog } = load('src/codegen/graphToVerilog.js');
const { runCocotb, parseSummary } = require('../server/cocotbRunner.js');
const fresh = () => load('src/store/graphStore.js').default;
const { hostTarget } = require('../scripts/fetch-tools.js');
// the bundled Python (cocotb + pyuvm) and Icarus, as the desktop app uses them, when npm run fetch-tools has run
const bundle = path.join(__dirname, '..', 'resources', 'tools', hostTarget());
const bundledPy = path.join(bundle, 'bin', 'tabbypy3');
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells;
const cell = id => cells.find(c => c.id === id);

function andGate() {   // y = a & b, with named ports
  const s = fresh(), st = () => s.getState();
  st().addBlock(cell('sky130_and2'), { x: 0, y: 0 });
  const id = st().nodes[0].id;
  st().renamePin(id, 'A', 'in', 'a'); st().renamePin(id, 'B', 'in', 'b'); st().renamePin(id, 'X', 'out', 'y');
  return st();
}

test('the generated test drives every input, logs the outputs, and shows where checks go', () => {
  const { nodes, edges } = andGate();
  const py = generateCocotbTest(nodes, edges);
  assert.match(py, /@cocotb\.test\(\)/);
  assert.match(py, /dut\.a\.value = random\.randint\(0, 1\)/); assert.match(py, /dut\.b\.value = random\.randint\(0, 1\)/);
  assert.match(py, /await Timer\(10, "ns"\)/);
  assert.match(py, /a=\{int\(dut\.a\.value\)\} b=\{int\(dut\.b\.value\)\} -> y=\{int\(dut\.y\.value\)\}/);
  assert.match(py, /# assert int\(dut\.y\.value\) == expected/);
});

test('cocotb\'s summary line is read', () => {
  assert.deepEqual(parseSummary('...\n** TESTS=2 PASS=1 FAIL=1 SKIP=0     0.01 ...'), { tests: 2, passed: 1, failed: 1, skipped: 0 });
  assert.equal(parseSummary('no summary'), null);
});

const haveCocotb = spawnSync('python3', ['-c', 'import cocotb'], { encoding: 'utf8' }).status === 0 && spawnSync('iverilog', ['-V']).status === 0;
test('a real cocotb run: a passing check passes, a wrong check fails', { skip: !haveCocotb && 'needs python3 with cocotb, and iverilog' }, async () => {
  const { nodes, edges } = andGate();
  const verilog = generateVerilog(nodes, edges, 'p').verilog;
  const check = expr => generateCocotbTest(nodes, edges).replace(/        # assert .*\n/, `        assert int(dut.y.value) == (${expr}), "y is wrong"\n`);
  const good = await runCocotb({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-cocotb-')), verilog, testPy: check('int(dut.a.value) & int(dut.b.value)') });
  assert.equal(good.ok, true, good.output.slice(-1500));
  assert.deepEqual(good.summary, { tests: 1, passed: 1, failed: 0, skipped: 0 });
  const bad = await runCocotb({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-cocotb-')), verilog, testPy: check('int(dut.a.value) | int(dut.b.value)') });
  assert.equal(bad.ok, false); assert.equal(bad.summary.failed, 1); assert.match(bad.output, /y is wrong/);
});

test('the UVM (pyuvm) template runs and passes on the bundled Python', { skip: !(process.platform !== 'win32' && fs.existsSync(bundledPy)) && 'needs the bundled Python (npm run fetch-tools; not on Windows)' }, async () => {
  const { nodes, edges } = andGate();
  const py = generateCocotbTest(nodes, edges, 'pyuvm');
  assert.match(py, /class Driver\(uvm_driver\)/); assert.match(py, /@pyuvm\.test\(\)/);
  const old = { PATH: process.env.PATH, PY: process.env.VBIDE_PYTHON };
  process.env.PATH = [path.join(bundle, 'bin'), process.env.PATH].join(path.delimiter); process.env.VBIDE_PYTHON = bundledPy;
  try {
    const r = await runCocotb({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-pyuvm-')), verilog: generateVerilog(nodes, edges, 'p').verilog, testPy: py });
    assert.equal(r.ok, true, r.output.slice(-2000));
    assert.equal(r.summary.passed, 1);
    assert.match(r.output, /a=\d b=\d -> \{'y': \d\}/, 'the scoreboard logged results');
  } finally { process.env.PATH = old.PATH; if (old.PY === undefined) delete process.env.VBIDE_PYTHON; else process.env.VBIDE_PYTHON = old.PY; }
});
