'use strict';
// Records the promo video from the real app: the built UI in Electron, driven step by step (cells dropped the way a drag
// drops them, wires drawn with real mouse events), with a visible cursor, click ripples and captions drawn on top.
// Frames come from Electron's frame stream and are piped into ffmpeg; nothing is staged in a mock-up.
//
//   cd verilog-ide && npm run build
//   PATH=<folder with atalanta>:$PATH npx electron ../website/video/record.js
//   -> website/video/out/raw.mp4 (near-lossless master, not committed), and for the site:
//      website/site/assets/vbide-promo.mp4 (H.264, starts playing while it downloads) + vbide-promo.jpg (poster)
//
// Needs ffmpeg on PATH. The window must stay visible and on top while it records (about 80 s).
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const W = 1408, H = 792, FPS = 30, OUT_W = 1920, OUT_H = 1080;   // 1408x792 fits a 13" Mac screen; scaled to 1080p
app.commandLine.appendSwitch('force-device-scale-factor', String(OUT_W / W));

const OUT = path.join(__dirname, 'out');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-video-'));
process.env.VBIDE_DATA_DIR = DATA;
app.setPath('userData', path.join(DATA, 'profile'));      // fresh UI state, real profile untouched
process.argv.push('--use-dist');
require('../../verilog-ide/electron-main.js');

const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '../../verilog-ide/pdk/sky130/cells-manifest.json'), 'utf8')).cells;
const cell = id => cells.find(c => c.id === id);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ── recorder: keep the latest painted frame, write it at a steady 30 fps ────────────────────────────────────────
function recorder(win) {
  fs.mkdirSync(OUT, { recursive: true });
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${OUT_W}x${OUT_H}`, '-r', String(FPS),
    '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', path.join(OUT, 'raw.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  let latest = null, written = 0, t0 = 0, busy = false, stopped = false;
  win.webContents.beginFrameSubscription(false, img => {
    const s = img.getSize();
    latest = (s.width === OUT_W && s.height === OUT_H ? img : img.resize({ width: OUT_W, height: OUT_H })).toBitmap();
  });
  win.webContents.invalidate();
  const tick = async () => {
    if (busy || !latest) return; busy = true;
    if (!t0) t0 = Date.now();
    const due = Math.floor((Date.now() - t0) / 1000 * FPS) + 1;      // catch up if a write was slow: duration stays real
    while (written < due && !stopped) { if (!ff.stdin.write(latest)) await new Promise(r => ff.stdin.once('drain', r)); written++; }
    busy = false;
  };
  const timer = setInterval(tick, 1000 / FPS / 2);
  return async () => {
    stopped = true; clearInterval(timer); win.webContents.endFrameSubscription();
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    return written / FPS;
  };
}

// ── overlay: cursor, ripple, caption, full-screen cards ───────────────────────────────────────────────────────
const OVERLAY = `(() => {
  const css = document.createElement('style');
  css.textContent = \`
    #pv{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:'Space Grotesk',sans-serif}
    #pv-cur{position:absolute;left:700px;top:420px;width:26px;height:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
    .pv-rip{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #38bdf8;animation:pvr .55s ease-out forwards}
    @keyframes pvr{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
    #pv-cap{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);background:rgba(13,17,23,.94);border:1px solid #3b82f6;
      color:#e2e8f0;font-size:26px;font-weight:600;padding:12px 26px;border-radius:12px;white-space:nowrap;opacity:0;transition:opacity .35s;box-shadow:0 10px 40px rgba(0,0,0,.5)}
    #pv-cap small{display:block;font-size:15px;font-weight:400;color:#94a3b8;margin-top:2px}
    #pv-card{position:absolute;inset:0;background:radial-gradient(ellipse at center,#16233a 0%,#0d1117 70%);display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;color:#e2e8f0;opacity:0;transition:opacity .6s}
    #pv-card .k{font:600 16px 'JetBrains Mono',monospace;color:#4ade80;letter-spacing:.12em;text-transform:uppercase}
    #pv-card h1{font-size:64px;margin:14px 0 10px;letter-spacing:-.02em}
    #pv-card p{font-size:24px;color:#94a3b8;margin:0}
    #pv-card .u{margin-top:28px;font:600 26px 'JetBrains Mono',monospace;color:#38bdf8}\`;
  document.head.appendChild(css);
  const pv = document.createElement('div'); pv.id = 'pv';
  pv.innerHTML = '<div id="pv-card"></div><div id="pv-cap"></div><svg id="pv-cur" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.8L21 10.6z" fill="#fff" stroke="#0d1117" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.appendChild(pv);
  const cur = document.getElementById('pv-cur');
  window.pv = {
    pos: () => ({ x: parseFloat(cur.style.left) || 700, y: parseFloat(cur.style.top) || 420 }),
    at(x, y) { cur.style.left = x + 'px'; cur.style.top = y + 'px'; },
    move(x, y, ms = 650) { const a = this.pos(); return new Promise(res => { const t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
        this.at(a.x + (x - a.x) * e, a.y + (y - a.y) * e); k < 1 ? requestAnimationFrame(step) : res(); };
      requestAnimationFrame(step); }); },
    ripple() { const p = this.pos(), r = document.createElement('div'); r.className = 'pv-rip';
      r.style.left = p.x + 'px'; r.style.top = p.y + 'px'; pv.appendChild(r); setTimeout(() => r.remove(), 700); },
    cap(html) { const c = document.getElementById('pv-cap'); if (!html) { c.style.opacity = 0; return; } c.innerHTML = html; c.style.opacity = 1; },
    card(html) { const c = document.getElementById('pv-card'); if (!html) { c.style.opacity = 0; return; } c.innerHTML = html; c.style.opacity = 1; },
    cursor(show) { cur.style.display = show ? '' : 'none'; },
  };
})()`;

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    let stop = null;
    try {
      win.setContentSize(W, H); win.center(); win.focus(); win.setAlwaysOnTop(true);
      const js = code => win.webContents.executeJavaScript(code).catch(e => { throw new Error(`page step failed: ${code.slice(0, 160)}`); });
      await wait(2500);
      await js(OVERLAY);

      // helpers: find an element (buttons first) by its text, its centre on screen, and act there
      const centre = sel => js(`(() => { const r = (${sel}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const byText = t => `([...document.querySelectorAll('button')].find(e => e.offsetParent && e.textContent.toLowerCase().includes(${JSON.stringify(t.toLowerCase())}))
        || [...document.querySelectorAll('div,span')].reverse().find(e => e.offsetParent && e.children.length < 3 && e.textContent.toLowerCase().includes(${JSON.stringify(t.toLowerCase())})))`;
      const moveTo = async (p, ms) => { await js(`pv.move(${p.x}, ${p.y}, ${ms || 650})`); };
      const click = async t => { const p = await centre(byText(t)); await moveTo(p); await js('pv.ripple()'); await js(`${byText(t)}.click()`); await wait(500); };
      const cap = (title, sub) => js(`pv.cap(${JSON.stringify(title ? `${title}${sub ? `<small>${sub}</small>` : ''}` : '')})`);

      // drop a cell where a drag would drop it: same data the cell list puts on the drag
      const drop = async (cellId, label, x, y) => {
        const from = await centre(`[...document.querySelectorAll('[draggable=true]')].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)}))`);
        await moveTo(from, 550); await js('pv.ripple()'); await moveTo({ x, y }, 750);
        await js(`(() => { const dt = new DataTransfer(); dt.setData('application/blockdef', ${JSON.stringify(JSON.stringify(cell(cellId)))});
          document.elementFromPoint(${x}, ${y}).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, dataTransfer: dt })); })()`);
        await wait(450);
      };
      // the canvas's own "fit view" button, pressed with the cursor: keeps the whole circuit in view
      const fit = async () => { const p = await centre(`document.querySelector('.react-flow__controls-fitview')`); await moveTo(p, 450);
        await js('pv.ripple()'); await js(`document.querySelector('.react-flow__controls-fitview').click()`); await wait(700); };
      // draw a wire with real mouse events, from an output pin to an input pin (nodes by creation order)
      const handle = (i, pin) => `document.querySelectorAll('.react-flow__node')[${i}].querySelector('.react-flow__handle[data-handleid="${pin}"]')`;
      const wire = async (a, outPin, b, inPin) => {
        const p = await centre(handle(a, outPin)), q = await centre(handle(b, inPin));
        await moveTo(p, 500);
        win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(p.x), y: Math.round(p.y) });
        win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1 });
        for (let k = 1; k <= 24; k++) {
          const x = p.x + (q.x - p.x) * k / 24, y = p.y + (q.y - p.y) * k / 24;
          win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y), button: 'left' });
          await js(`pv.at(${x}, ${y})`); await wait(25);
        }
        win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(q.x), y: Math.round(q.y), button: 'left', clickCount: 1 });
        await js('pv.ripple()'); await wait(350);
      };

      // ── the story ───────────────────────────────────────────────────────────────────────────────────────────
      await js(`pv.cursor(false); pv.card('<div class="k">Free · open source · macOS, Windows, Linux</div><h1>VerilogBlocks IDE</h1><p>Draw a circuit. Get real Verilog.</p>')`);
      await wait(800);
      stop = recorder(win);
      await wait(3200);
      await js(`pv.card(''); pv.cursor(true)`); await wait(700);

      await cap('Start a project on a real process', 'SkyWater SKY130 open-source PDK');
      await wait(1200); await click('Create Project'); await wait(600);

      await cap('Drag in real standard cells', 'two XORs, two ANDs and an OR: a full adder');
      // The canvas zoom isn't fixed (fitView), so lay out by the first cell's real size. A drop puts the cell's corner
      // (75, 40) flow units up-left of the pointer (Workspace.jsx onDrop).
      const pane = await js(`(() => { const r = document.querySelector('.react-flow').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
      const zoom = () => js(`new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a`);
      let z = await zoom();
      await drop('sky130_xor2', 'XOR2', pane.x + 30 + 75 * z, pane.y + 20 + 40 * z);
      const node0 = () => js(`(() => { const r = document.querySelector('.react-flow__node').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const paneBox = await js(`(() => { const r = document.querySelector('.react-flow').getBoundingClientRect(); return { r: r.right, b: r.bottom }; })()`);
      let n0 = await node0();
      // zoom out (with the canvas's own button) until three columns and two rows of cells fit
      for (let i = 0; i < 6 && (n0.x + 3.6 * n0.w > paneBox.r - 20 || n0.y + 2.12 * n0.h > paneBox.b - 90); i++) {
        const b = await centre(`document.querySelector('.react-flow__controls-zoomout')`); await moveTo(b, 350); await js('pv.ripple()');
        await js(`document.querySelector('.react-flow__controls-zoomout').click()`); await wait(450); n0 = await node0();
      }
      z = await zoom();
      const at = (c, r) => ({ x: n0.x + c * 1.3 * n0.w + 75 * z, y: n0.y + r * 1.12 * n0.h + 40 * z });
      for (const [id, label, c, r] of [['sky130_xor2', 'XOR2', 1, 0], ['sky130_and2', 'AND2', 0, 1], ['sky130_and2', 'AND2', 1, 1], ['sky130_or2', 'OR2', 2, 1]]) {
        const p = at(c, r); await drop(id, label, p.x, p.y);
      }
      await wait(300); await fit();

      await cap('Wire them up', 'each wire is named after the pin that drives it');
      await wire(0, 'X', 1, 'A'); await wire(0, 'X', 3, 'A'); await wire(2, 'X', 4, 'B'); await wire(3, 'X', 4, 'A');
      await wait(900);

      await cap('The Verilog writes itself', 'structural Verilog, updated as you draw');
      await click('</>'); await wait(600); await fit(); await wait(2400);

      await cap('Simulate with Icarus Verilog', 'random stimulus on every input, one click');
      await click('Sim'); await wait(500);
      for (let i = 0; i < 6; i++) {
        const p = await centre(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'random')[${i}]`);
        await moveTo(p, 260); await js('pv.ripple()');
        await js(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'random')[${i}].click()`); await wait(120);
      }
      await click('iverilog'); await wait(4200);
      await fit(); await wait(600);

      await cap('Check the timing', 'critical path, slack and maximum clock frequency');
      await click('STA'); await fit(); await click('Run STA'); await wait(3000);

      await cap('Measure fault coverage', 'Yosys + atalanta find a test for every stuck-at fault');
      await click('ATPG'); await click('Run ATPG'); await wait(3800);

      await cap('');
      await js(`pv.cursor(false); pv.card('<div class="k">Yosys and Icarus Verilog included</div><h1>Free for macOS, Windows and Linux</h1><p>Open source · MIT licence</p><div class="u">vbide.netlify.app</div>')`);
      await wait(4500);
      const secs = await stop(); stop = null;
      console.log(`recorded ${secs.toFixed(1)} s -> ${path.relative(process.cwd(), path.join(OUT, 'raw.mp4'))}`);
      // web copy: smaller, starts playing while it downloads; poster = the title card
      const assets = path.join(__dirname, '..', 'site', 'assets'), raw = path.join(OUT, 'raw.mp4');
      const ff = args => { const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' ')); };
      ff(['-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(assets, 'vbide-promo.mp4')]);
      ff(['-ss', '1.5', '-i', raw, '-frames:v', '1', '-vf', 'scale=1600:-1', '-q:v', '3', path.join(assets, 'vbide-promo.jpg')]);
      console.log(`web copy: ${(fs.statSync(path.join(assets, 'vbide-promo.mp4')).size / 1e6).toFixed(1)} MB`);
    } catch (e) { console.error(e); process.exitCode = 1; if (stop) await stop(); }
    app.exit();
  });
});
