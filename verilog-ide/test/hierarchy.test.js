'use strict';
// A design built from a saved design (hierarchy): half adder -> block -> full adder from two of them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { load } = require('./helpers/loadModule.js');
const { generateVerilog, generateTestbench, exportAsBlock } = load('src/codegen/graphToVerilog.js');
const { parseVCD, getValueAt } = load('src/lib/vcdParser.js');
const { runSimulation } = require('../server/simRunner.js');
const { runAtpg } = require('../server/atpgRunner.js');
const fresh = () => load('src/store/graphStore.js').default;
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells;
const cell = id => cells.find(c => c.id === id);
const have = t => spawnSync(t, ['-V']).status === 0 || spawnSync(t, ['--help']).status !== null && !spawnSync(t, ['--help']).error;

// half adder: s = a ^ b, c = a & b (the two gates share the named inputs a and b)
function halfAdderBlock() {
  const s = fresh(), st = () => s.getState();
  st().addBlock(cell('sky130_xor2'), { x: 0, y: 0 }); st().addBlock(cell('sky130_and2'), { x: 0, y: 200 });
  const [x, a] = st().nodes.map(n => n.id);
  for (const [id, pin, dir, name] of [[x, 'A', 'in', 'a'], [x, 'B', 'in', 'b'], [a, 'A', 'in', 'a'], [a, 'B', 'in', 'b'], [x, 'X', 'out', 's'], [a, 'X', 'out', 'c']])
    assert.equal(st().renamePin(id, pin, dir, name), null, `${pin} -> ${name}`);
  const { nodes, edges } = st();
  // what the "Export as Hierarchy" dialog saves
  return { ...exportAsBlock(nodes, edges, { blockId: 'half_adder', label: 'HA' }), verilogCode: generateVerilog(nodes, edges, 'half_adder').verilog, isHierarchical: true, sourceProject: 'half_adder' };
}

function fullAdder() {
  const ha = halfAdderBlock();
  assert.deepEqual(ha.ports.inputs.map(p => p.name), ['a', 'b']); assert.deepEqual(ha.ports.outputs.map(p => p.name), ['s', 'c']);
  const s = fresh(), st = () => s.getState();
  st().addBlock(ha, { x: 0, y: 0 }); st().addBlock(ha, { x: 300, y: 0 }); st().addBlock(cell('sky130_or2'), { x: 600, y: 100 });
  const [h1, h2, o] = st().nodes.map(n => n.id);
  st().onConnect({ source: h1, sourceHandle: 's', target: h2, targetHandle: 'a' });
  st().onConnect({ source: h1, sourceHandle: 'c', target: o, targetHandle: 'A' });
  st().onConnect({ source: h2, sourceHandle: 'c', target: o, targetHandle: 'B' });
  for (const [id, pin, dir, name] of [[h1, 'a', 'in', 'x'], [h1, 'b', 'in', 'y'], [h2, 'b', 'in', 'cin'], [h2, 's', 'out', 'sum'], [o, 'X', 'out', 'cout']])
    assert.equal(st().renamePin(id, pin, dir, name), null, `${pin} -> ${name}`);
  return st();
}

test('a saved design placed as a block is instantiated, and its module is defined once, after the top module', () => {
  const { nodes, edges } = fullAdder();
  const v = generateVerilog(nodes, edges, 'full_adder').verilog;
  assert.equal((v.match(/^\s*module half_adder\b/gm) || []).length, 1, v);
  assert.equal((v.match(/^\s*module /gm) || []).length, 2, 'top + half_adder, nothing nested');
  assert.equal((v.match(/^\s*half_adder half_adder_\d \(/gm) || []).length, 2);
  assert.ok(v.indexOf('module half_adder') > v.indexOf('endmodule'), 'sub-module after the top module');
});

test('simulated: the full adder built from two half adders matches the truth table', { skip: !have('iverilog') && 'iverilog not installed' }, async () => {
  const { nodes, edges } = fullAdder();
  const seq = bits => ({ type: 'sequence', period: 10, values: bits });
  const tb = generateTestbench(nodes, edges, 'p', { x: seq([0, 1, 0, 1, 0, 1, 0, 1]), y: seq([0, 0, 1, 1, 0, 0, 1, 1]), cin: seq([0, 0, 0, 0, 1, 1, 1, 1]) });
  const r = await runSimulation({ simDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-hier-')), verilog: generateVerilog(nodes, edges, 'p').verilog, testbench: tb });
  assert.equal(r.ok, true, r.output);
  const v = parseVCD(r.vcd), sig = n => v.signals.find(s => s.name === n);
  for (let k = 0; k < 8; k++) {
    const t = ((k + 1) * 10 + 5) * 1000, at = n => getValueAt(sig(n), t);   // mid-step, in ps
    const x = at('x'), y = at('y'), c = at('cin');
    assert.equal(at('sum'), x ^ y ^ c, `sum for ${x}${y}${c}`);
    assert.equal(at('cout'), (x & y) | (c & (x ^ y)), `cout for ${x}${y}${c}`);
  }
});

test('Yosys reads it, and ATPG flattens it', { skip: !have('yosys') && 'yosys not installed' }, async () => {
  const { nodes, edges } = fullAdder();
  const verilog = generateVerilog(nodes, edges, 'p').verilog;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-hier-'));
  fs.writeFileSync(path.join(dir, 'top.v'), verilog);
  const y = spawnSync('yosys', ['-q', '-p', `read_verilog ${path.join(dir, 'top.v')}; hierarchy -check -top top; synth -top top -flatten`], { encoding: 'utf8' });
  assert.equal(y.status, 0, y.stderr + y.stdout);
  const a = await runAtpg({ projDir: path.join(dir, 'p'), outDir: path.join(dir, 'atpg'), verilog });
  assert.ok(a.ok || a.stage === 'atalanta', JSON.stringify(a).slice(0, 400));   // without atalanta, Yosys + converter must still succeed
  if (a.ok) assert.ok(a.coverage > 0);
});
