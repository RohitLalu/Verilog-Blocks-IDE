'use strict';
// Per-PDK facts shared by the HTTP server and the Electron main process:
// where the Liberty timing library lives, and which cells logic synthesis must never use.
const fs = require('fs');
const path = require('path');

const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

const PDKS = {
  sky130: {
    label: 'SkyWater SKY130 (sky130_fd_sc_hd)',
    liberty: ['sky130_fd_sc_hd__tt_025C_1v80.lib'],
    libertyPattern: /^sky130_fd_sc_hd__tt_025C_.*\.lib$/,
    example: '~/.ciel/ciel/sky130/versions/<hash>   (Docker: set SKY130_PDK_ROOT)',
    // Low-power, debug, delay, clock-tree and physical-only cells: never wanted in a logic netlist.
    dontUse: /__(lpflow_|probe|dlygate|dlymetal|clkdlybuf|clkbuf|clkinv|bufbuf|macro_sparecell|decap|diode|tapvpwrvgnd|fill|conb)/,
  },
  gf180: {
    label: 'GlobalFoundries GF180MCU (gf180mcu_fd_sc_mcu7t5v0)',
    // Upstream names the 3.3 V typical corner "3v30"; the app historically looked for "3v3".
    liberty: ['gf180mcu_fd_sc_mcu7t5v0__tt_025C_3v30.lib', 'gf180mcu_fd_sc_mcu7t5v0__tt_025C_3v3.lib'],
    libertyPattern: /^gf180mcu_fd_sc_mcu7t5v0__tt_025C_.*\.lib$/,
    example: '~/.volare/gf180mcuD   (Docker: set GF180_PDK_ROOT)',
    dontUse: /__(antenna|bufz|invz|clkbuf|clkinv|dly[a-d]_|fill|endcap|hold|tieh|tiel|icgt)/,
  },
};

// Depth- and size-limited walk that collects files whose name satisfies `pred`. The entry budget
// stops a path like "/" from turning a PDK check into a scan of the whole disk.
function findFiles(dir, pred, depth = 6, found = [], budget = { left: 20000 }, limit = 64) {
  if (depth < 0 || found.length >= limit || budget.left <= 0 || !exists(dir)) return found;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    if (--budget.left <= 0 || found.length >= limit) break;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findFiles(full, pred, depth - 1, found, budget, limit);
    else if (pred(e.name)) found.push(full);
  }
  return found;
}

const findFile = (dir, name, depth = 4) => findFiles(dir, n => n === name, depth, [], undefined, 1)[0] || null;

// First exact-name match wins (in priority order); otherwise any typical-corner library.
function findLiberty(pdkId, rootPath) {
  const pdk = PDKS[pdkId];
  if (!pdk || !rootPath || !exists(rootPath)) return null;
  const hits = findFiles(rootPath, n => pdk.liberty.includes(n) || pdk.libertyPattern.test(n));
  for (const name of pdk.liberty) {
    const h = hits.find(f => path.basename(f) === name);
    if (h) return h;
  }
  return hits.sort()[0] || null;
}

module.exports = { PDKS, exists, findFiles, findFile, findLiberty };
