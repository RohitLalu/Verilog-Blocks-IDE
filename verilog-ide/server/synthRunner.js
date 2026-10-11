'use strict';
// Logic synthesis onto the selected PDK's real standard cells (Yosys + ABC + Liberty).
// Shared by server.js and electron-main.js.
//
// Policy: synthesis REFUSES to run without the PDK's Liberty library and asks for the
// PDK path instead of silently producing a generic gate netlist that isn't the PDK's cells.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.js');
const { PDKS, exists, findLiberty } = require('./pdkFiles.js');
const { prepareLiberty } = require('./libertyFilter.js');

const DEFAULT_TIMEOUT_MS = Number(process.env.VBIDE_SYNTH_TIMEOUT_MS) || 120000;
const SAFE_PATH = /^[^"\r\n\0]+$/;   // every path is placed inside "..." in a Yosys script
const refuse = output => ({ ok: false, needsPdkPath: true, output });

function resolveLiberty(pdkId, pdkRoot) {
  if (!pdkId) return refuse('Synthesis needs a technology library, but no PDK is selected.\n\nChoose a PDK and its install path in the PDK selector, then run synthesis again.');
  const pdk = PDKS[pdkId];
  if (!pdk) return { ok: false, output: `Synthesis is not supported for PDK "${pdkId}" yet.` };
  const want = pdk.liberty[0];
  if (!pdkRoot) return refuse(
    `Synthesis maps your design onto real ${pdk.label} cells, so it needs the PDK's Liberty library (${want}) — and no PDK path is set.\n\n` +
    `Set the path to your ${pdkId} install in the PDK selector, then run synthesis again.\nTypical location: ${pdk.example}`);
  if (!exists(pdkRoot)) return refuse(`The ${pdkId} PDK path does not exist:\n  ${pdkRoot}\n\nFix the path in the PDK selector, then run synthesis again.\nTypical location: ${pdk.example}`);
  const lib = findLiberty(pdkId, pdkRoot);
  if (!lib) return refuse(`Could not find the Liberty library (${want}) under:\n  ${pdkRoot}\n\nPoint the PDK path at the folder that contains it (for sky130 this is usually the .../sky130A folder), then run synthesis again.`);
  return { lib, pdk };
}

async function runSynthesis({ projDir, outDir, verilog, pdkId, pdkRoot, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const r = resolveLiberty(pdkId, pdkRoot);
  if (!r.lib) return r;                       // refusal / unsupported: Yosys is never started

  fs.mkdirSync(projDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const vPath = path.join(projDir, 'top.v');
  const outV = path.join(outDir, 'top_synth.v'), outJ = path.join(outDir, 'top_synth.json'), ysP = path.join(outDir, 'synth.ys');
  fs.writeFileSync(vPath, verilog || '');
  fs.rmSync(outV, { force: true }); fs.rmSync(outJ, { force: true });   // never leave a previous netlist behind

  let lib;
  try { lib = prepareLiberty({ src: r.lib, pdkId, dontUse: r.pdk.dontUse, outDir: path.join(outDir, 'lib') }); }
  catch (e) { return { ok: false, output: `Could not prepare the Liberty library:\n${e.message}` }; }

  const paths = [vPath, outV, outJ, lib.path];
  if (!paths.every(p => SAFE_PATH.test(p))) return { ok: false, output: 'Refusing to run: a file path contains a quote or newline character.' };

  fs.writeFileSync(ysP, [
    `read_verilog -sv "${vPath}"`,
    'hierarchy -check -top top',
    'synth -top top -flatten',
    `dfflibmap -liberty "${lib.path}"`,
    `abc -liberty "${lib.path}"`,
    'opt_clean -purge',
    `write_verilog -noattr "${outV}"`,
    `write_json "${outJ}"`,
    `stat -liberty "${lib.path}"`,
  ].join('\n') + '\n');

  const y = await run('yosys', ['-s', ysP], { cwd: outDir, timeoutMs });
  if (y.error) return { ok: false, output: y.error.code === 'ENOENT'
    ? 'ERROR: yosys not found on PATH.\nDocker: rebuild the image. Desktop: install Yosys (e.g. brew install yosys).' : String(y.error) };
  if (y.timedOut) return { ok: false, output: y.out + `\n[timeout] Synthesis killed after ${timeoutMs / 1000}s.` };
  if (y.code !== 0 || !exists(outJ)) return { ok: false, output: y.out };

  // Summarise what the netlist is made of
  let cells = {}, unmapped = {};
  try {
    const mod = Object.values(JSON.parse(fs.readFileSync(outJ, 'utf8')).modules).find(m => m.attributes?.top) ||
                JSON.parse(fs.readFileSync(outJ, 'utf8')).modules.top;
    for (const c of Object.values(mod.cells || {})) {
      cells[c.type] = (cells[c.type] || 0) + 1;
      if (c.type.startsWith('$')) unmapped[c.type] = (unmapped[c.type] || 0) + 1;
    }
  } catch { /* summary is best-effort */ }
  const area = Number((y.out.match(/Chip area for (?:top )?module '[^']*top': ([\d.]+)/) || [])[1]) || null;

  let output = y.out;
  if (Object.keys(unmapped).length) {
    output += '\n⚠ WARNING: some logic was not mapped to PDK cells and is left as generic Yosys cells:\n' +
      Object.entries(unmapped).map(([t, n]) => `    ${n} × ${t}`).join('\n') +
      '\n  (latches and tri-state buffers are not mapped by this flow yet)\n';
  }
  return { ok: true, output, area, cells, unmapped, liberty: r.lib, netlist: outV };
}

module.exports = { runSynthesis, resolveLiberty, DEFAULT_TIMEOUT_MS };
