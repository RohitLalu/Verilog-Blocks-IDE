'use strict';
// Run with:  npm test      (the end-to-end test needs yosys on PATH and is skipped otherwise)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runSynthesis } = require('../server/synthRunner.js');
const { findLiberty } = require('../server/pdkFiles.js');
const { removeCells } = require('../server/libertyFilter.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-synth-'));
const touch = (p, text = '') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const SKY_LIB = 'sky130_fd_sc_hd__tt_025C_1v80.lib';
const run = (over = {}) => {
  const base = tmp();
  return { base, args: { projDir: path.join(base, 'proj'), outDir: path.join(base, 'out'), verilog: 'module top(input a, output y); assign y = ~a; endmodule\n', ...over } };
};

// ── refusal policy: no Liberty → ask for the path, never start Yosys ────────────────────
test('refuses when no PDK is selected', async () => {
  const { args } = run();
  const r = await runSynthesis({ ...args, pdkId: null, pdkRoot: '' });
  assert.equal(r.ok, false); assert.equal(r.needsPdkPath, true);
  assert.match(r.output, /PDK selector/);
  assert.equal(fs.existsSync(args.outDir), false, 'yosys work dir should not be created');
});

test('refuses when the PDK path is empty, and names the missing library', async () => {
  const { args } = run();
  const r = await runSynthesis({ ...args, pdkId: 'sky130', pdkRoot: '' });
  assert.equal(r.needsPdkPath, true);
  assert.match(r.output, new RegExp(SKY_LIB));
  assert.equal(fs.existsSync(args.outDir), false);
});

test('refuses when the PDK path does not exist', async () => {
  const r = await runSynthesis({ ...run().args, pdkId: 'gf180', pdkRoot: '/no/such/dir' });
  assert.equal(r.needsPdkPath, true); assert.match(r.output, /does not exist/);
});

test('refuses when the path exists but holds no Liberty library', async () => {
  const r = await runSynthesis({ ...run().args, pdkId: 'sky130', pdkRoot: tmp() });
  assert.equal(r.needsPdkPath, true); assert.match(r.output, /Could not find the Liberty library/);
});

test('an unsupported PDK is an error, not a path problem', async () => {
  const r = await runSynthesis({ ...run().args, pdkId: 'asap7', pdkRoot: tmp() });
  assert.equal(r.ok, false); assert.notEqual(r.needsPdkPath, true); assert.match(r.output, /not supported/);
});

test('refuses file paths that could break out of the Yosys script', async () => {
  const root = tmp(); touch(path.join(root, 'a/b', SKY_LIB), 'library (x) { cell ("sky130_fd_sc_hd__inv_1") { } }');
  const base = tmp();
  const r = await runSynthesis({ projDir: path.join(base, 'p"; !id; "'), outDir: path.join(base, 'out'), verilog: '', pdkId: 'sky130', pdkRoot: root });
  assert.equal(r.ok, false); assert.match(r.output, /quote or newline/);
});

// ── Liberty discovery ───────────────────────────────────────────────────────────────────
test('finds the sky130 library in a ciel-style tree', () => {
  const root = tmp(); const p = touch(path.join(root, 'sky130A/libs.ref/sky130_fd_sc_hd/lib', SKY_LIB));
  assert.equal(findLiberty('sky130', root), p);
});

test('gf180: prefers 3v30, accepts the legacy 3v3 name, falls back to any typical corner', () => {
  const L = 'gf180mcu_fd_sc_mcu7t5v0__tt_025C_';
  let root = tmp(); touch(path.join(root, 'lib', L + '3v3.lib')); const want = touch(path.join(root, 'lib', L + '3v30.lib'));
  assert.equal(findLiberty('gf180', root), want);
  root = tmp(); const legacy = touch(path.join(root, 'lib', L + '3v3.lib'));
  assert.equal(findLiberty('gf180', root), legacy);
  root = tmp(); const other = touch(path.join(root, 'lib', L + '5v00.lib')); touch(path.join(root, 'lib', 'gf180mcu_fd_sc_mcu7t5v0__ff_n40C_5v50.lib'));
  assert.equal(findLiberty('gf180', root), other, 'must pick a typical corner, not ff');
});

test('returns null for unknown PDKs and missing paths', () => {
  assert.equal(findLiberty('nope', tmp()), null);
  assert.equal(findLiberty('sky130', '/no/such/dir'), null);
  assert.equal(findLiberty('sky130', ''), null);
});

// ── Liberty filtering ───────────────────────────────────────────────────────────────────
test('removeCells drops only the named cells and keeps the file balanced', () => {
  const lib = 'library (l) {\n  cell ("p__inv_1") { pin (A) { function : "!B{"; } }\n  cell ("p__clkinv_1") { area : 1; pin (Y) { x : { y } ; } }\n  cell ("p__nand2_1") { area : 2; }\n}\n';
  // note: `{` inside a quoted string must not confuse the brace matching
  const { text, removed } = removeCells(lib, /__clkinv/);
  assert.deepEqual(removed, ['p__clkinv_1']);
  assert.ok(text.includes('p__inv_1') && text.includes('p__nand2_1') && !text.includes('clkinv'));
  const depth = [...text.replace(/"[^"]*"/g, '')].reduce((d, c) => d + (c === '{') - (c === '}'), 0);
  assert.equal(depth, 0);
});

// ── end to end with real Yosys + ABC on a small Liberty ─────────────────────────────────
const haveYosys = spawnSync('yosys', ['-V']).status === 0;
test('maps a design onto the PDK cells and reports what it used', { skip: !haveYosys && 'yosys not installed' }, async () => {
  const root = tmp(); touch(path.join(root, 'sky130A/libs.ref/sky130_fd_sc_hd/lib', SKY_LIB), fs.readFileSync(path.join(__dirname, 'fixtures/sky130_mini.lib')));
  const { args } = run({ verilog: 'module top(input a, b, c, clk, output y, output reg q);\n assign y = (a & b) | c;\n always @(posedge clk) q <= y;\nendmodule\n' });
  const r = await runSynthesis({ ...args, pdkId: 'sky130', pdkRoot: root });
  assert.equal(r.ok, true, r.output);
  assert.ok(r.cells['sky130_fd_sc_hd__dfxtp_1'] >= 1, 'flip-flop should map to dfxtp_1');
  assert.deepEqual(r.unmapped, {}, 'nothing should be left as a generic Yosys cell');
  assert.ok(Object.keys(r.cells).every(t => t.startsWith('sky130_fd_sc_hd__')), JSON.stringify(r.cells));
  assert.ok(r.area > 0);
  assert.ok(fs.existsSync(path.join(args.outDir, 'top_synth.v')));
});

test('a failed run never leaves the previous netlist behind', { skip: !haveYosys && 'yosys not installed' }, async () => {
  const root = tmp(); touch(path.join(root, 'x', SKY_LIB), fs.readFileSync(path.join(__dirname, 'fixtures/sky130_mini.lib')));
  const { args } = run();
  assert.equal((await runSynthesis({ ...args, pdkId: 'sky130', pdkRoot: root })).ok, true);
  const bad = await runSynthesis({ ...args, verilog: 'module top(; endmodule', pdkId: 'sky130', pdkRoot: root });
  assert.equal(bad.ok, false);
  assert.equal(fs.existsSync(path.join(args.outDir, 'top_synth.v')), false);
});
