'use strict';
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const { spawn, spawnSync } = require('child_process');

const app      = express();
const PORT     = process.env.PORT || 3000;
const APP_ROOT = path.join(__dirname, '..');

const DIRS = {
  dist:       path.join(APP_ROOT, 'dist'),
  pdk:        path.join(APP_ROOT, 'pdk'),
  projects:   path.join(APP_ROOT, 'projects'),
  synthesis:  path.join(APP_ROOT, 'synthesis', 'output'),
  userBlocks: path.join(APP_ROOT, 'pdk', 'user-blocks'),
  atpg:       path.join(APP_ROOT, 'atpg'),
};
Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

const PREFS_FILE = path.join(APP_ROOT, '.vbide-prefs.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(DIRS.dist));
app.use('/pdk', express.static(DIRS.pdk));

const readJSON  = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));
const exists    = p => { try { return fs.existsSync(p); } catch { return false; } };
const loadPrefs = () => { try { return readJSON(PREFS_FILE); } catch { return {}; } };

function findFile(dir, name, depth = 3) {
  if (depth < 0 || !exists(dir)) return null;
  try {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      if (e === name) return full;
      try { if (fs.statSync(full).isDirectory()) { const r = findFile(full, name, depth-1); if (r) return r; } } catch {}
    }
  } catch {}
  return null;
}

const ENV_PDK = {
  sky130: process.env.SKY130_PDK_ROOT || '',
  gf180:  process.env.GF180_PDK_ROOT  || '',
  ihp130: process.env.IHP130_PDK_ROOT || '',
};

// ── PDK ───────────────────────────────────────────────────────────────────────
app.get('/api/pdk/list', (req, res) => {
  try {
    const reg = readJSON(path.join(DIRS.pdk, 'pdk-registry.json'));
    reg.forEach(p => { if (ENV_PDK[p.id]) p.detectedPath = ENV_PDK[p.id]; });
    res.json(reg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/pdk/cells-manifest/:id', (req, res) => {
  const p = path.join(DIRS.pdk, req.params.id, 'cells-manifest.json');
  if (!exists(p)) return res.status(404).json({ error: 'Not found' });
  res.json(readJSON(p));
});
app.post('/api/pdk/validate-path', (req, res) => {
  const { pdkId, rootPath } = req.body;
  if (!rootPath || !exists(rootPath)) return res.json({ ok: false, error: 'Path does not exist' });
  const expected = {
    sky130: ['sky130_fd_sc_hd.v', 'sky130_fd_sc_hd__tt_025C_1v80.lib'],
    gf180:  ['gf180mcu_fd_sc_mcu7t5v0.v'],
    ihp130: ['sg13g2_stdcell.v'],
  };
  const found = {};
  (expected[pdkId] || []).forEach(f => { const h = findFile(rootPath, f, 4); if (h) found[f] = h; });
  res.json({ ok: true, found });
});
app.post('/api/pdk/read-lib', (req, res) => {
  const { libPath } = req.body;
  if (!libPath || !exists(libPath)) return res.json({ ok: false, error: 'Not found' });
  try {
    if (fs.statSync(libPath).size > 50 * 1024 * 1024) return res.json({ ok: false, error: '>50MB' });
    res.json({ ok: true, content: fs.readFileSync(libPath, 'utf8') });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Prefs ─────────────────────────────────────────────────────────────────────
app.get('/api/prefs', (req, res) => {
  const prefs = loadPrefs();
  if (!prefs.pdkPaths) prefs.pdkPaths = {};
  Object.entries(ENV_PDK).forEach(([id, p]) => { if (p && !prefs.pdkPaths[id]) prefs.pdkPaths[id] = p; });
  res.json(prefs);
});
app.post('/api/prefs', (req, res) => {
  try { writeJSON(PREFS_FILE, { ...loadPrefs(), ...req.body }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Projects ──────────────────────────────────────────────────────────────────
app.get('/api/project/list', (req, res) => {
  try {
    const dirs = fs.readdirSync(DIRS.projects).filter(f => {
      try { return fs.statSync(path.join(DIRS.projects, f)).isDirectory(); } catch { return false; }
    });
    res.json(dirs);
  } catch { res.json([]); }
});
app.post('/api/project/save', (req, res) => {
  try {
    const { name, graph, verilog, testbench, meta } = req.body;
    const dir = path.join(DIRS.projects, name); fs.mkdirSync(dir, { recursive: true });
    writeJSON(path.join(dir, 'graph.json'), graph);
    fs.writeFileSync(path.join(dir, 'top.v'), verilog || '');
    if (testbench) fs.writeFileSync(path.join(dir, 'top_tb.v'), testbench);
    if (meta) writeJSON(path.join(dir, 'meta.json'), meta);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/api/project/load/:name', (req, res) => {
  try {
    const dir = path.join(DIRS.projects, req.params.name);
    if (!exists(path.join(dir, 'graph.json'))) return res.status(404).json({ error: 'Not found' });
    res.json({
      graph:     readJSON(path.join(dir, 'graph.json')),
      verilog:   exists(path.join(dir, 'top.v'))     ? fs.readFileSync(path.join(dir, 'top.v'), 'utf8') : '',
      testbench: exists(path.join(dir, 'top_tb.v'))  ? fs.readFileSync(path.join(dir, 'top_tb.v'), 'utf8') : '',
      meta:      exists(path.join(dir, 'meta.json')) ? readJSON(path.join(dir, 'meta.json')) : {},
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/project/export-as-block', (req, res) => {
  try {
    const { name, blockMeta } = req.body;
    fs.mkdirSync(DIRS.userBlocks, { recursive: true });
    const verilog = exists(path.join(DIRS.projects, name, 'top.v'))
      ? fs.readFileSync(path.join(DIRS.projects, name, 'top.v'), 'utf8') : '';
    writeJSON(path.join(DIRS.userBlocks, `${name}.json`), { ...blockMeta, verilogCode: verilog });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/api/project/user-blocks', (req, res) => {
  try {
    fs.mkdirSync(DIRS.userBlocks, { recursive: true });
    const blocks = fs.readdirSync(DIRS.userBlocks)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return readJSON(path.join(DIRS.userBlocks, f)); } catch { return null; } })
      .filter(Boolean);
    res.json(blocks);
  } catch { res.json([]); }
});

// ── Yosys Synthesis ───────────────────────────────────────────────────────────
app.post('/api/yosys/synth', (req, res) => {
  const { projectName, verilog, pdkRoot, pdkId } = req.body;
  const projDir = path.join(DIRS.projects, projectName || 'tmp'); fs.mkdirSync(projDir, { recursive: true });
  const vPath = path.join(projDir, 'top.v');
  const outV  = path.join(DIRS.synthesis, 'top_synth.v');
  const outJ  = path.join(DIRS.synthesis, 'top_synth.json');
  const ysP   = path.join(DIRS.synthesis, 'synth.ys');
  fs.writeFileSync(vPath, verilog || '');
  let script = `read_verilog -sv "${vPath}"\n`;
  if (pdkRoot && exists(pdkRoot)) script += `read_verilog -sv "${pdkRoot}"\n`;
  script += [
    'hierarchy -top top', 'proc; opt; fsm; opt; memory; opt',
    pdkId === 'sky130' ? 'synth_sky130 -top top' : 'synth -top top',
    `write_verilog "${outV}"`, `write_json "${outJ}"`, 'stat',
  ].join('\n');
  fs.writeFileSync(ysP, script);
  let out = '';
  const proc = spawn('yosys', ['-s', ysP]);
  proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  proc.on('close', code => res.json({ ok: code === 0, output: out }));
  proc.on('error', () => res.json({ ok: false, output: 'ERROR: yosys not found.' }));
});

// ── iverilog Simulation ───────────────────────────────────────────────────────
// Returns VCD directly in the response — UI auto-opens the web VCD viewer.
app.post('/api/sim/run', (req, res) => {
  const { projectName, verilog, testbench } = req.body;
  const projDir = path.join(DIRS.projects, projectName || 'tmp');
  const simDir  = path.join(projDir, 'sim'); fs.mkdirSync(simDir, { recursive: true });
  const topPath = path.join(simDir, 'top.v');
  const tbPath  = path.join(simDir, 'top_tb.v');
  const outPath = path.join(simDir, 'sim.out');
  const vcdPath = path.join(simDir, 'wave.vcd');
  fs.writeFileSync(topPath, verilog || '');
  fs.writeFileSync(tbPath, testbench || '');

  const iv = spawn('iverilog', ['-g2012', '-o', outPath, tbPath, topPath]);
  let compErr = '';
  iv.stderr.on('data', d => { compErr += d; });
  iv.on('error', () => res.json({
    ok: false,
    output: 'ERROR: iverilog not found in container. Rebuild with: docker build -t verilogblocks .',
    vcd: null,
  }));
  iv.on('close', code => {
    if (code !== 0) return res.json({ ok: false, output: 'Compile error:\n' + compErr, vcd: null });
    const vvp = spawn('vvp', [outPath]);
    let simOut = '';
    vvp.stdout.on('data', d => { simOut += d; });
    vvp.stderr.on('data', d => { simOut += d; });
    vvp.on('close', () => {
      const vcd = exists(vcdPath) ? fs.readFileSync(vcdPath, 'utf8') : null;
      res.json({ ok: true, output: simOut, vcd });
    });
    vvp.on('error', () => res.json({ ok: false, output: 'ERROR: vvp not found.', vcd: null }));
  });
});

// ── ATPG (atalanta) ───────────────────────────────────────────────────────────
// Flow: Verilog → Yosys (techmap + write_json) → Python converter → atalanta
// Note: write_bench was removed from Yosys ≥0.26. We use write_json + a
// bundled Python script (yosys_json_to_bench.py) to produce valid ISCAS89.
app.post('/api/atpg/run', (req, res) => {
  const { projectName, verilog } = req.body;
  const projDir  = path.join(DIRS.projects, projectName || 'tmp_atpg');
  fs.mkdirSync(projDir, { recursive: true });
  fs.mkdirSync(DIRS.atpg, { recursive: true });

  const topV      = path.join(projDir, 'top.v');
  const jsonF     = path.join(DIRS.atpg, 'top_atpg.json');
  const benchF    = path.join(DIRS.atpg, 'top.bench');
  const ysScript  = path.join(DIRS.atpg, 'atpg_synth.ys');
  const converter = path.join(__dirname, 'yosys_json_to_bench.py');

  fs.writeFileSync(topV, verilog || '');

  // Yosys: synthesise to generic internal cells ($_AND_, $_OR_, $_NOT_, etc.)
  // write_json is the stable export; converter handles ISCAS89 translation
  const ysContent = [
    `read_verilog -sv "${topV}"`,
    'hierarchy -top top',
    'proc; opt',
    'techmap; opt; clean',
    `write_json "${jsonF}"`,
  ].join('\n');
  fs.writeFileSync(ysScript, ysContent);

  let ysOut = '';
  const ys = spawn('yosys', ['-s', ysScript]);
  ys.stdout.on('data', d => { ysOut += d; });
  ys.stderr.on('data', d => { ysOut += d; });
  ys.on('error', () => res.json({ ok:false, stage:'yosys', output:'ERROR: yosys not found.' }));
  ys.on('close', ysCode => {
    if (ysCode !== 0 || !exists(jsonF)) {
      return res.json({ ok:false, stage:'yosys',
        output: 'Yosys synthesis failed:\n\n' + ysOut +
          '\n\nTip: run ⚛ Yosys synthesis first to check the design is valid.' });
    }

    // Convert JSON → ISCAS89 bench via Python script
    const conv = spawn('python3', [converter, jsonF, benchF]);
    let convErr = '';
    conv.stderr.on('data', d => { convErr += d; });
    conv.on('error', () => res.json({ ok:false, stage:'converter',
      output: 'ERROR: python3 not found in container.' }));
    conv.on('close', convCode => {
      if (convCode !== 0 || !exists(benchF)) {
        return res.json({ ok:false, stage:'converter',
          output: 'JSON→bench conversion failed:\n' + convErr });
      }

      // atalanta: ATPG on the bench file
      let atpgOut = '';
      const at = spawn('atalanta', [benchF]);
      at.stdout.on('data', d => { atpgOut += d; });
      at.stderr.on('data', d => { atpgOut += d; });
      at.on('error', () => res.json({ ok:false, stage:'atalanta',
        output: [
          'ERROR: atalanta not found.',
          '',
          'Rebuild the Docker image:',
          '  docker build -t verilogblocks .',
          '',
          'Verify inside container:',
          '  docker exec -it verilogblocks which atalanta',
        ].join('\n') }));
      at.on('close', () => {
        res.json({
          ok: true, stage: 'done', output: atpgOut,
          bench: fs.readFileSync(benchF, 'utf8'),
          ...parseAtpgOutput(atpgOut),
        });
      });
    });
  });
});

// Parse real atalanta 2.0 output format (verified against actual binary output)
function parseAtpgOutput(raw) {
  const m = (pattern) => { const r = raw.match(pattern); return r ? r[1] : null; };

  const coverageStr = m(/Fault coverage\s*:\s*([\d.]+)\s*%/i);
  const totalStr    = m(/Number of collapsed faults\s*:\s*(\d+)/i);
  const vectorsStr  = m(/Number of test patterns after compaction\s*:\s*(\d+)/i);
  const redundantN  = parseInt(m(/Number of identified redundant faults\s*:\s*(\d+)/i) || '0');
  const abortedN    = parseInt(m(/Number of aborted faults\s*:\s*(\d+)/i) || '0');

  const coverage = coverageStr ? parseFloat(coverageStr) : null;
  const total    = totalStr    ? parseInt(totalStr)       : null;
  const vectors  = vectorsStr  ? parseInt(vectorsStr)     : 0;

  // Detected = total collapsed × coverage/100 (atalanta doesn't list individually)
  const detected = (coverage !== null && total !== null)
    ? Math.round(total * coverage / 100) : null;

  return {
    coverage, detected, total, vectors,
    faults: {
      detected:   [],    // atalanta 2.0 does not output per-fault DT/UN lines
      undetected: [],    // aborted faults ≈ undetected count (in summary only)
      redundant:  [],
      abortedCount:   abortedN,
      redundantCount: redundantN,
    },
  };
}

// Serve generated bench file for download
app.get('/api/atpg/download/bench', (req, res) => {
  const f = path.join(DIRS.atpg, 'top.bench');
  if (!exists(f)) return res.status(404).json({ error: 'Run ATPG first.' });
  res.download(f, 'top.bench');
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const toolVersion = (tool, flag) => {
    try {
      const r = spawnSync(tool, [flag]);
      const out = (r.stdout?.toString() || r.stderr?.toString() || '').split('\n')[0].trim();
      return (r.status === 0 || out) ? (out || 'ok') : 'not found';
    } catch { return 'not found'; }
  };
  res.json({
    status: 'ok', mode: 'docker',
    tools: {
      yosys:    toolVersion('yosys',    '-V'),
      iverilog: toolVersion('iverilog', '-V'),
      gtkwave:  toolVersion('gtkwave',  '--version'),
      atalanta: toolVersion('atalanta', '--help'),   // atalanta exits 1 but prints version line
    },
    pdkEnv: ENV_PDK,
    projectsDir: DIRS.projects,
    atpgDir: DIRS.atpg,
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const i = path.join(DIRS.dist, 'index.html');
  if (exists(i)) res.sendFile(i);
  else res.status(503).send('<h2>VerilogBlocks — run npm run build first</h2>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⬡  VerilogBlocks IDE  →  http://localhost:${PORT}\n`);
  console.log(`  PDK  sky130 → ${ENV_PDK.sky130 || 'not set'}`);
  console.log(`  PDK  gf180  → ${ENV_PDK.gf180  || 'not set'}`);
  console.log(`  ATPG atpg dir → ${DIRS.atpg}`);
  const atpgOk = spawnSync('atalanta', ['--help']).pid;
  console.log(`  ATPG atalanta → ${atpgOk ? 'ready' : 'not found (rebuild image)'}\n`);
});
