'use strict';
// Run with:  npm test      (needs iverilog + vvp on PATH; tests are skipped otherwise)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runSimulation } = require('../server/simRunner.js');

const haveIverilog = spawnSync('iverilog', ['-V']).status === 0;
const opts = { skip: !haveIverilog && 'iverilog not installed' };

const DUT = 'module top(input a, output y); assign y = ~a; endmodule\n';
const tb = ({ dump = '$dumpfile("wave.vcd"); $dumpvars(0, tb);', body = '#5 a=1; #5 $finish;' } = {}) =>
  `module tb; reg a=0; wire y; top dut(.a(a),.y(y)); initial begin ${dump} ${body} end endmodule\n`;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-sim-'));

test('returns the waveform and writes it inside the sim dir, not the process cwd', opts, async () => {
  const simDir = tmp(), cwdBefore = fs.existsSync('wave.vcd');
  const r = await runSimulation({ simDir, verilog: DUT, testbench: tb() });
  assert.equal(r.ok, true, r.output);
  assert.match(r.vcd, /\$enddefinitions/);
  assert.ok(fs.existsSync(path.join(simDir, 'wave.vcd')));
  assert.equal(fs.existsSync('wave.vcd'), cwdBefore, 'wave.vcd leaked into the process cwd');
});

test('never returns a stale waveform from a previous run', opts, async () => {
  const simDir = tmp();
  assert.ok((await runSimulation({ simDir, verilog: DUT, testbench: tb() })).vcd);
  const r = await runSimulation({ simDir, verilog: DUT, testbench: tb({ dump: '', body: '#5 $finish;' }) });
  assert.equal(r.vcd, null);
  assert.match(r.output, /No \.vcd file was produced/);
});

test('picks up a VCD even if the testbench names it something else', opts, async () => {
  const r = await runSimulation({ simDir: tmp(), verilog: DUT, testbench: tb({ dump: '$dumpfile("custom.vcd"); $dumpvars(0, tb);' }) });
  assert.match(r.vcd, /\$enddefinitions/);
});

test('kills a runaway simulation and still reports it', opts, async () => {
  const t0 = Date.now();
  const r = await runSimulation({ simDir: tmp(), verilog: DUT, testbench: tb({ body: 'forever #5 a = ~a;' }), timeoutMs: 1500 });
  assert.equal(r.ok, false);
  assert.match(r.output, /\[timeout\]/);
  assert.ok(Date.now() - t0 < 8000, 'did not return promptly');
  const left = spawnSync('pgrep', ['-f', 'vvp sim.out']);
  if (left.status !== 2) assert.notEqual(left.status, 0, 'orphaned vvp process left running');
});

test('reports compile errors without running vvp', opts, async () => {
  const r = await runSimulation({ simDir: tmp(), verilog: 'module top(; endmodule', testbench: tb() });
  assert.equal(r.ok, false);
  assert.match(r.output, /^Compile error:/);
  assert.equal(r.vcd, null);
});
