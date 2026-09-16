const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pdk: {
    list:          ()  => ipcRenderer.invoke('pdk:list'),
    cellsManifest: id  => ipcRenderer.invoke('pdk:cells-manifest', id),
    validatePath:  a   => ipcRenderer.invoke('pdk:validate-path', a),
    readLib:       a   => ipcRenderer.invoke('pdk:read-lib', a),
  },
  prefs: {
    get: ()  => ipcRenderer.invoke('prefs:get'),
    set: p   => ipcRenderer.invoke('prefs:set', p),
  },
  project: {
    list:           ()  => ipcRenderer.invoke('project:list'),
    save:           a   => ipcRenderer.invoke('project:save', a),
    load:           n   => ipcRenderer.invoke('project:load', n),
    exportAsBlock:  a   => ipcRenderer.invoke('project:export-as-block', a),
    listUserBlocks: ()  => ipcRenderer.invoke('project:list-user-blocks'),
  },
  yosys: { synth: a => ipcRenderer.invoke('yosys:synth', a) },
  sim:   { run:   a => ipcRenderer.invoke('sim:run',     a) },
  atpg:  { run:   a => ipcRenderer.invoke('atpg:run',    a) },
  dialog:{ openFolder: () => ipcRenderer.invoke('dialog:open-folder') },
});
