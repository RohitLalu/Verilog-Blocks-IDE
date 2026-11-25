'use strict';
// What the assistant is told about the student's work (src/lib/assistantContext.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./helpers/loadModule.js');
const { buildContext } = load('src/lib/assistantContext.js');
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells;
const node = (id, n) => ({ id: n, data: { ...cells.find(c => c.id === id), instanceName: n } });

test('an empty canvas is said so plainly', () => {
  assert.match(buildContext({ nodes: [] }), /canvas is empty/);
});

test('the cells, the Verilog and every latest result are included', () => {
  const ctx = buildContext({
    nodes: [node('sky130_xor2', 'x1'), node('sky130_xor2', 'x2'), node('sky130_and2', 'a1')], pdkName: 'SkyWater SKY130',
    verilog: 'module top(input a); endmodule', simOutput: 'Compile error: foo.v:3: syntax error', lastVCD: null,
    staResult: { clockPeriod: 10, criticalSlack: 9.42, violations: [], maxFrequencyMHz: 1724.1, criticalPath: [{ netId: 'x1_X', arrival: 0.25 }, { netId: 'a1_X', arrival: 0.4 }] },
    atpgResult: { ok: true, coverage: 100, detected: 20, total: 20, vectors: 7, faults: { redundantCount: 0, abortedCount: 0 } },
    synthesisOutput: 'x'.repeat(5000) + '\nNumber of cells: 3\nERROR: none',
  });
  assert.match(ctx, /SkyWater SKY130/);
  assert.match(ctx, /2 x XOR2 \(sky130_fd_sc_hd__xor2_1\): X=A\^B, typical delay 0\.25 ns/);
  assert.match(ctx, /1 x AND2/);
  assert.match(ctx, /module top\(input a\); endmodule/);
  assert.match(ctx, /syntax error/);
  assert.match(ctx, /worst slack 9\.42 ns, 0 setup violations, maximum frequency 1724\.1 MHz/);
  assert.match(ctx, /x1_X \(arrives 0\.25 ns\) -> a1_X/);
  assert.match(ctx, /100% fault coverage, 20 of 20 faults detected, 7 test vectors/);
  assert.match(ctx, /Number of cells: 3\nERROR: none/, 'the end of the Yosys log (errors, statistics) is kept');
  assert.ok(ctx.length < 6000 + 4000, 'trimmed for a small model');
});

test('a failed ATPG run passes on its stage and message', () => {
  const ctx = buildContext({ nodes: [node('sky130_inv', 'i1')], atpgResult: { ok: false, stage: 'atalanta', output: 'ERROR: atalanta not found on PATH.' } });
  assert.match(ctx, /ATPG failed at the atalanta step:\nERROR: atalanta not found/);
});

test('the tutor is told how far along the flow the student is', () => {
  const n = [{ id: 'x', data: { id: 'sky130_inv', label: 'INV', instanceName: 'i1' } }];
  assert.match(buildContext({ nodes: n }), /Flow so far: design: started; simulation: not yet; timing check: not yet; synthesis: not yet; test vectors \(ATPG\): not yet; formal verification: not yet/);
  const later = buildContext({ nodes: n, simOutput: 'ok', lastVCD: 'vcd', staResult: { clockPeriod: 10, criticalSlack: 1, violations: [], criticalPath: [] },
    atpgResult: { ok: true, coverage: 96.5, detected: 1, total: 1, vectors: 1 }, synthesisOutput: 'ERROR: no liberty' });
  assert.match(later, /simulation: done \(waveform produced\); timing check: done \(no violations\); synthesis: tried, failed; test vectors \(ATPG\): done \(96\.5% coverage\)/);
});
