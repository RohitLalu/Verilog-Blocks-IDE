'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { convertNetlist, sanitize } = require('../server/yosysJsonToBench.js');
const { checkEquivalent, MODELLED } = require('./helpers/benchEval.js');

const DIR = path.join(__dirname, 'fixtures', 'atpg');
const names = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const read = n => fs.readFileSync(path.join(DIR, n), 'utf8');
const body = t => t.split('\n').filter(l => !l.startsWith('#')).join('\n');          // ignore the header comments
const diverges = new Set(read('DIVERGES_FROM_PYTHON.txt').split('\n').filter(l => /^\w+$/.test(l)));
const convert = n => convertNetlist(JSON.parse(read(n + '.json'))).text;

test('fixtures cover every Yosys cell type the converter knows', () => {
  const seen = new Set();
  for (const n of names) for (const m of Object.values(JSON.parse(read(n + '.json')).modules)) for (const c of Object.values(m.cells)) seen.add(c.type);
  for (const t of ['$_AND_', '$_NAND_', '$_OR_', '$_NOR_', '$_XOR_', '$_XNOR_', '$_NOT_', '$_BUF_', '$_ANDNOT_', '$_ORNOT_', '$_MUX_', '$_DFF_P_', '$_DFFE_PP_', '$_SDFF_PP0_', '$_DLATCH_P_', '$_TBUF_']) {
    assert.ok(seen.has(t), `no fixture exercises ${t}`);
  }
});

// ── golden output ────────────────────────────────────────────────────────────────────────
for (const n of names) {
  test(`golden: ${n}`, () => assert.equal(body(convert(n)), body(read(n + '.bench'))));
}

// ── the original Python converter is the reference for everything it handled correctly ───
const havePython = spawnSync('python3', ['--version']).status === 0;
test('matches the Python original on every fixture it handled correctly', { skip: !havePython && 'python3 not installed' }, () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vbide-py-'));
  let compared = 0;
  for (const n of names.filter(n => !diverges.has(n))) {
    const out = path.join(tmp, n + '.bench');
    const r = spawnSync('python3', [path.join(__dirname, '..', 'server', 'yosys_json_to_bench.py'), path.join(DIR, n + '.json'), out]);
    assert.equal(r.status, 0, n + ': ' + r.stderr);
    assert.equal(body(convert(n)), body(fs.readFileSync(out, 'utf8')), n);
    compared++;
  }
  assert.ok(compared >= 15, 'compared ' + compared);
});

// ── structural validity, independent of any reference ────────────────────────────────────
function problems(text) {
  const ins = new Set(), outs = new Set(), drv = new Map(), uses = [], bad = [];
  for (const l of text.split('\n')) {
    let m;
    if ((m = l.match(/^INPUT\((\S+)\)$/))) ins.add(m[1]);
    else if ((m = l.match(/^OUTPUT\((\S+)\)$/))) outs.add(m[1]);
    else if ((m = l.match(/^(\S+) = (AND|NAND|OR|NOR|XOR|XNOR|NOT|BUFF)\((.*)\)$/))) { drv.set(m[1], (drv.get(m[1]) || 0) + 1); uses.push(...m[3].split(', ')); }
    else if (l && !l.startsWith('#')) bad.push('unparseable: ' + l);
  }
  for (const [n, c] of drv) if (c > 1) bad.push('multiply driven: ' + n);
  for (const n of drv.keys()) if (ins.has(n)) bad.push('gate drives a primary input: ' + n);
  for (const u of uses) if (!ins.has(u) && !drv.has(u)) bad.push('undriven net used: ' + u);
  for (const o of outs) if (!ins.has(o) && !drv.has(o)) bad.push('output never driven: ' + o);
  return bad;
}
test('every generated bench is structurally valid (all nets declared, driven once)', () => {
  for (const n of names) assert.deepEqual(problems(convert(n)), [], n);
});

// ── functional equivalence: the bench computes the same logic as the Yosys netlist ───────
// (cells the checker doesn't model, e.g. $_TBUF_, are excluded)
const STORAGE = /^\$_(?:S?DFF|ALDFF|DLATCH|SR_)/;
const modelled = n => Object.values(JSON.parse(read(n + '.json')).modules.top.cells).every(c => MODELLED.has(c.type) || STORAGE.test(c.type));
for (const n of names.filter(modelled)) {
  test(`equivalent to the Yosys netlist: ${n}`, () => {
    const nl = JSON.parse(read(n + '.json')), r = convertNetlist(nl);
    assert.deepEqual(checkEquivalent(nl, r.text, r.bitToName), []);
  });
}

// ── constants: the bench format has none, so they must be folded into the gates that read them ──
// One cell with every combination of {signal, 0, 1} on its inputs, then a second gate reading its output so
// that a folded constant has to propagate. (On Yosys 0.9 a synchronous reset is a $_MUX_ with a constant input.)
const IN = { a: 2, b: 3, c: 4, d: 5 }, Z = 7;
function constNetlist(type, ports, choice) {                     // choice: per-port 'sig' | 0 | 1
  const dirs = { Y: 'output' }, conns = { Y: [6] };
  ports.forEach((p, i) => { dirs[p] = 'input'; conns[p] = [choice[i] === 'sig' ? 2 + i : String(choice[i])]; });
  const ins = ports.map((p, i) => choice[i] === 'sig' ? ['a', 'b', 'c'][i] : null).filter(Boolean);
  return { modules: { top: {
    ports: { a: P('input', [2]), b: P('input', [3]), c: P('input', [4]), d: P('input', [5]), y: P('output', [6]), z: P('output', [Z]) },
    cells: { g: { type, connections: conns, port_directions: dirs },
             h: { type: '$_XOR_', connections: { A: [6], B: [5], Y: [Z] }, port_directions: { A: 'input', B: 'input', Y: 'output' } } },
    netnames: { a: { bits: [2] }, b: { bits: [3] }, c: { bits: [4] }, d: { bits: [5] }, y: { bits: [6] }, z: { bits: [Z] } } } } };
}
const combos = n => [...Array(3 ** n)].map((_, k) => [...Array(n)].map((__, i) => ['sig', 0, 1][Math.floor(k / 3 ** i) % 3]));
const SHAPES = [['$_MUX_', ['A', 'B', 'S']], ['$_ANDNOT_', ['A', 'B']], ['$_ORNOT_', ['A', 'B']], ['$_NOT_', ['A']], ['$_BUF_', ['A']],
  ...['$_AND_', '$_NAND_', '$_OR_', '$_NOR_', '$_XOR_', '$_XNOR_'].map(t => [t, ['A', 'B', 'C']])];

test('every gate type is correct for every mix of signal / 0 / 1 inputs (and constants propagate)', () => {
  let n = 0;
  for (const [type, ports] of SHAPES) for (const choice of combos(ports.length)) {
    const nl = constNetlist(type, ports, choice), r = convertNetlist(nl);
    const label = `${type} ${JSON.stringify(choice)}`;
    assert.deepEqual(checkEquivalent(nl, r.text, r.bitToName), [], label + '\n' + r.text);
    assert.deepEqual(problems(r.text), [], label);
    n++;
  }
  assert.ok(n > 200, 'ran ' + n);
});

test('a constant output is left undeclared (with a note) instead of being declared and never driven', () => {
  const r = convertNetlist(constNetlist('$_AND_', ['A', 'B', 'C'], [0, 'sig', 'sig']));    // y is always 0
  assert.doesNotMatch(r.text, /^OUTPUT\(y\)$/m);
  assert.match(r.text, /^z = BUFF\(d\)$/m);                                                // z = 0 ^ d
  assert.match(r.warnings.join('\n'), /1 output bit\(s\) are constant/);
});

test('synchronous reset as Yosys 0.9 emits it ($_MUX_ with a constant 0) becomes AND-NOT logic, not a dropped input', () => {
  const nl = { modules: { top: {
    ports: { clk: P('input', [2]), rst: P('input', [3]), d: P('input', [4]), q: P('output', [6]) },
    cells: { m: { type: '$_MUX_', connections: { A: [4], B: ['0'], S: [3], Y: [5] }, port_directions: { A: 'input', B: 'input', S: 'input', Y: 'output' } },
             f: { type: '$_DFF_P_', connections: { C: [2], D: [5], Q: [6] }, port_directions: { C: 'input', D: 'input', Q: 'output' } } },
    netnames: { clk: { bits: [2] }, rst: { bits: [3] }, d: { bits: [4] }, n5: { bits: [5] }, q: { bits: [6] } } } } };
  const r = convertNetlist(nl);
  assert.match(r.text, /^INPUT\(rst\)$/m, 'rst feeds logic, so it must stay an input');
  assert.match(r.text, /AND\(d, \S+\)/);
  assert.deepEqual(checkEquivalent(nl, r.text, r.bitToName), []);
});

// ── behaviour the original got wrong: storage cells it did not know ──────────────────────
const P = (d, bits) => ({ direction: d, bits });
const flop = (type, extra = {}) => ({ modules: { top: {
  ports: { clk: P('input', [2]), rst: P('input', [3]), d: P('input', [4]), en: P('input', [5]), q: P('output', [6]) },
  cells: { f: { type, connections: { C: [2], R: [3], D: [4], E: [5], Q: [6], ...extra }, port_directions: { C: 'input', R: 'input', D: 'input', E: 'input', Q: 'output', ...Object.fromEntries(Object.keys(extra).map(k => [k, 'input'])) } } },
  netnames: { clk: { bits: [2] }, rst: { bits: [3] }, d: { bits: [4] }, en: { bits: [5] }, q: { bits: [6] } } } } });

for (const type of ['$_SDFF_NP0_', '$_SDFF_NN1_', '$_SDFFE_NP0P_', '$_SDFFCE_PP0P_', '$_DFFSR_PNN_', '$_DFFSRE_PNNP_', '$_ALDFF_PP_', '$_DLATCH_PP0_', '$_DFFE_NN0P_', '$_SR_PP_']) {
  test(`storage cell ${type} is unfolded (Q -> input, D -> output), clock/reset/enable stripped`, () => {
    const r = convertNetlist(flop(type));
    assert.deepEqual(r.warnings, [], 'must not be reported as an unknown gate');
    assert.equal(r.summary.dffs, 1);
    assert.match(r.text, /^INPUT\(q\)$/m);                    // state is controllable
    assert.match(r.text, /^OUTPUT\(d\)$/m);                   // next-state is observable
    for (const stripped of ['clk', 'rst', 'en']) assert.doesNotMatch(r.text, new RegExp(`^INPUT\\(${stripped}\\)$`, 'm'), stripped);
    assert.doesNotMatch(r.text, /BUFF/);
    assert.deepEqual(problems(r.text).filter(p => !p.startsWith('output never driven: d')), []);
  });
}

test('a clock that also feeds logic stays a primary input', () => {
  const n = flop('$_SDFF_NP0_');
  const m = n.modules.top;
  m.ports.z = P('output', [7]); m.netnames.z = { bits: [7] };
  m.cells.g = { type: '$_AND_', connections: { A: [2], B: [6], Y: [7] }, port_directions: { A: 'input', B: 'input', Y: 'output' } };
  assert.match(convertNetlist(n).text, /^INPUT\(clk\)$/m);
});

// ── misc ────────────────────────────────────────────────────────────────────────────────
test('unknown cell types become BUFF of their first input, with a warning', () => {
  const r = convertNetlist({ modules: { top: { ports: { a: P('input', [2]), y: P('output', [3]) },
    cells: { u: { type: '$_WEIRD_', connections: { A: [2], Y: [3] }, port_directions: { A: 'input', Y: 'output' } } },
    netnames: { a: { bits: [2] }, y: { bits: [3] } } } } });
  assert.match(r.text, /^y = BUFF\(a\)$/m);
  assert.match(r.warnings[0], /1 unknown cell types treated as BUFF: \$_WEIRD_/);
});

test('input without modules is rejected', () => {
  assert.throws(() => convertNetlist({ modules: {} }), /no modules in JSON/);
  assert.throws(() => convertNetlist(null), /no modules in JSON/);
});

test('sanitize keeps names legal for the bench format', () => {
  assert.equal(sanitize('a.b[3]'), 'a_b_3_');
  assert.equal(sanitize('9lives'), 'n_9lives');
  assert.equal(sanitize(''), 'unnamed');
  assert.equal(sanitize('ok_name1'), 'ok_name1');
});
