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
const CONSTANT_BITS = [0, 1, '0', '1', 'x', 'z'];

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
  // signal name for a bit, or null for constants
  const sig = bit => (CONSTANT_BITS.includes(bit) ? null : (bitToName.has(bit) ? bitToName.get(bit) : `net_${bit}`));

  // primary inputs / outputs from the module's port declarations
  const declaredInputs = new Set(), declaredOutputs = new Set();
  for (const [portName, info] of Object.entries(ports)) {
    const bits = info.bits || [];
    bits.forEach((bit, idx) => {
      if (!isBit(bit)) return;
      const sname = bitToName.has(bit) ? bitToName.get(bit) : sanitize(bits.length === 1 ? portName : `${portName}_${idx}`);
      if (info.direction === 'input') declaredInputs.add(sname);
      else if (info.direction === 'output') declaredOutputs.add(sname);
    });
  }

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

  const genCell = info => {
    const ctype = info.type || '', conns = info.connections || {}, dirs = info.port_directions || {};
    const outBits = [], inBits = [];
    for (const [p, bits] of Object.entries(conns)) {
      for (const b of bits) {
        if (!isBit(b)) continue;
        if (dirIs(dirs, p, 'output')) outBits.push(b);
        if (dirIs(dirs, p, 'input')) inBits.push(b);
      }
    }
    if (!outBits.length) return;
    const outSig = sig(outBits[0]);
    if (!outSig) return;
    const inSigs = inBits.map(sig).filter(Boolean);
    const gateType = GATE_MAP.has(ctype) ? GATE_MAP.get(ctype) : null;

    if (ctype === '$_MUX_') {                       // Y = S ? B : A
      const first = port => sig((conns[port] && conns[port].length ? conns[port] : [0])[0]);
      const a = first('A'), b = first('B'), s = first('S');
      if (!(a && b && s)) { if (inSigs.length) gateLines.push(`${outSig} = BUFF(${inSigs[0]})`); return; }
      const ns = fresh(`${outSig}_ns`), t1 = fresh(`${outSig}_t1`), t2 = fresh(`${outSig}_t2`);
      gateLines.push(`${ns} = NOT(${s})`, `${t1} = AND(${a}, ${ns})`, `${t2} = AND(${b}, ${s})`, `${outSig} = OR(${t1}, ${t2})`);
      return;
    }
    if (ctype === '$_ANDNOT_' || ctype === '$_ORNOT_') {        // A & ~B   /   A | ~B
      const op = ctype === '$_ANDNOT_' ? 'AND' : 'OR';
      if (inSigs.length >= 2) {
        const nb = fresh(`${outSig}_nb`);
        gateLines.push(`${nb} = NOT(${inSigs[1]})`, `${outSig} = ${op}(${inSigs[0]}, ${nb})`);
      } else if (inSigs.length) gateLines.push(`${outSig} = BUFF(${inSigs[0]})`);
      return;
    }
    if (gateType === 'NOT' || gateType === 'BUFF') { if (inSigs.length) gateLines.push(`${outSig} = ${gateType}(${inSigs[0]})`); return; }
    if (gateType && inSigs.length) { gateLines.push(`${outSig} = ${gateType}(${inSigs.join(', ')})`); return; }
    if (inSigs.length) gateLines.push(`${outSig} = BUFF(${inSigs[0]})`);   // unknown cell: BUFF of its first input
  };
  combCells.forEach(genCell);
  unknownCells.forEach(genCell);

  const lines = [`# ISCAS89 bench — ${modName}`, '# Generated by VerilogBlocks IDE (yosysJsonToBench.js)'];
  if (dffCells.length) lines.push(`# ${dffCells.length} DFF(s) unfolded to pseudo-PI/PO for combinational ATPG`);
  lines.push('');
  [...finalInputs].sort().forEach(s => lines.push(`INPUT(${s})`));
  [...finalOutputs].sort().forEach(s => lines.push(`OUTPUT(${s})`));
  lines.push('', ...gateLines, '');

  return {
    text: lines.join('\n'),
    warnings,
    summary: { inputs: finalInputs.size, outputs: finalOutputs.size, gates: gateLines.length,
               combCells: combCells.length + unknownCells.length, dffs: dffCells.length },
  };
}

module.exports = { convertNetlist, sanitize };
