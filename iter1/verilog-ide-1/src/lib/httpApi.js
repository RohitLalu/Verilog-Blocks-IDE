/**
 * httpApi.js
 *
 * When running in a browser (Docker/web mode) instead of Electron,
 * this module creates window.api as an HTTP client that talks to
 * the Express server at the same origin.
 *
 * Shape is identical to the Electron preload.js contextBridge exposure,
 * so all components work without modification.
 *
 * Loaded unconditionally from index.jsx — only installs if window.api
 * is not already set by the Electron preload.
 */

const base = typeof window !== 'undefined' ? '' : 'http://localhost:3000';

const post = (url, body) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());

const get = (url) =>
  fetch(base + url).then(r => r.json());

const httpApi = {
  pdk: {
    list:          ()        => get('/api/pdk/list'),
    validatePath:  (a)       => post('/api/pdk/validate-path', a),
    readLib:       (a)       => post('/api/pdk/read-lib', a),
    cellsManifest: (id)      => get(`/api/pdk/cells-manifest/${id}`),
  },

  prefs: {
    get:  ()  => get('/api/prefs'),
    set:  (p) => post('/api/prefs', p),
  },

  project: {
    list:           ()    => get('/api/project/list'),
    save:           (a)   => post('/api/project/save', a),
    load:           (n)   => get(`/api/project/load/${encodeURIComponent(n)}`),
    exportAsBlock:  (a)   => post('/api/project/export-as-block', a),
    listUserBlocks: ()    => get('/api/project/user-blocks'),
  },

  yosys: {
    synth: (a) => post('/api/yosys/synth', a),
  },

  sim: {
    run: (a) => post('/api/sim/run', a),
  },

  // File dialogs are not available in browser mode.
  // PDKSelector falls back to a manual text input when this returns null.
  dialog: {
    openFolder: () => Promise.resolve(null),
  },
};

// Install only when not already provided by Electron preload
if (typeof window !== 'undefined' && !window.api) {
  window.api = httpApi;
  console.info('[VBiDE] Running in web/Docker mode — using HTTP API');
}

export default httpApi;
