'use strict';
// Screenshots of the real app for the website. Runs the desktop app on its built UI with a throwaway data folder,
// saves a demo design (1-bit full adder from sky130 gates), opens it through the app's own Open Project dialog,
// and saves JPEGs to website/site/assets/shots/. ATPG needs atalanta on PATH.
//   cd verilog-ide && npm run build && npx electron ../website/capture/capture.js
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(__dirname, '..', 'site', 'assets', 'shots');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-capture-'));
process.env.VBIDE_DATA_DIR = DATA;
app.setPath('userData', path.join(DATA, 'profile'));   // fresh UI state each run, and the real profile is left alone
process.argv.push('--use-dist');
require('../../verilog-ide/electron-main.js');

// ── demo design ──────────────────────────────────────────────────────────────
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '../../verilog-ide/pdk/sky130/cells-manifest.json'), 'utf8')).cells;
const cell = id => cells.find(c => c.id === id);
const node = (id, cellId, instanceName, x, y) => ({ id, type: 'blockNode', position: { x, y }, data: { ...cell(cellId), instanceName, paramValues: {} } });
// same look as an edge drawn in the app (graphStore.onConnect)
const edge = (source, sourceHandle, target, targetHandle) => ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle,
  style: { stroke: '#3b82f6', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#3b82f6' },
  labelStyle: { fill: '#475569', fontSize: 8, fontFamily: 'JetBrains Mono' }, labelBgStyle: { fill: '#0d1117', fillOpacity: 0.85 } });
const graph = {
  nodes: [
    node('x1', 'sky130_xor2', 'xor_ab', 0, 0), node('x2', 'sky130_xor2', 'xor_sum', 320, 0),
    node('a1', 'sky130_and2', 'and_ab', 0, 220), node('a2', 'sky130_and2', 'and_cin', 320, 180),
    node('o1', 'sky130_or2', 'or_cout', 620, 220),
  ],
  edges: [edge('x1', 'X', 'x2', 'A'), edge('x1', 'X', 'a2', 'A'), edge('a1', 'X', 'o1', 'B'), edge('a2', 'X', 'o1', 'A')],
};
const proj = path.join(DATA, 'projects', 'full_adder');
fs.mkdirSync(proj, { recursive: true });
fs.writeFileSync(path.join(proj, 'graph.json'), JSON.stringify(graph));
fs.writeFileSync(path.join(proj, 'meta.json'), JSON.stringify({ pdkId: 'sky130', pdkName: 'SkyWater SKY130' }));

// ── driving the UI ───────────────────────────────────────────────────────────
const wait = ms => new Promise(r => setTimeout(r, ms));
async function shot(win, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const img = (await win.webContents.capturePage()).resize({ width: 1600, quality: 'best' });
  fs.writeFileSync(path.join(OUT, name + '.jpg'), img.toJPEG(85));
  console.log('saved', name);
}
// click the first visible element whose text contains `text`
async function click(win, text) {
  for (let t = 0; t < 30; t++) {                                       // the UI may still be rendering: retry for 6 s
    const ok = await win.webContents.executeJavaScript(`(() => {
      const hit = e => e.offsetParent !== null && e.children.length < 3 && (e.textContent || '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())});
      const el = [...document.querySelectorAll('button')].find(hit) || [...document.querySelectorAll('[role=button], div, span')].reverse().find(hit);
      if (!el) return false; el.click(); return true; })()`);
    if (ok) return wait(900);
    await wait(200);
  }
  throw new Error('nothing to click: ' + text);
}
const steps = process.argv.includes('--list-buttons');

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setContentSize(1440, 900);
      await wait(2500);
      if (steps) console.log(await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).join(' | ')`));
      await shot(win, 'new-project');
      await click(win, 'Create Project');
      await click(win, 'Open Project');
      await click(win, 'full_adder');
      await wait(4500);                                                   // let the "Loaded" toast fade
      await shot(win, 'canvas');
      await click(win, '</>'); await wait(1200); await shot(win, 'verilog');
      // simulation: every input random, run iverilog, the waveform opens
      await click(win, 'Sim');
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'random').forEach(b => b.click())`);
      await wait(500); await shot(win, 'testbench');
      // shortcut: no waveform shot yet, the VCD viewer opens zoomed into the first ~300 ps; add it once that is fixed
      await click(win, 'iverilog'); await wait(5000);
      // ATPG needs atalanta on PATH
      await click(win, 'ATPG'); await click(win, 'Run ATPG'); await wait(6000); await shot(win, 'atpg');
      await click(win, 'STA'); await click(win, 'Run STA'); await wait(2500); await shot(win, 'sta');
    } catch (e) { console.error(e); process.exitCode = 1; }
    app.exit();
  });
});
