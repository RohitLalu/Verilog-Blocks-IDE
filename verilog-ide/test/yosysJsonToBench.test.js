'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { convertNetlist, sanitize } = require('../server/yosysJsonToBench.js');

const DIR = path.join(__dirname, 'fixtures', 'atpg');
const names = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const read = n => fs.readFileSync(path.join(DIR, n), 'utf8');
const body = t => t.split('\n').filter(l => !l.startsWith('#')).join('\n');          // ignore the header comments
const diverges = new Set(read('DIVERGES_FROM_PYTHON.txt').split('\n').slice(3).filter(Boolean));
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
// edge_const_inputs is a documented limitation: a constant reaching a gate that Yosys' `opt` failed to fold
test('every generated bench is structurally valid (all nets declared, driven once)', () => {
  for (const n of names.filter(n => n !== 'edge_const_inputs')) assert.deepEqual(problems(convert(n)), [], n);
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
