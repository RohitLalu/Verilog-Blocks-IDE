'use strict';
// Yosys JSON netlist -> ISCAS89 .bench for atalanta.
//
// A faithful port of yosys_json_to_bench.py, so the app no longer needs Python at runtime (a signed
// macOS app can't assume python3, and a packaged app can't run scripts that live inside its archive).
// test/yosysJsonToBench.test.js checks it against golden output produced by the Python original.
//
// atalanta facts: combinational circuits ONLY (DFFs abort it); gates AND NAND OR NOR XOR XNOR NOT BUFF;
// every primary input/output must be declared.
//
// Sequential designs use the pseudo-PI/PO ("full-scan") model: each DFF's Q becomes a primary input and
// its D a primary output; clock/reset nets that only feed flip-flops are dropped.

// Yosys internal cell type -> bench keyword. null = expanded inline below; '__DFF__' = unfolded.
const GATE_MAP = new Map(Object.entries({
  '$_AND_': 'AND', '$_NAND_': 'NAND', '$_OR_': 'OR', '$_NOR_': 'NOR', '$_XOR_': 'XOR', '$_XNOR_': 'XNOR',
  '$_NOT_': 'NOT', '$_BUF_': 'BUFF',
  '$_ANDNOT_': null, '$_ORNOT_': null, '$_MUX_': null,
}));
for (const t of [
  '$_DFF_P_', '$_DFF_N_', '$_DFF_PP0_', '$_DFF_PP1_', '$_DFF_PN0_', '$_DFF_PN1_', '$_DFF_NP0_', '$_DFF_NP1_',
  '$_DFF_NN0_', '$_DFF_NN1_', '$_DFFE_PP_', '$_DFFE_PN_', '$_DFFE_NP_', '$_DFFE_NN_', '$_SDFF_PP0_', '$_SDFF_PP1_',
  '$_SDFF_PN0_', '$_SDFF_PN1_', '$_SDFFE_PP0P_', '$_SDFFE_PP0N_', '$_SDFFE_PP1P_', '$_SDFFE_PP1N_',
  '$_DLATCH_P_', '$_DLATCH_N_',
]) GATE_MAP.set(t, '__DFF__');

// Yosys has far more storage cells than the table above lists ($_SDFF_NP0_, $_SDFFCE_*, $_DFFSR_*, $_ALDFF_*,
// $_DLATCH_PP0_ ...). The original Python converter only knew the listed ones, so any other flip-flop was
// treated as an unknown gate (q = BUFF(clk)): its Q never became an input, its D never an output, and the
// clock was left dangling. Recognise the whole families instead of a fixed list.
const isStorageCell = t => /^\$_(?:S?DFF|ALDFF|DLATCH|SR_)/.test(t);

const DFF_CLK_PORTS = new Set(['C', 'CLK', 'CLKN', 'G', 'E']);              // clock/enable: stripped from PIs
const DFF_RESET_PORTS = new Set(['R', 'S', 'RST', 'SET', 'RN', 'SN']);      // reset/set: stripped from PIs
// Constant bit values: literal "0"/"1" (and x/z, treated as 0). Yosys net ids are always >= 2.
const literalConst = bit => (bit === 1 || bit === '1' ? 1 : (bit === 0 || bit === '0' || bit === 'x' || bit === 'z' ? 0 : undefined));

// Signal names: letters, digits, underscore only; a leading digit gets an "n_" prefix.
function sanitize(name) {
  let s = String(name).replace(/[^a-zA-Z0-9_]/g, '_');
  if (s && /^[0-9]/.test(s)) s = 'n_' + s;
  return s || 'unnamed';
}

const isBit = b => Number.isInteger(b);
const dirIs = (dirs, port, want) => dirs[port] === want;

// netlist: parsed Yosys `write_json` output. Returns { text, summary, warnings }; throws on bad input.
function convertNetlist(netlist) {
  const modules = (netlist && netlist.modules) || {};
  const modNames = Object.keys(modules);
  if (!modNames.length) throw new Error('no modules in JSON');
  const modName = modNames[0];
  const mod = modules[modName];
  const ports = mod.ports || {}, cells = mod.cells || {}, netnames = mod.netnames || {};
  const warnings = [];

  // bit id -> signal name (first net to name a bit wins)
  const bitToName = new Map();
  for (const [netName, info] of Object.entries(netnames)) {
    const bits = info.bits || [];
    bits.forEach((bit, idx) => {
      if (isBit(bit) && !bitToName.has(bit)) bitToName.set(bit, sanitize(bits.length === 1 ? netName : `${netName}_${idx}`));
    });
  }
  // Nets proven constant by folding (bit id -> 0|1). The bench format has no constants, so a constant must be
  // folded INTO the gates that read it. On Yosys 0.9 a synchronous reset is a $_MUX_ with a constant 0 data
  // input, and the original converter turned that into BUFF(d): wrong logic, and rst left unused.
  const folded = new Map();
  const valOf = bit => { const c = literalConst(bit); return c !== undefined ? c : (isBit(bit) ? folded.get(bit) : undefined); };
  // signal name for a bit, or null for constants
  const sig = bit => (valOf(bit) !== undefined ? null : (bitToName.has(bit) ? bitToName.get(bit) : `net_${bit}`));

  // split cells into flip-flops / combinational / unknown (unknown ones fall back to BUFF)
  const dffCells = [], combCells = [], unknownCells = [];
  for (const info of Object.values(cells)) {
    const ctype = info.type || '';
    const mapped = GATE_MAP.has(ctype) ? GATE_MAP.get(ctype) : null;
    if (mapped === '__DFF__' || isStorageCell(ctype)) dffCells.push(info);
    else if (mapped !== null || ['$_MUX_', '$_ANDNOT_', '$_ORNOT_'].includes(ctype)) combCells.push(info);
    else unknownCells.push(info);
  }
  if (unknownCells.length) {
    warnings.push(`WARNING: ${unknownCells.length} unknown cell types treated as BUFF: ` +
      unknownCells.slice(0, 4).map(c => c.type).join(', '));
  }

  // ---- constant folding (fixpoint over the combinational cells) ----------------------------------------------
  const ioOf = info => {
    const conns = info.connections || {}, dirs = info.port_directions || {}, outBits = [], inBits = [];
    for (const [p, bits] of Object.entries(conns)) for (const b of bits) {
      if (!isBit(b) && literalConst(b) === undefined) continue;            // skip anything that isn't a net or constant
      if (dirIs(dirs, p, 'output') && isBit(b)) outBits.push(b);
      if (dirIs(dirs, p, 'input')) inBits.push(b);
    }
    return { conns, outBits, inBits };
  };
  const foldValue = info => {
    const ctype = info.type || '', { conns, outBits, inBits } = ioOf(info);
    if (outBits.length !== 1) return undefined;
    const v = inBits.map(valOf);
    const has = x => v.includes(x), every = x => v.length > 0 && v.every(y => y === x), known = v.length > 0 && v.every(y => y !== undefined);
    const par = v.reduce((t, y) => t ^ (y || 0), 0);
    const first = port => valOf((conns[port] && conns[port].length ? conns[port] : [0])[0]);
    switch (ctype) {
      case '$_AND_': return has(0) ? 0 : every(1) ? 1 : undefined;
      case '$_NAND_': return has(0) ? 1 : every(1) ? 0 : undefined;
      case '$_OR_': return has(1) ? 1 : every(0) ? 0 : undefined;
      case '$_NOR_': return has(1) ? 0 : every(0) ? 1 : undefined;
      case '$_XOR_': return known ? par : undefined;
      case '$_XNOR_': return known ? 1 - par : undefined;
      case '$_NOT_': return v[0] === undefined ? undefined : 1 - v[0];
      case '$_BUF_': return v[0];
      case '$_MUX_': {                                                      // Y = S ? B : A
        const a = first('A'), b = first('B'), sel = first('S');
        if (sel !== undefined) return sel ? b : a;
        return a !== undefined && a === b ? a : undefined;
      }
      case '$_ANDNOT_': { const a = first('A'), b = first('B');            // A & ~B
        return a === 0 || b === 1 ? 0 : (a === 1 && b === 0 ? 1 : undefined); }
      case '$_ORNOT_': { const a = first('A'), b = first('B');             // A | ~B
        return a === 1 || b === 0 ? 1 : (a === 0 && b === 1 ? 0 : undefined); }
      default: return undefined;
    }
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const info of combCells) {
      const out = ioOf(info).outBits[0];
      if (out === undefined || folded.has(out)) continue;
      const val = foldValue(info);
      if (val !== undefined) { folded.set(out, val); changed = true; }
    }
  }

  // primary inputs / outputs from the module's port declarations
  const declaredInputs = new Set(), declaredOutputs = new Set();
  let constOutputs = 0;
  for (const [portName, info] of Object.entries(ports)) {
    const bits = info.bits || [];
    bits.forEach((bit, idx) => {
      if (!isBit(bit)) return;
      if (valOf(bit) !== undefined) { constOutputs += (info.direction === 'output'); return; }   // constant: nothing to test
      const sname = bitToName.has(bit) ? bitToName.get(bit) : sanitize(bits.length === 1 ? portName : `${portName}_${idx}`);
      if (info.direction === 'input') declaredInputs.add(sname);
      else if (info.direction === 'output') declaredOutputs.add(sname);
    });
  }

  // DFF pseudo-PI/PO unfolding
  const dffClkBits = new Set(), dffResetBits = new Set(), dffQNames = new Set(), dffDNames = new Set();
  for (const info of dffCells) {
    for (const [port, bits] of Object.entries(info.connections || {})) {
      for (const bit of bits) {
        if (!isBit(bit)) continue;
        if (DFF_CLK_PORTS.has(port)) dffClkBits.add(bit);
        else if (DFF_RESET_PORTS.has(port)) dffResetBits.add(bit);
        else if (port === 'Q') { const s = sig(bit); if (s) dffQNames.add(s); }
        else if (port === 'D') { const s = sig(bit); if (s) dffDNames.add(s); }
      }
    }
  }

  // a clock/reset that ALSO feeds combinational logic stays a primary input
  const combInputBits = new Set();
  for (const info of combCells) {
    const dirs = info.port_directions || {};
    for (const [port, bits] of Object.entries(info.connections || {})) {
      if (dirIs(dirs, port, 'input')) bits.filter(isBit).forEach(b => combInputBits.add(b));
    }
  }
  const stripBits = new Set([...dffClkBits, ...dffResetBits].filter(b => !combInputBits.has(b)));
  const stripNames = new Set([...stripBits].filter(b => bitToName.has(b)).map(b => bitToName.get(b)));

  const finalInputs = new Set([...declaredInputs].filter(n => !stripNames.has(n)));
  dffQNames.forEach(n => finalInputs.add(n));
  const finalOutputs = new Set(declaredOutputs);
  dffDNames.forEach(n => finalOutputs.add(n));

  // gate lines
  const gateLines = [], usedTemps = new Set();
  const fresh = base => {
    let name = base, i = 0;
    while (usedTemps.has(name) || finalInputs.has(name) || finalOutputs.has(name)) { i += 1; name = `${base}_${i}`; }
    usedTemps.add(name);
    return name;
  };

  // value + name of the first bit on a port (constants have a value and no name)
  const at = (conns, port) => { const bit = (conns[port] && conns[port].length ? conns[port] : [0])[0]; return { v: valOf(bit), s: sig(bit) }; };
  const emit = (out, type, ...ins) => gateLines.push(`${out} = ${type}(${ins.join(', ')})`);

  const genCell = info => {
    const ctype = info.type || '', { conns, outBits, inBits } = ioOf(info);
    if (!outBits.length) return;
    const outSig = sig(outBits[0]);
    if (!outSig) return;                                      // output proven constant: folded away, nothing to emit
    const gateType = GATE_MAP.has(ctype) ? GATE_MAP.get(ctype) : null;
    const sigs = [], consts = [];                             // non-constant input names / constant input values
    for (const b of inBits) { const v = valOf(b); if (v === undefined) sigs.push(sig(b)); else consts.push(v); }

    if (ctype === '$_MUX_') {                                 // Y = S ? B : A
      const A = at(conns, 'A'), B = at(conns, 'B'), S = at(conns, 'S');
      if (S.v !== undefined) { const pick = S.v ? B : A; if (pick.s) emit(outSig, 'BUFF', pick.s); return; }
      if (A.s && B.s) {                                       // general case: (A & ~S) | (B & S)
        const ns = fresh(`${outSig}_ns`), t1 = fresh(`${outSig}_t1`), t2 = fresh(`${outSig}_t2`);
        emit(ns, 'NOT', S.s); emit(t1, 'AND', A.s, ns); emit(t2, 'AND', B.s, S.s); emit(outSig, 'OR', t1, t2);
      } else if (A.s) {                                       // B constant
        if (B.v === 0) { const ns = fresh(`${outSig}_ns`); emit(ns, 'NOT', S.s); emit(outSig, 'AND', A.s, ns); }   // S ? 0 : A
        else emit(outSig, 'OR', A.s, S.s);                                                                          // S ? 1 : A
      } else if (B.s) {                                       // A constant
        if (A.v === 0) emit(outSig, 'AND', S.s, B.s);                                                               // S ? B : 0
        else { const ns = fresh(`${outSig}_ns`); emit(ns, 'NOT', S.s); emit(outSig, 'OR', ns, B.s); }            // S ? B : 1
      } else emit(outSig, A.v === 0 && B.v === 1 ? 'BUFF' : 'NOT', S.s);                                           // A, B constant and different
      return;
    }
    if (ctype === '$_ANDNOT_' || ctype === '$_ORNOT_') {      // A & ~B   /   A | ~B
      const A = at(conns, 'A'), B = at(conns, 'B'), op = ctype === '$_ANDNOT_' ? 'AND' : 'OR';
      if (A.s && B.s) { const nb = fresh(`${outSig}_nb`); emit(nb, 'NOT', B.s); emit(outSig, op, A.s, nb); }
      else if (A.s) emit(outSig, 'BUFF', A.s);                // B is the identity constant
      else if (B.s) emit(outSig, 'NOT', B.s);                 // A is the identity constant
      return;
    }
    if (gateType === 'NOT' || gateType === 'BUFF') { if (sigs.length) emit(outSig, gateType, sigs[0]); return; }
    if (gateType === 'AND' || gateType === 'NAND' || gateType === 'OR' || gateType === 'NOR') {
      if (!sigs.length) return;                               // dominating constants were folded; the rest are identities
      if (sigs.length === 1) emit(outSig, gateType === 'AND' || gateType === 'OR' ? 'BUFF' : 'NOT', sigs[0]);
      else emit(outSig, gateType, ...sigs);
      return;
    }
    if (gateType === 'XOR' || gateType === 'XNOR') {
      const flip = consts.reduce((t, c) => t ^ c, 0) === 1;  // each constant 1 inverts the result
      const base = (gateType === 'XNOR') !== flip ? 'XNOR' : 'XOR';
      if (!sigs.length) return;
      if (sigs.length === 1) emit(outSig, base === 'XOR' ? 'BUFF' : 'NOT', sigs[0]);
      else emit(outSig, base, ...sigs);
      return;
    }
    if (sigs.length) emit(outSig, 'BUFF', sigs[0]);          // unknown cell: BUFF of its first input
  };
  combCells.forEach(genCell);
  unknownCells.forEach(genCell);
  if (constOutputs) warnings.push(`NOTE: ${constOutputs} output bit(s) are constant and were left undeclared (a constant has no stuck-at faults to test)`);

  const lines = [`# ISCAS89 bench — ${modName}`, '# Generated by VerilogBlocks IDE (yosysJsonToBench.js)'];
  if (dffCells.length) lines.push(`# ${dffCells.length} DFF(s) unfolded to pseudo-PI/PO for combinational ATPG`);
  lines.push('');
  [...finalInputs].sort().forEach(s => lines.push(`INPUT(${s})`));
  [...finalOutputs].sort().forEach(s => lines.push(`OUTPUT(${s})`));
  lines.push('', ...gateLines, '');

  return {
    text: lines.join('\n'),
    warnings,
    bitToName,                       // Map(bit id -> signal name), for tests and debugging
    summary: { inputs: finalInputs.size, outputs: finalOutputs.size, gates: gateLines.length,
               combCells: combCells.length + unknownCells.length, dffs: dffCells.length },
  };
}

module.exports = { convertNetlist, sanitize };
