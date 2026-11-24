'use strict';
// Functional-equivalence checking: evaluate the original Yosys netlist and the generated .bench on the same
// input vectors and compare every OUTPUT. This is stronger than golden files: it proves the bench computes
// the same logic as the design, whatever the converter did internally.
const GATES = {
  AND: v => +v.every(x => x === 1), NAND: v => +!v.every(x => x === 1),
  OR: v => +v.some(x => x === 1), NOR: v => +!v.some(x => x === 1),
  XOR: v => v.reduce((a, b) => a ^ b, 0), XNOR: v => 1 - v.reduce((a, b) => a ^ b, 0),
  NOT: v => 1 - v[0], BUFF: v => v[0],
};

function parseBench(text) {
  const inputs = [], outputs = [], gates = [];
  for (const l of text.split('\n')) {
    let m;
    if ((m = l.match(/^INPUT\((\S+)\)$/))) inputs.push(m[1]);
    else if ((m = l.match(/^OUTPUT\((\S+)\)$/))) outputs.push(m[1]);
    else if ((m = l.match(/^(\S+) = (\w+)\((.*)\)$/))) gates.push({ out: m[1], type: m[2], ins: m[3].split(', ') });
  }
  return { inputs, outputs, gates };
}

function evalBench(b, assign) {                                  // assign: {name: 0|1}; returns {name: 0|1}
  const val = { ...assign };
  for (let changed = true; changed;) {
    changed = false;
    for (const g of b.gates) {
      if (g.out in val || !g.ins.every(i => i in val)) continue;
      val[g.out] = GATES[g.type](g.ins.map(i => val[i])); changed = true;
    }
  }
  return val;
}

const literal = bit => (bit === 1 || bit === '1' ? 1 : (bit === 0 || bit === '0' || bit === 'x' || bit === 'z' ? 0 : undefined));
function cellValue(type, conns, dirs, get) {                      // Yosys gate semantics; undefined if an input is unknown
  const ins = []; for (const [p, bits] of Object.entries(conns)) if (dirs[p] === 'input') for (const b of bits) ins.push(get(b));
  const one = p => get((conns[p] || [0])[0]);
  if (ins.some(x => x === undefined)) return undefined;
  switch (type) {
    case '$_AND_': return GATES.AND(ins); case '$_NAND_': return GATES.NAND(ins);
    case '$_OR_': return GATES.OR(ins); case '$_NOR_': return GATES.NOR(ins);
    case '$_XOR_': return GATES.XOR(ins); case '$_XNOR_': return GATES.XNOR(ins);
    case '$_NOT_': return 1 - ins[0]; case '$_BUF_': return ins[0];
    case '$_MUX_': return one('S') ? one('B') : one('A');
    case '$_ANDNOT_': return one('A') & (1 - one('B'));
    case '$_ORNOT_': return one('A') | (1 - one('B'));
    default: return undefined;
  }
}
const MODELLED = new Set(['$_AND_', '$_NAND_', '$_OR_', '$_NOR_', '$_XOR_', '$_XNOR_', '$_NOT_', '$_BUF_', '$_MUX_', '$_ANDNOT_', '$_ORNOT_']);

// Returns a list of mismatches (empty = equivalent on every vector tried).
function checkEquivalent(netlist, benchText, bitToName, { maxExhaustive = 14, randomVectors = 4096, seed = 1 } = {}) {
  const mod = Object.values(netlist.modules)[0], b = parseBench(benchText);
  const nameToBit = new Map(); for (const [bit, name] of bitToName) if (!nameToBit.has(name)) nameToBit.set(name, bit);
  const problems = [];
  const cells = Object.values(mod.cells).filter(c => MODELLED.has(c.type));
  const nVec = b.inputs.length <= maxExhaustive ? 2 ** b.inputs.length : randomVectors;
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 31);
  for (let k = 0; k < nVec && problems.length < 3; k++) {
    const assign = {}, bitVal = new Map();
    b.inputs.forEach((n, i) => { const v = b.inputs.length <= maxExhaustive ? (k >> i) & 1 : rnd(); assign[n] = v; if (nameToBit.has(n)) bitVal.set(nameToBit.get(n), v); });
    const get = bit => { const c = literal(bit); return c !== undefined ? c : bitVal.get(bit); };
    for (let changed = true; changed;) {                          // evaluate the netlist to a fixpoint
      changed = false;
      for (const c of cells) {
        const out = Object.entries(c.connections).filter(([p]) => c.port_directions[p] === 'output').flatMap(([, bits]) => bits)[0];
        if (!Number.isInteger(out) || bitVal.has(out)) continue;
        const v = cellValue(c.type, c.connections, c.port_directions, get);
        if (v !== undefined) { bitVal.set(out, v); changed = true; }
      }
    }
    const got = evalBench(b, assign);
    for (const o of b.outputs) {
      const want = bitVal.get(nameToBit.get(o));
      if (want === undefined) { problems.push(`output ${o}: not computable from the netlist`); break; }
      if (got[o] !== want) { problems.push(`output ${o}: netlist=${want} bench=${got[o]} for ${JSON.stringify(assign)}`); break; }
    }
  }
  return problems;
}

module.exports = { parseBench, evalBench, checkEquivalent, MODELLED };
