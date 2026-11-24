'use strict';
// The generated testbench (src/codegen/graphToVerilog.js): every input's stimulus runs in parallel, one period per step.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { load } = require('./helpers/loadModule.js');
const { generateVerilog, generateTestbench } = load('src/codegen/graphToVerilog.js');
const { parseVCD } = load('src/lib/vcdParser.js');
const { runSimulation } = require('../server/simRunner.js');

const and2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells.find(c => c.id === 'sky130_and2');
const nodes = [{ id: 'n1', type: 'blockNode', position: { x: 0, y: 0 }, data: { ...and2, instanceName: 'g', paramValues: {} } }];
const tbInputs = { g_A: { type: 'sequence', values: [1, 0, 1], period: 10 }, g_B: { type: 'sequence', values: [1, 1, 0], period: 5 } };

test('each stimulated input has its own initial block, and every step waits exactly one period', () => {
  const tb = generateTestbench(nodes, [], 'p', tbInputs);
  const blocks = tb.split('initial begin').slice(1);
  assert.ok(blocks.some(b => /#10;\s+g_A=1'b1;\s+#10;\s+g_A=1'b0;\s+#10;\s+g_A=1'b1;\s+end/.test(b)), tb);
  assert.ok(blocks.some(b => /#5;\s+g_B=1'b1;\s+#5;\s+g_B=1'b1;\s+#5;\s+g_B=1'b0;\s+end/.test(b)), tb);
  assert.match(tb, /#40; \$display\("Simulation done."\); \$finish;/, 'ends one period after the longest stimulus (3 x 10 + 10)');
});

const haveIverilog = spawnSync('iverilog', ['-V']).status === 0;
test('simulated: both inputs change at the same time, at multiples of their own period', { skip: !haveIverilog && 'iverilog not installed' }, async () => {
  const { verilog } = generateVerilog(nodes, [], 'p');
  const r = await runSimulation({ simDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-tb-')), verilog, testbench: generateTestbench(nodes, [], 'p', tbInputs) });
  assert.equal(r.ok, true, r.output);
  const v = parseVCD(r.vcd), times = name => v.signals.find(s => s.name === name).transitions.map(t => t.time / 1000);   // 1ps units -> ns
  assert.deepEqual(times('g_A'), [0, 10, 20, 30]);
  assert.deepEqual(times('g_B'), [0, 5, 15]);          // 0 -> 1 at 5, stays 1 at 10, -> 0 at 15
  assert.deepEqual(times('g_X'), [0, 10, 15]);         // A & B: 1 at 10 (both 1), 0 at 15 (B low); A=1 again at 30 but B is 0
});
