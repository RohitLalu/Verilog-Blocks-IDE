'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runAtpg, parseAtpgOutput } = require('../server/atpgRunner.js');

const have = (cmd, arg) => !spawnSync(cmd, [arg]).error;
const haveYosys = have('yosys', '-V'), haveAtalanta = have('atalanta', '--help');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-atpgr-'));
const dirs = () => { const b = tmp(); return { projDir: path.join(b, 'proj'), outDir: path.join(b, 'out') }; };

// real atalanta 2.0 summary block
const SAMPLE = `
   Number of test patterns before compaction : 5
   Number of test patterns after compaction  : 4
   Fault coverage                            : 87.500 %
   Number of collapsed faults                : 16
   Number of identified redundant faults     : 1
   Number of aborted faults                  : 1
`;

test('parseAtpgOutput reads atalanta\'s summary', () => {
  const p = parseAtpgOutput(SAMPLE);
  assert.equal(p.coverage, 87.5); assert.equal(p.total, 16); assert.equal(p.detected, 14); assert.equal(p.vectors, 4);
  assert.equal(p.faults.redundantCount, 1); assert.equal(p.faults.abortedCount, 1);
});

test('parseAtpgOutput gives null (not a fake number) when the summary is missing', () => {
  const p = parseAtpgOutput('segmentation fault');
  assert.equal(p.coverage, null); assert.equal(p.detected, null); assert.equal(p.vectors, 0);
});

test('refuses file paths that could break out of the Yosys script', async () => {
  const b = tmp();
  const r = await runAtpg({ projDir: path.join(b, 'p"; !id; "'), outDir: path.join(b, 'out'), verilog: '' });
  assert.equal(r.ok, false); assert.match(r.output, /quote or newline/);
});

test('a Yosys failure reports its stage and removes any previous results', { skip: !haveYosys && 'yosys not installed' }, async () => {
  const d = dirs(); fs.mkdirSync(d.outDir, { recursive: true });
  for (const f of ['top.bench', 'top.test', 'top_atpg.json']) fs.writeFileSync(path.join(d.outDir, f), 'STALE');
  const r = await runAtpg({ ...d, verilog: 'module top(; endmodule' });
  assert.equal(r.ok, false); assert.equal(r.stage, 'yosys'); assert.match(r.output, /Yosys synthesis failed/);
  for (const f of ['top.bench', 'top.test', 'top_atpg.json']) assert.equal(fs.existsSync(path.join(d.outDir, f)), false, f + ' left behind');
});

test('missing atalanta is reported clearly (and the converter still ran)', { skip: !haveYosys && 'yosys not installed' }, async () => {
  const bin = tmp(); fs.symlinkSync(spawnSync('which', ['yosys']).stdout.toString().trim(), path.join(bin, 'yosys'));
  const oldPath = process.env.PATH; process.env.PATH = bin;
  try {
    const r = await runAtpg({ ...dirs(), verilog: 'module top(input a, b, output y); assign y = a & b; endmodule\n' });
    assert.equal(r.ok, false); assert.equal(r.stage, 'atalanta'); assert.match(r.output, /atalanta not found/);
  } finally { process.env.PATH = oldPath; }
});

const FULL = { skip: (!haveYosys || !haveAtalanta) && 'needs yosys and atalanta on PATH' };

test('combinational design: coverage, bench, and the pattern file stays in the output folder', FULL, async () => {
  const d = dirs(); const leak = path.join(process.cwd(), 'top.test'); fs.rmSync(leak, { force: true });
  const r = await runAtpg({ ...d, verilog: 'module top(input a, b, c, output y); assign y = (a & b) | c; endmodule\n' });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.coverage, 100); assert.ok(r.total > 0); assert.match(r.bench, /^INPUT\(a\)$/m);
  assert.ok(fs.existsSync(path.join(d.outDir, 'top.test')));
  assert.equal(fs.existsSync(leak), false, 'top.test leaked into the working directory');
});

test('negative-edge flip-flop with synchronous reset ($_SDFF_NP0_) is unfolded correctly end to end', FULL, async () => {
  const r = await runAtpg({ ...dirs(), verilog:
    'module top(input clk, rst, d, output y);\n reg q; always @(negedge clk) if (rst) q <= 1\'b0; else q <= d;\n assign y = ~q;\nendmodule\n' });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.match(r.bench, /^INPUT\(q\)$/m, 'flip-flop state must be controllable');
  assert.doesNotMatch(r.bench, /BUFF\(clk\)/, 'clock must not be turned into data');
  assert.deepEqual(r.warnings, []);
});
