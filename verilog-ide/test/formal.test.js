'use strict';
// Formal verification (SymbiYosys): the properties template, and real runs with the bundled sby when present.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { load } = require('./helpers/loadModule.js');
const { generateFormalProps } = load('src/codegen/formalTemplate.js');
const { generateVerilog } = load('src/codegen/graphToVerilog.js');
const { runFormal, parseStatus } = require('../server/formalRunner.js');
const { hostTarget } = require('../scripts/fetch-tools.js');
const fresh = () => load('src/store/graphStore.js').default;
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells;

// the bundled tools (npm run fetch-tools) first, as the desktop app does
const bundle = path.join(__dirname, '..', 'resources', 'tools', hostTarget());
if (fs.existsSync(path.join(bundle, 'bin'))) {
  process.env.PATH = [path.join(bundle, 'bin'), ...(process.platform === 'win32' ? [path.join(bundle, 'lib')] : []), process.env.PATH].join(path.delimiter);
  process.env.VBIDE_PYTHON = process.platform === 'win32' ? path.join(bundle, 'lib', 'python3.exe') : path.join(bundle, 'bin', 'tabbypy3');
}
const haveSby = process.platform === 'win32' ? fs.existsSync(path.join(bundle, 'bin', 'sby-script.py')) : spawnSync('sby', ['--version']).status === 0;

function andGate() {
  const s = fresh(), st = () => s.getState();
  st().addBlock(cells.find(c => c.id === 'sky130_and2'), { x: 0, y: 0 });
  const id = st().nodes[0].id;
  st().renamePin(id, 'A', 'in', 'a'); st().renamePin(id, 'B', 'in', 'b'); st().renamePin(id, 'X', 'out', 'y');
  return st();
}

test('the properties template wraps the design with every port connected, and only example (commented) checks', () => {
  const { nodes, edges } = andGate();
  const p = generateFormalProps(nodes, edges);
  assert.match(p, /module props \(\n    input  wire a,\n    input  wire b\n\);/);
  assert.match(p, /wire y;/); assert.match(p, /top dut \(\n        \.a\(a\),\n        \.b\(b\),\n        \.y\(y\)\n    \);/);
  assert.match(p, /\/\/ assert \(y == \(a & b\)\);/);
  assert.doesNotMatch(p.replace(/\/\/.*$/gm, ''), /assert/, 'no live assertion until the student writes one');
});

test('the SymbiYosys result line is read', () => {
  assert.equal(parseStatus('SBY 1:2 [check] DONE (PASS, rc=0)'), 'PASS');
  assert.equal(parseStatus('SBY [check] DONE (FAIL, rc=2)'), 'FAIL');
  assert.equal(parseStatus('crashed'), 'ERROR');
});

test('an unknown mode is refused before anything runs', async () => {
  const r = await runFormal({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-formal-')), mode: 'rm -rf', props: '' });
  assert.equal(r.status, 'ERROR'); assert.match(r.output, /Unknown mode/);
});

test('a true property is proved; a false one fails with a counterexample waveform', { skip: !haveSby && 'needs SymbiYosys (npm run fetch-tools)' }, async () => {
  const { nodes, edges } = andGate();
  const verilog = generateVerilog(nodes, edges, 'p').verilog;
  const withAssert = a => generateFormalProps(nodes, edges).replace(/        \/\/ assert .*\n/, `        assert (${a});\n`);
  const good = await runFormal({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-formal-')), verilog, props: withAssert('y == (a & b)') });
  assert.equal(good.status, 'PASS', good.output.slice(-1500));
  const bad = await runFormal({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-formal-')), verilog, props: withAssert('y == (a | b)'), mode: 'bmc', depth: 3 });
  assert.equal(bad.status, 'FAIL', bad.output.slice(-1500));
  assert.match(bad.vcd || '', /\$enddefinitions/, 'counterexample trace');
});
