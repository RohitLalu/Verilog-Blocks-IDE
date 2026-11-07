'use strict';
// Stuck-at ATPG: Verilog -> Yosys (techmap, write_json) -> bench converter -> atalanta.
// Shared by server.js and electron-main.js (the Electron copy had drifted: it called a Yosys command that
// no longer exists and parsed atalanta output that never matched, so it never produced a coverage number).
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.js');
const { convertNetlist } = require('./yosysJsonToBench.js');
const { exists } = require('./pdkFiles.js');

const DEFAULT_TIMEOUT_MS = Number(process.env.VBIDE_ATPG_TIMEOUT_MS) || 60000;
const SAFE_PATH = /^[^"\r\n\0]+$/;   // paths are placed inside "..." in a Yosys script

// Parse atalanta 2.0's summary block (verified against the real binary's output).
function parseAtpgOutput(raw) {
  const m = pattern => { const r = raw.match(pattern); return r ? r[1] : null; };
  const coverageStr = m(/Fault coverage\s*:\s*([\d.]+)\s*%/i);
  const totalStr    = m(/Number of collapsed faults\s*:\s*(\d+)/i);
  const vectorsStr  = m(/Number of test patterns after compaction\s*:\s*(\d+)/i);
  const redundantN  = parseInt(m(/Number of identified redundant faults\s*:\s*(\d+)/i) || '0', 10);
  const abortedN    = parseInt(m(/Number of aborted faults\s*:\s*(\d+)/i) || '0', 10);

  const coverage = coverageStr ? parseFloat(coverageStr) : null;
  const total    = totalStr ? parseInt(totalStr, 10) : null;
  const vectors  = vectorsStr ? parseInt(vectorsStr, 10) : 0;
  // atalanta doesn't list faults individually: detected = collapsed faults x coverage
  const detected = (coverage !== null && total !== null) ? Math.round(total * coverage / 100) : null;
  return {
    coverage, detected, total, vectors,
    faults: { detected: [], undetected: [], redundant: [], abortedCount: abortedN, redundantCount: redundantN },
  };
}

const NOT_FOUND = {
  yosys: 'ERROR: yosys not found on PATH.\nDocker: rebuild the image. Desktop: install Yosys (e.g. brew install yosys).',
  atalanta: [
    'ERROR: atalanta not found on PATH.', '',
    'Docker: rebuild the image (docker build -t verilogblocks .).',
    'Desktop: atalanta is not bundled yet. Build it (https://github.com/hsluoyz/Atalanta, run make) and put the binary on your PATH.',
  ].join('\n'),
};

async function runAtpg({ projDir, outDir, verilog, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  fs.mkdirSync(projDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const topV = path.join(projDir, 'top.v');
  const jsonF = path.join(outDir, 'top_atpg.json');
  const benchF = path.join(outDir, 'top.bench');
  const testF = path.join(outDir, 'top.test');
  const ysScript = path.join(outDir, 'atpg_synth.ys');
  if (![topV, jsonF].every(p => SAFE_PATH.test(p))) {
    return { ok: false, stage: 'yosys', output: 'Refusing to run: a file path contains a quote or newline character.' };
  }

  fs.writeFileSync(topV, verilog || '');
  // never leave a previous run's results where this run's failure could be mistaken for them
  for (const f of [jsonF, benchF, testF]) fs.rmSync(f, { force: true });

  // 1. Yosys: generic internal cells ($_AND_, $_NOT_, ...); write_json is the stable export
  fs.writeFileSync(ysScript, [
    `read_verilog -sv "${topV}"`,
    'hierarchy -top top',
    'proc; opt',
    'techmap; opt; clean',
    `write_json "${jsonF}"`,
  ].join('\n'));
  const ys = await run('yosys', ['-s', ysScript], { cwd: outDir, timeoutMs });
  if (ys.error) return { ok: false, stage: 'yosys', output: ys.error.code === 'ENOENT' ? NOT_FOUND.yosys : String(ys.error) };
  if (ys.timedOut) return { ok: false, stage: 'yosys', output: ys.out + `\n[timeout] Yosys killed after ${timeoutMs / 1000}s.` };
  if (ys.code !== 0 || !exists(jsonF)) {
    return { ok: false, stage: 'yosys',
      output: 'Yosys synthesis failed:\n\n' + ys.out + '\n\nTip: run ⚛ Yosys synthesis first to check the design is valid.' };
  }

  // 2. JSON -> ISCAS89 bench (in-process: no Python needed)
  let conv;
  try {
    conv = convertNetlist(JSON.parse(fs.readFileSync(jsonF, 'utf8')));
    fs.writeFileSync(benchF, conv.text);
  } catch (e) {
    return { ok: false, stage: 'converter', output: 'JSON→bench conversion failed:\n' + e.message };
  }

  // 3. atalanta, run in the output folder (it writes <name>.test into its working directory)
  const at = await run('atalanta', [benchF], { cwd: outDir, timeoutMs });
  if (at.error) return { ok: false, stage: 'atalanta', output: at.error.code === 'ENOENT' ? NOT_FOUND.atalanta : String(at.error) };
  if (at.timedOut) return { ok: false, stage: 'atalanta', output: at.out + `\n[timeout] atalanta killed after ${timeoutMs / 1000}s.` };

  const parsed = parseAtpgOutput(at.out);
  if (parsed.coverage === null) {
    return { ok: false, stage: 'atalanta', output: at.out + '\n\nCould not read a fault-coverage figure from atalanta\'s output.',
             bench: conv.text, warnings: conv.warnings };
  }
  return { ok: true, stage: 'done', output: at.out, bench: conv.text, warnings: conv.warnings, ...parsed };
}

module.exports = { runAtpg, parseAtpgOutput, DEFAULT_TIMEOUT_MS };
