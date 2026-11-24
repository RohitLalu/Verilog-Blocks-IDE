'use strict';
// Where the desktop app WRITES (projects, tool output, user blocks, preferences).
//
// A packaged app lives in a read-only bundle (app.asar inside a signed .app / AppImage), so its data must go
// to the per-user data folder; before this, projects and output were resolved next to the source files, i.e.
// inside the bundle, and every save would have failed. During development the legacy layout inside the source
// tree is kept so existing local projects stay visible. VBIDE_DATA_DIR overrides both (tests, portable use).
const path = require('path');

function dataDirs({ isPackaged, appDir, userData, env = process.env }) {
  const j = (...p) => path.join(...p);
  const root = env.VBIDE_DATA_DIR ? path.resolve(env.VBIDE_DATA_DIR) : (isPackaged ? userData : null);
  if (root) {
    return { root, legacy: false, projects: j(root, 'projects'), synthesis: j(root, 'synthesis'), atpg: j(root, 'atpg'),
             userBlocks: j(root, 'user-blocks'), prefs: j(root, 'vbide-prefs.json') };
  }
  return { root: appDir, legacy: true, projects: j(appDir, 'projects'), synthesis: j(appDir, 'synthesis', 'output'), atpg: j(appDir, 'atpg'),
           userBlocks: j(appDir, 'pdk', 'user-blocks'), prefs: j(userData, 'vbide-prefs.json') };
}

// Electron patches fs so reads inside app.asar work, but writes there fail. Refuse to start rather than fail on first save.
function assertWritableLocations(dirs) {
  for (const [k, v] of Object.entries(dirs)) {
    if (typeof v === 'string' && /\.asar(?:[\\/]|$)/.test(v)) throw new Error(`Data location "${k}" is inside the app archive: ${v}`);
  }
  return dirs;
}

module.exports = { dataDirs, assertWritableLocations };
