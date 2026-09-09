const post = (url, body) =>
  fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }).then(r => r.json());
const get = url => fetch(url).then(r => r.json());

const httpApi = {
  pdk: {
    list:          ()  => get('/api/pdk/list'),
    validatePath:  a   => post('/api/pdk/validate-path', a),
    readLib:       a   => post('/api/pdk/read-lib', a),
    cellsManifest: id  => get(`/api/pdk/cells-manifest/${id}`),
  },
  prefs: {
    get: ()  => get('/api/prefs'),
    set: p   => post('/api/prefs', p),
  },
  project: {
    list:          ()  => get('/api/project/list'),
    save:          a   => post('/api/project/save', a),
    load:          n   => get(`/api/project/load/${encodeURIComponent(n)}`),
    exportAsBlock: a   => post('/api/project/export-as-block', a),
    listUserBlocks:()  => get('/api/project/user-blocks'),
  },
  yosys: { synth: a => post('/api/yosys/synth', a) },
  sim:   { run:   a => post('/api/sim/run', a) },
  atpg:  { run:   a => post('/api/atpg/run', a) },   // ← new
  dialog:{ openFolder: () => Promise.resolve(null) },
};

if (typeof window !== 'undefined' && !window.api) {
  window.api = httpApi;
  console.info('[VBiDE] web/Docker mode — HTTP API active');
}
export default httpApi;
