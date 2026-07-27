/**
 * server.js — Express backend for VerilogBlocks IDE in Docker/web mode.
 *
 * Mirrors every electron-main.js IPC handler as an HTTP REST endpoint.
 * Serves the built Vite frontend from /dist.
 *
 * Routes:
 *   GET  /api/pdk/list
 *   GET  /api/pdk/cells-manifest/:id
 *   POST /api/pdk/validate-path       { pdkId, rootPath }
 *   POST /api/pdk/read-lib            { libPath }
 *   GET  /api/prefs
 *   POST /api/prefs                   { ...prefs }
 *   GET  /api/project/list
 *   POST /api/project/save            { name, graph, verilog, testbench, meta }
 *   GET  /api/project/load/:name
 *   POST /api/project/export-as-block { name, blockMeta }
 *   GET  /api/project/user-blocks
 *   POST /api/yosys/synth             { projectName, verilog, pdkRoot, pdkId }
 *   POST /api/sim/run                 { projectName, verilog, testbench }
 */

'use strict';

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const { spawn } = require('child_process');

const app      = express();
const PORT     = process.env.PORT || 3000;
const APP_ROOT = path.join(__dirname, '..');

// ── Directory setup ───────────────────────────────────────────────────────────
const DIRS = {
  dist:     path.join(APP_ROOT, 'dist'),
  pdk:      path.join(APP_ROOT, 'pdk'),
  projects: path.join(APP_ROOT, 'projects'),
  synthesis:path.join(APP_ROOT, 'synthesis', 'output'),
  userBlocks: path.join(APP_ROOT, 'pdk', 'user-blocks'),
};

Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

const PREFS_FILE = path.join(APP_ROOT, '.vbide-prefs.json');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve built React app
app.use(express.static(DIRS.dist));
// Serve PDK manifests directly
app.use('/pdk', express.static(DIRS.pdk));

// ── Helpers ───────────────────────────────────────────────────────────────────
const readJSON  = (p)    => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));
const exists    = (p)    => { try { return fs.existsSync(p); } catch { return false; } };

function findFileRecursive(dir, name, depth = 3) {
  if (depth < 0 || !exists(dir)) return null;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (entry === name) return full;
      try {
        if (fs.statSync(full).isDirectory()) {
          const r = findFileRecursive(full, name, depth - 1);
          if (r) return r;
        }
      } catch {}
    }
  } catch {}
  return null;
}

function loadPrefs() {
  try { return readJSON(PREFS_FILE); } catch { return {}; }
}

// Auto-detect PDK from environment variable (set in docker-compose)
const ENV_PDK_PATHS = {
  sky130: process.env.SKY130_PDK_ROOT || '',
  gf180:  process.env.GF180_PDK_ROOT  || '',
  ihp130: process.env.IHP130_PDK_ROOT || '',
};

// ── PDK Routes ────────────────────────────────────────────────────────────────

app.get('/api/pdk/list', (req, res) => {
  try {
    const registry = readJSON(path.join(DIRS.pdk, 'pdk-registry.json'));
    // Inject env-detected paths into registry so UI can pre-fill them
    registry.forEach(pdk => {
      if (ENV_PDK_PATHS[pdk.id]) {
        pdk.detectedPath = ENV_PDK_PATHS[pdk.id];
      }
    });
    res.json(registry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pdk/cells-manifest/:id', (req, res) => {
  const p = path.join(DIRS.pdk, req.params.id, 'cells-manifest.json');
  if (!exists(p)) return res.status(404).json({ error: 'Manifest not found' });
  res.json(readJSON(p));
});

app.post('/api/pdk/validate-path', (req, res) => {
  const { pdkId, rootPath } = req.body;
  if (!rootPath || !exists(rootPath)) {
    return res.json({ ok: false, error: 'Path does not exist' });
  }
  const expected = {
    sky130: ['sky130_fd_sc_hd.v', 'sky130_fd_sc_hd__tt_025C_1v80.lib'],
    gf180:  ['gf180mcu_fd_sc_mcu7t5v0.v'],
    ihp130: ['sg13g2_stdcell.v'],
  };
  const found = {};
  (expected[pdkId] || []).forEach(f => {
    const hit = findFileRecursive(rootPath, f, 4);
    if (hit) found[f] = hit;
  });
  res.json({ ok: true, found });
});

app.post('/api/pdk/read-lib', (req, res) => {
  const { libPath } = req.body;
  if (!libPath || !exists(libPath)) {
    return res.json({ ok: false, error: 'Liberty file not found' });
  }
  try {
    // Stream large files in chunks
    const stat = fs.statSync(libPath);
    if (stat.size > 50 * 1024 * 1024) {
      return res.json({ ok: false, error: 'Liberty file too large (>50MB)' });
    }
    const content = fs.readFileSync(libPath, 'utf8');
    res.json({ ok: true, content });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Preferences ───────────────────────────────────────────────────────────────

app.get('/api/prefs', (req, res) => {
  const prefs = loadPrefs();
  // Inject env PDK paths as defaults
  if (!prefs.pdkPaths) prefs.pdkPaths = {};
  Object.entries(ENV_PDK_PATHS).forEach(([id, p]) => {
    if (p && !prefs.pdkPaths[id]) prefs.pdkPaths[id] = p;
  });
  res.json(prefs);
});

app.post('/api/prefs', (req, res) => {
  try {
    writeJSON(PREFS_FILE, { ...loadPrefs(), ...req.body });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Projects ──────────────────────────────────────────────────────────────────

app.get('/api/project/list', (req, res) => {
  try {
    const dirs = fs.readdirSync(DIRS.projects)
      .filter(f => fs.statSync(path.join(DIRS.projects, f)).isDirectory());
    res.json(dirs);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/project/save', (req, res) => {
  try {
    const { name, graph, verilog, testbench, meta } = req.body;
    const dir = path.join(DIRS.projects, name);
    fs.mkdirSync(dir, { recursive: true });
    writeJSON(path.join(dir, 'graph.json'), graph);
    fs.writeFileSync(path.join(dir, 'top.v'), verilog || '');
    if (testbench) fs.writeFileSync(path.join(dir, 'top_tb.v'), testbench);
    if (meta)      writeJSON(path.join(dir, 'meta.json'), meta);
    res.json({ ok: true, path: dir });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/project/load/:name', (req, res) => {
  try {
    const dir = path.join(DIRS.projects, req.params.name);
    const graphPath = path.join(dir, 'graph.json');
    const vPath     = path.join(dir, 'top.v');
    if (!exists(graphPath)) return res.status(404).json({ error: 'Project not found' });
    const graph    = readJSON(graphPath);
    const verilog  = exists(vPath) ? fs.readFileSync(vPath, 'utf8') : '';
    const tbPath   = path.join(dir, 'top_tb.v');
    const metaPath = path.join(dir, 'meta.json');
    res.json({
      graph, verilog,
      testbench: exists(tbPath)   ? fs.readFileSync(tbPath, 'utf8') : '',
      meta:      exists(metaPath) ? readJSON(metaPath) : {},
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/project/export-as-block', (req, res) => {
  try {
    const { name, blockMeta } = req.body;
    const projDir = path.join(DIRS.projects, name);
    fs.mkdirSync(DIRS.userBlocks, { recursive: true });
    const verilog = exists(path.join(projDir, 'top.v'))
      ? fs.readFileSync(path.join(projDir, 'top.v'), 'utf8') : '';
    const graph = exists(path.join(projDir, 'graph.json'))
      ? readJSON(path.join(projDir, 'graph.json')) : {};
    const block = { ...blockMeta, sourceProject: name, verilogCode: verilog, graph };
    const outPath = path.join(DIRS.userBlocks, `${name}.json`);
    writeJSON(outPath, block);
    res.json({ ok: true, path: outPath });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/project/user-blocks', (req, res) => {
  try {
    fs.mkdirSync(DIRS.userBlocks, { recursive: true });
    const blocks = fs.readdirSync(DIRS.userBlocks)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return readJSON(path.join(DIRS.userBlocks, f)); } catch { return null; } })
      .filter(Boolean);
    res.json(blocks);
  } catch (e) {
    res.json([]);
  }
});

// ── Yosys Synthesis ───────────────────────────────────────────────────────────

app.post('/api/yosys/synth', (req, res) => {
  const { projectName, verilog, pdkRoot, pdkId } = req.body;

  const projDir = path.join(DIRS.projects, projectName || 'tmp_synth');
  fs.mkdirSync(projDir, { recursive: true });

  const vPath      = path.join(projDir, 'top.v');
  const outSynthV  = path.join(DIRS.synthesis, 'top_synth.v');
  const outSynthJ  = path.join(DIRS.synthesis, 'top_synth.json');
  const scriptPath = path.join(DIRS.synthesis, 'synth.ys');

  fs.writeFileSync(vPath, verilog || '');

  let script = `read_verilog -sv "${vPath}"\n`;
  if (pdkRoot && exists(pdkRoot)) script += `read_verilog -sv "${pdkRoot}"\n`;
  script += [
    'hierarchy -top top',
    'proc; opt; fsm; opt; memory; opt',
    pdkId === 'sky130' ? 'synth_sky130 -top top' : 'synth -top top',
    `write_verilog "${outSynthV}"`,
    `write_json    "${outSynthJ}"`,
    'stat',
  ].join('\n');

  fs.writeFileSync(scriptPath, script);

  let stdout = '', stderr = '';
  const proc = spawn('yosys', ['-s', scriptPath]);
  proc.stdout.on('data', d => { stdout += d; });
  proc.stderr.on('data', d => { stderr += d; });
  proc.on('close', code => {
    res.json({ ok: code === 0, stdout, stderr, output: stdout + (stderr ? '\n--- STDERR ---\n' + stderr : '') });
  });
  proc.on('error', () => {
    res.json({
      ok: false, stdout: '', stderr: '',
      output: [
        'ERROR: yosys not found in container PATH.',
        '',
        'The Docker image includes Yosys. If you see this, please check:',
        '  docker exec -it verilogblocks which yosys',
        '',
        'Rebuild the image:',
        '  docker build -t verilogblocks .',
      ].join('\n'),
    });
  });
});

// ── Icarus Verilog Simulation ─────────────────────────────────────────────────

app.post('/api/sim/run', (req, res) => {
  const { projectName, verilog, testbench } = req.body;

  const projDir = path.join(DIRS.projects, projectName || 'tmp_sim');
  const simDir  = path.join(projDir, 'sim');
  fs.mkdirSync(simDir, { recursive: true });

  const topPath = path.join(simDir, 'top.v');
  const tbPath  = path.join(simDir, 'top_tb.v');
  const outPath = path.join(simDir, 'sim.out');
  const vcdPath = path.join(simDir, 'wave.vcd');

  fs.writeFileSync(topPath, verilog   || '');
  fs.writeFileSync(tbPath,  testbench || '');

  // Compile
  const iverilog = spawn('iverilog', ['-g2012', '-o', outPath, tbPath, topPath]);
  let compErr = '';
  iverilog.stderr.on('data', d => { compErr += d; });

  iverilog.on('error', () => {
    res.json({
      ok: false,
      output: [
        'ERROR: iverilog not found.',
        '',
        'The Docker image includes Icarus Verilog.',
        'Check: docker exec -it verilogblocks which iverilog',
      ].join('\n'),
      vcd: null,
    });
  });

  iverilog.on('close', code => {
    if (code !== 0) {
      return res.json({ ok: false, output: 'Compile error:\n' + compErr, vcd: null });
    }
    // Run
    const vvp = spawn('vvp', [outPath]);
    let simOut = '';
    vvp.stdout.on('data', d => { simOut += d; });
    vvp.stderr.on('data', d => { simOut += d; });
    vvp.on('close', () => {
      const vcd = exists(vcdPath) ? fs.readFileSync(vcdPath, 'utf8') : null;
      res.json({ ok: true, output: simOut, vcd });
    });
    vvp.on('error', () => {
      res.json({ ok: false, output: 'ERROR: vvp not found (Icarus Verilog runtime).', vcd: null });
    });
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  // Check tool availability
  const checks = {};
  ['yosys', 'iverilog'].forEach(tool => {
    try {
      const r = require('child_process').spawnSync(tool, ['--version']);
      checks[tool] = r.status === 0
        ? (r.stdout?.toString().split('\n')[0] || 'ok')
        : 'not found';
    } catch {
      checks[tool] = 'not found';
    }
  });
  res.json({
    status: 'ok',
    mode: 'docker',
    tools: checks,
    pdkEnv: ENV_PDK_PATHS,
    projectsDir: DIRS.projects,
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(DIRS.dist, 'index.html');
  if (exists(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send([
      '<h2>VerilogBlocks IDE — build not found</h2>',
      '<p>Run <code>npm run build</code> first, or use the pre-built Docker image.</p>',
      '<p>For development: <code>npm run dev</code></p>',
    ].join(''));
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ⬡  VerilogBlocks IDE');
  console.log(`  →  http://localhost:${PORT}`);
  console.log('');
  if (ENV_PDK_PATHS.sky130) {
    console.log(`  PDK  sky130 → ${ENV_PDK_PATHS.sky130}`);
  } else {
    console.log('  PDK  sky130 → not set (set SKY130_PDK_ROOT or mount /pdk/sky130)');
  }
  console.log(`  Projects → ${DIRS.projects}`);
  console.log('');
});
