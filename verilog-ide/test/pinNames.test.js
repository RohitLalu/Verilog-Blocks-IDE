'use strict';
// Custom names for block pins (v2.0.2), against the real store and the real Verilog/testbench generators.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { load } = require('./helpers/loadModule.js');

const fresh = () => load('src/store/graphStore.js').default;
const { generateVerilog, generateTestbench } = load('src/codegen/graphToVerilog.js');
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells;
const cell = id => cells.find(c => c.id === id);

// xor (x1) -> and (a1): x1.X drives a1.A
function design() {
  const s = fresh(), st = () => s.getState();
  st().addBlock(cell('sky130_xor2'), { x: 0, y: 0 }); st().addBlock(cell('sky130_and2'), { x: 300, y: 0 });
  const [x1, a1] = st().nodes;
  st().onConnect({ source: x1.id, sourceHandle: 'X', target: a1.id, targetHandle: 'A' });
  return { s, st, x1: x1.id, a1: a1.id, verilog: () => generateVerilog(st().nodes, st().edges, 'p').verilog };
}

test('a renamed unconnected input / output becomes the port name in the Verilog and the testbench', () => {
  const d = design();
  assert.equal(d.st().renamePin(d.x1, 'A', 'in', 'a'), null);
  assert.equal(d.st().renamePin(d.a1, 'X', 'out', 'carry'), null);
  assert.match(d.verilog(), /input\s+wire a,/); assert.match(d.verilog(), /output wire carry/);
  assert.doesNotMatch(d.verilog(), /sky130_xor2_1_A\b/);
  const tb = generateTestbench(d.st().nodes, d.st().edges, 'p');
  assert.match(tb, /reg\s+a;/); assert.match(tb, /\.carry\(carry\)/);
});

test('renaming an output that drives a wire renames the wire (and its label on the canvas)', () => {
  const d = design();
  assert.equal(d.st().renamePin(d.x1, 'X', 'out', 'half_sum'), null);
  const e = d.st().edges[0];
  assert.equal(e.data.wireName, 'half_sum'); assert.equal(e.label, 'half_sum');
  assert.match(d.verilog(), /wire half_sum;/);
  assert.match(d.verilog(), /assign half_sum=/);
});

test('bad names are refused and change nothing', () => {
  const d = design(), before = JSON.stringify(d.st().nodes);
  for (const bad of ['2x', 'a-b', 'a b', 'module', 'wire', 'top_tb', 'x'.repeat(65)]) assert.ok(d.st().renamePin(d.x1, 'A', 'in', bad), bad);
  assert.equal(JSON.stringify(d.st().nodes), before);
});

test('two outputs, or an output and an input, cannot share a name; two inputs can (one shared port)', () => {
  const d = design();
  assert.equal(d.st().renamePin(d.a1, 'X', 'out', 'y'), null);
  assert.ok(d.st().renamePin(d.x1, 'X', 'out', 'y'), 'second output named y');
  assert.ok(d.st().renamePin(d.x1, 'A', 'in', 'y'), 'input named like an output');
  assert.ok(d.st().renamePin(d.x1, 'A', 'in', d.st().nodes[1].data.instanceName), 'input named like a block');
  assert.equal(d.st().renamePin(d.x1, 'A', 'in', 'cin'), null);
  assert.equal(d.st().renamePin(d.a1, 'B', 'in', 'cin'), null, 'a second input may share the name');
  assert.equal((d.verilog().match(/input\s+wire cin\b/g) || []).length, 1, 'one shared port');
  assert.match(d.verilog(), /=cin\^/);   // read by the xor (its A) ...
  assert.match(d.verilog(), /&cin;/);    // ... and by the and (its B)
});

test('an empty name goes back to the default; undo brings the custom name back', () => {
  const d = design();
  d.st().renamePin(d.x1, 'A', 'in', 'a');
  assert.equal(d.st().renamePin(d.x1, 'A', 'in', ''), null);
  assert.match(d.verilog(), /input\s+wire sky130_xor2_1_A/);
  d.st().undo();
  assert.match(d.verilog(), /input\s+wire a,/);
});

test('pasted copies start with default names (copied custom output names would clash)', () => {
  const d = design();
  d.st().renamePin(d.x1, 'X', 'out', 'half_sum');
  d.s.setState({ nodes: d.st().nodes.map(n => ({ ...n, selected: n.id === d.x1 })) });
  d.st().copySelection(); d.st().pasteClipboard();
  assert.equal(d.st().nodes.length, 3);
  assert.equal(d.st().nodes[2].data.pinNames, undefined);
});

const haveIverilog = spawnSync('iverilog', ['-V']).status === 0;
test('the renamed design compiles with iverilog', { skip: !haveIverilog && 'iverilog not installed' }, () => {
  const d = design();
  d.st().renamePin(d.x1, 'A', 'in', 'a'); d.st().renamePin(d.x1, 'X', 'out', 'half_sum'); d.st().renamePin(d.a1, 'X', 'out', 'carry');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-pins-'));
  fs.writeFileSync(path.join(dir, 'top.v'), d.verilog());
  fs.writeFileSync(path.join(dir, 'tb.v'), generateTestbench(d.st().nodes, d.st().edges, 'p'));
  const r = spawnSync('iverilog', ['-o', path.join(dir, 'sim'), path.join(dir, 'tb.v'), path.join(dir, 'top.v')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
