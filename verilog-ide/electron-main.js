const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runSimulation } = require('./server/simRunner.js');
const { runSynthesis } = require('./server/synthRunner.js');
const { runAtpg } = require('./server/atpgRunner.js');
const { findLiberty, findFile } = require('./server/pdkFiles.js');
const { safeId, safeName, projectDir, resolveInside, insideAnyRoot, sanitizePrefs } = require('./server/pathSafe.js');
const { dataDirs, assertWritableLocations } = require('./server/appPaths.js');
const { toolPath, ivlBaseAlias, removeAlias } = require('./server/toolEnv.js');
const { run } = require('./server/proc.js');

// ── modes ─────────────────────────────────────────────────────────────────────────
//   packaged      : loads dist/index.html from the app bundle; data lives in the per-user data folder
//   npm run start : unpackaged, talks to the Vite dev server (hot reload)
//   --use-dist    : unpackaged but loads the built dist/ (what `npm run electron:dist` uses)
//   --smoke-test  : loads the app headless, checks that it renders and that the IPC layer works, then exits
//                   0/1 (CI check for a packaged build). Writes only to a temporary data folder.
const SMOKE = process.argv.includes('--smoke-test');
const USE_DIST = SMOKE || process.argv.includes('--use-dist') || process.env.VBIDE_USE_DIST === '1';
const DEV_URL = process.env.VBIDE_DEV_URL || 'http://localhost:5173';
const devServer = !app.isPackaged && !USE_DIST;

if (SMOKE) {
  // Isolated by default. VBIDE_SMOKE_USE_USERDATA=1 exercises the real default (per-user data folder); combine it with
  // --user-data-dir=<tmp> to keep that out of your real profile.
  if (!process.env.VBIDE_DATA_DIR && !process.env.VBIDE_SMOKE_USE_USERDATA) process.env.VBIDE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-smoke-'));
  app.disableHardwareAcceleration();
}

// yosys / iverilog / atalanta are found through PATH: bundled copy first, Homebrew prefixes as a fallback
process.env.PATH = toolPath({ envPath: process.env.PATH, resourcesPath: process.resourcesPath, packaged: app.isPackaged });
const BUNDLED_TOOLS = app.isPackaged ? path.join(process.resourcesPath, 'tools') : null;
if (BUNDLED_TOOLS && fs.existsSync(BUNDLED_TOOLS)) {
  try {
    const alias = ivlBaseAlias(BUNDLED_TOOLS);
    if (alias) { process.env.VBIDE_IVL_BASE = path.join(alias, 'lib', 'ivl'); app.on('quit', () => removeAlias(alias)); }
  } catch (e) { console.error('Could not create a space-free path for iverilog; simulation may fail:', e.message); }
}
const DIRS = assertWritableLocations(dataDirs({ isPackaged: app.isPackaged, appDir: __dirname, userData: app.getPath('userData') }));

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1100, minHeight: 650,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#0d1117', show: false, title: 'VerilogBlocks IDE',
  });
  const loaded = SMOKE ? new Promise((resolve, reject) => {          // attach before loading, so the event can't be missed
    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_e, code, desc, url) => reject(new Error(`did-fail-load ${desc} ${url}`)));
  }) : null;

  // The window only ever shows our own page. Links go to the user's browser, never into this window.
  const external = url => /^https?:\/\//i.test(url);
  win.webContents.setWindowOpenHandler(({ url }) => { if (external(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://') || (devServer && url.startsWith(DEV_URL))) return;
    e.preventDefault(); if (external(url)) shell.openExternal(url);
  });

  if (devServer) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  win.once('ready-to-show', () => { if (!SMOKE) win.show(); });
  if (devServer) win.webContents.openDevTools({ mode: 'detach' });
  return loaded;
}

app.whenReady().then(async () => {
  const loaded = createWindow();
  if (SMOKE) await smokeTest(loaded);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!SMOKE && BrowserWindow.getAllWindows().length === 0) createWindow(); });

const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

const loadPrefs = () => { try { return readJSON(DIRS.prefs); } catch { return {}; } };
const savePrefs = p => { fs.mkdirSync(path.dirname(DIRS.prefs), { recursive: true }); writeJSON(DIRS.prefs, p); };

// ── PDK ──────────────────────────────────────────────────────────────────────
ipcMain.handle('pdk:list', async () => readJSON(path.join(__dirname, 'pdk', 'pdk-registry.json')));
ipcMain.handle('pdk:cells-manifest', async (_, id) => {
  const p = resolveInside(path.join(__dirname, 'pdk'), safeId(id, 'PDK id'), 'cells-manifest.json');
  return exists(p) ? readJSON(p) : null;
});
ipcMain.handle('pdk:validate-path', async (_, { pdkId, rootPath }) => {
  if (typeof rootPath !== 'string' || !rootPath || !exists(rootPath)) return { ok: false, error: 'Path does not exist' };
  try { if (!fs.statSync(rootPath).isDirectory()) return { ok: false, error: 'Path is not a folder' }; } catch { return { ok: false, error: 'Path does not exist' }; }
  const expected = { sky130: ['sky130_fd_sc_hd.v', 'sky130_fd_sc_hd__tt_025C_1v80.lib'], gf180: ['gf180mcu_fd_sc_mcu7t5v0.v'], ihp130: ['sg13g2_stdcell.v'] };
  const found = {};
  (expected[pdkId] || []).forEach(f => { const h = findFile(rootPath, f, 4); if (h) found[f] = h; });
  return { ok: true, found, liberty: findLiberty(pdkId, rootPath) };
});
ipcMain.handle('pdk:read-lib', async (_, { libPath }) => {
  // Only Liberty files inside a configured PDK folder — never arbitrary files.
  if (typeof libPath !== 'string' || !libPath.toLowerCase().endsWith('.lib')) return { ok: false, error: 'Only Liberty (.lib) files can be read.' };
  const roots = [...Object.values(loadPrefs().pdkPaths || {}), process.env.SKY130_PDK_ROOT, process.env.GF180_PDK_ROOT, process.env.IHP130_PDK_ROOT];
  if (!insideAnyRoot(libPath, roots)) return { ok: false, error: 'That file is not inside a configured PDK folder.' };
  try { return { ok: true, content: fs.readFileSync(libPath, 'utf8') }; } catch (e) { return { ok: false, error: e.message }; }
});

// ── Prefs ────────────────────────────────────────────────────────────────────
ipcMain.handle('prefs:get', async () => loadPrefs());
ipcMain.handle('prefs:set', async (_, p) => { savePrefs({ ...loadPrefs(), ...sanitizePrefs(p) }); return true; });

// ── Projects ─────────────────────────────────────────────────────────────────
ipcMain.handle('project:list', async () => {
  fs.mkdirSync(DIRS.projects, { recursive: true });
  return fs.readdirSync(DIRS.projects).filter(f => { try { return fs.statSync(path.join(DIRS.projects, f)).isDirectory(); } catch { return false; } });
});
ipcMain.handle('project:save', async (_, { name, graph, verilog, testbench, meta }) => {
  const dir = projectDir(DIRS.projects, name); fs.mkdirSync(dir, { recursive: true });
  writeJSON(path.join(dir, 'graph.json'), graph);
  fs.writeFileSync(path.join(dir, 'top.v'), verilog || '');
  if (testbench) fs.writeFileSync(path.join(dir, 'top_tb.v'), testbench);
  if (meta) writeJSON(path.join(dir, 'meta.json'), meta);
  return { ok: true };
});
ipcMain.handle('project:load', async (_, name) => {
  const dir = projectDir(DIRS.projects, name);
  const graphPath = path.join(dir, 'graph.json');
  if (!exists(graphPath)) throw new Error('Project not found');
  return {
    graph: readJSON(graphPath),
    verilog: exists(path.join(dir, 'top.v')) ? fs.readFileSync(path.join(dir, 'top.v'), 'utf8') : '',
    testbench: exists(path.join(dir, 'top_tb.v')) ? fs.readFileSync(path.join(dir, 'top_tb.v'), 'utf8') : '',
    meta: exists(path.join(dir, 'meta.json')) ? readJSON(path.join(dir, 'meta.json')) : {},
  };
});
ipcMain.handle('project:export-as-block', async (_, { name, blockMeta }) => {
  fs.mkdirSync(DIRS.userBlocks, { recursive: true });
  const topV = path.join(projectDir(DIRS.projects, name), 'top.v');
  const verilog = exists(topV) ? fs.readFileSync(topV, 'utf8') : '';
  writeJSON(resolveInside(DIRS.userBlocks, `${safeName(name, 'block name')}.json`), { ...blockMeta, verilogCode: verilog });
  return { ok: true };
});
ipcMain.handle('project:list-user-blocks', async () => {
  fs.mkdirSync(DIRS.userBlocks, { recursive: true });
  return fs.readdirSync(DIRS.userBlocks).filter(f => f.endsWith('.json')).map(f => { try { return readJSON(path.join(DIRS.userBlocks, f)); } catch { return null; } }).filter(Boolean);
});

// ── Tools (shared runners: the same code the Docker server uses) ─────────────
ipcMain.handle('yosys:synth', async (_, { projectName, verilog, pdkRoot, pdkId }) =>
  runSynthesis({ projDir: projectDir(DIRS.projects, projectName || 'tmp'), outDir: DIRS.synthesis, verilog, pdkId, pdkRoot: pdkRoot || '' }));
ipcMain.handle('sim:run', async (_, { projectName, verilog, testbench }) =>
  runSimulation({ simDir: path.join(projectDir(DIRS.projects, projectName || 'tmp'), 'sim'), verilog, testbench }));
ipcMain.handle('atpg:run', async (_, { projectName, verilog }) =>
  runAtpg({ projDir: projectDir(DIRS.projects, projectName || 'tmp_atpg'), outDir: DIRS.atpg, verilog }));

// ── Dialog ───────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// ── Smoke test (--smoke-test) ────────────────────────────────────────────────
// Run against a PACKAGED build this proves what the audit found broken: the page renders from file://, the
// preload/IPC bridge works, writes go to a writable data folder (not the archive), and bad names are refused.
async function smokeTest(loaded) {
  const watchdog = setTimeout(() => { console.log('SMOKE ' + JSON.stringify({ ok: false, error: 'timeout after 120s' })); app.exit(2); }, 120000);
  const result = { ok: false, packaged: app.isPackaged, dataRoot: DIRS.root, legacyLayout: DIRS.legacy };
  try {
    await loaded;
    await new Promise(r => setTimeout(r, 1500));                      // let React mount
    const page = await win.webContents.executeJavaScript(`(async () => {
      const out = {}, root = document.getElementById('root'), api = window.api;
      out.rootChildren = root ? root.children.length : -1;
      out.apiGroups = api ? Object.keys(api).sort() : null;
      try { const reg = await api.pdk.list(); out.pdkRegistry = Array.isArray(reg) ? reg.length : Object.keys(reg).length; } catch (e) { out.pdkError = String(e); }
      try {
        await api.project.save({ name: 'smoke-test', graph: { nodes: [], edges: [] }, verilog: '// smoke' });
        const back = await api.project.load('smoke-test');
        out.saveLoadRoundTrip = back.verilog === '// smoke';
        out.listed = (await api.project.list()).includes('smoke-test');
      } catch (e) { out.projectError = String(e); }
      out.badNameRejected = await api.project.save({ name: '../escape', graph: {} }).then(() => false, () => true);
      out.libOutsidePdkRejected = (await api.pdk.readLib({ libPath: '/etc/passwd' })).ok === false;
      const v = 'module top(input a, input b, output y); assign y = a & b; endmodule\\n';
      const tb = 'module tb; reg a=0, b=0; wire y; top dut(.a(a),.b(b),.y(y)); initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb); #1 a=1; #1 b=1; #1 $finish; end endmodule\\n';
      try { const s = await api.sim.run({ projectName: 'smoke-test', verilog: v, testbench: tb }); out.sim = { ok: s.ok, vcd: !!s.vcd, output: s.ok ? undefined : s.output }; } catch (e) { out.sim = { error: String(e) }; }
      try { const a = await api.atpg.run({ projectName: 'smoke-test', verilog: v }); out.atpg = { ok: a.ok, stage: a.stage, coverage: a.coverage, output: a.ok ? undefined : a.output }; } catch (e) { out.atpg = { error: String(e) }; }
      return out;
    })()`);
    // Which executable each tool name resolves to (spawn's PATH lookup; Windows adds .exe)
    const where = t => process.env.PATH.split(path.delimiter).filter(Boolean)
      .map(d => path.join(d, t + (process.platform === 'win32' ? '.exe' : ''))).find(exists) || null;
    const tools = Object.fromEntries(['yosys', 'iverilog', 'vvp', 'atalanta'].map(t => [t, where(t)]));
    const bundled = app.isPackaged && exists(path.join(process.resourcesPath, 'tools', 'bin'));
    Object.assign(result, page, { bundledTools: bundled, tools });
    const problems = [];
    if (bundled) {
      // A packaged app with bundled tools must run them from inside the bundle, end to end
      for (const t of ['yosys', 'iverilog', 'vvp']) if (!(tools[t] || '').startsWith(process.resourcesPath)) problems.push(`${t} resolves outside the app bundle: ${tools[t]}`);
      if (!(page.sim && page.sim.ok && page.sim.vcd)) problems.push('simulation through IPC produced no waveform');
      const atpgOk = page.atpg && (page.atpg.ok || (!tools.atalanta && page.atpg.stage === 'atalanta'));   // without atalanta, Yosys + converter must still succeed
      if (!atpgOk) problems.push('ATPG through IPC failed');
      if (tools.atalanta && !(tools.atalanta.startsWith(process.resourcesPath) && page.atpg.coverage > 0)) problems.push('bundled atalanta did not report coverage');
      // Synthesis needs Yosys to start yosys-abc (the ATPG flow above does not use ABC)
      const v = path.join(DIRS.root, 'abc-check.v');
      fs.mkdirSync(DIRS.root, { recursive: true });
      fs.writeFileSync(v, 'module top(input [3:0] a, b, output [3:0] y); assign y = a + b; endmodule\n');
      const y = await run('yosys', ['-p', `read_verilog "${v}"; synth -top top; abc -g AND,OR,XOR; stat`], { cwd: DIRS.root, timeoutMs: 60000 });
      result.abc = y.code === 0 && /Executing ABC pass/.test(y.out);
      if (!result.abc) problems.push('yosys could not run ABC: ' + (y.error ? String(y.error) : y.out.slice(-800)));
    }
    if (!(page.rootChildren > 0)) problems.push('page did not render (empty #root)');
    for (const g of ['pdk', 'prefs', 'project', 'yosys', 'sim', 'atpg', 'dialog']) if (!(page.apiGroups || []).includes(g)) problems.push('window.api.' + g + ' missing');
    if (!(page.pdkRegistry > 0)) problems.push('pdk registry not readable: ' + page.pdkError);
    if (page.saveLoadRoundTrip !== true || page.listed !== true) problems.push('project save/load failed: ' + page.projectError);
    if (!page.badNameRejected) problems.push('path-traversal project name was accepted');
    if (!page.libOutsidePdkRejected) problems.push('read-lib served a file outside a PDK folder');
    if (/\.asar(?:[\\/]|$)/.test(DIRS.projects)) problems.push('data folder is inside the app archive');
    result.problems = problems; result.ok = problems.length === 0;
  } catch (e) { result.error = String(e && e.message || e); }
  clearTimeout(watchdog);
  console.log('SMOKE ' + JSON.stringify(result));
  app.exit(result.ok ? 0 : 1);
}
