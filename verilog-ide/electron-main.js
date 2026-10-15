const{app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('path');
const fs=require('fs');
const{spawn}=require('child_process');
const{runSimulation}=require('./server/simRunner.js');
const{runSynthesis}=require('./server/synthRunner.js');
const{findLiberty,findFile}=require('./server/pdkFiles.js');
const{safeId,safeName,projectDir,resolveInside,insideAnyRoot,sanitizePrefs}=require('./server/pathSafe.js');

const isDev=!app.isPackaged;
let win;

function createWindow(){
  win=new BrowserWindow({
    width:1500,height:920,minWidth:1100,minHeight:650,
    webPreferences:{nodeIntegration:false,contextIsolation:true,preload:path.join(__dirname,'preload.js')},
    titleBarStyle:'hiddenInset',backgroundColor:'#0d1117',show:false,title:'VerilogBlocks IDE',
  });
  win.loadURL(isDev?'http://localhost:5173':`file://${path.join(__dirname,'dist/index.html')}`);
  win.once('ready-to-show',()=>win.show());
  if(isDev)win.webContents.openDevTools({mode:'detach'});
}

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});

const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const writeJSON=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2));
const exists=p=>{try{return fs.existsSync(p);}catch{return false;}};

const PREFS=path.join(app.getPath('userData'),'vbide-prefs.json');
const loadPrefs=()=>{try{return readJSON(PREFS);}catch{return{};}};
const savePrefs=p=>{fs.mkdirSync(path.dirname(PREFS),{recursive:true});writeJSON(PREFS,p);};

// ── PDK ──────────────────────────────────────────────────────────────────────
ipcMain.handle('pdk:list',async()=>readJSON(path.join(__dirname,'pdk','pdk-registry.json')));
ipcMain.handle('pdk:cells-manifest',async(_,id)=>{
  const p=resolveInside(path.join(__dirname,'pdk'),safeId(id,'PDK id'),'cells-manifest.json');
  return exists(p)?readJSON(p):null;
});
ipcMain.handle('pdk:validate-path',async(_,{pdkId,rootPath})=>{
  if(typeof rootPath!=='string'||!rootPath||!exists(rootPath))return{ok:false,error:'Path does not exist'};
  try{if(!fs.statSync(rootPath).isDirectory())return{ok:false,error:'Path is not a folder'};}catch{return{ok:false,error:'Path does not exist'};}
  const expected={sky130:['sky130_fd_sc_hd.v','sky130_fd_sc_hd__tt_025C_1v80.lib'],gf180:['gf180mcu_fd_sc_mcu7t5v0.v','gf180mcu_fd_sc_mcu7t5v0__tt_025C_3v3.lib'],ihp130:['sg13g2_stdcell.v']};
  const found={};
  (expected[pdkId]||[]).forEach(f=>{const h=findFile(rootPath,f,4);if(h)found[f]=h;});
  return{ok:true,found,liberty:findLiberty(pdkId,rootPath)};
});
ipcMain.handle('pdk:read-lib',async(_,{libPath})=>{
  // Only Liberty files inside a configured PDK folder — never arbitrary files.
  if(typeof libPath!=='string'||!libPath.toLowerCase().endsWith('.lib'))return{ok:false,error:'Only Liberty (.lib) files can be read.'};
  const roots=[...Object.values(loadPrefs().pdkPaths||{}),process.env.SKY130_PDK_ROOT,process.env.GF180_PDK_ROOT,process.env.IHP130_PDK_ROOT];
  if(!insideAnyRoot(libPath,roots))return{ok:false,error:'That file is not inside a configured PDK folder.'};
  try{return{ok:true,content:fs.readFileSync(libPath,'utf8')};}catch(e){return{ok:false,error:e.message};}
});

// ── Prefs ────────────────────────────────────────────────────────────────────
ipcMain.handle('prefs:get',async()=>loadPrefs());
ipcMain.handle('prefs:set',async(_,p)=>{savePrefs({...loadPrefs(),...sanitizePrefs(p)});return true;});

// ── Projects ─────────────────────────────────────────────────────────────────
const PROJ=path.join(__dirname,'projects');
ipcMain.handle('project:list',async()=>{
  fs.mkdirSync(PROJ,{recursive:true});
  return fs.readdirSync(PROJ).filter(f=>{try{return fs.statSync(path.join(PROJ,f)).isDirectory();}catch{return false;}});
});
ipcMain.handle('project:save',async(_,{name,graph,verilog,testbench,meta})=>{
  const dir=projectDir(PROJ,name);fs.mkdirSync(dir,{recursive:true});
  writeJSON(path.join(dir,'graph.json'),graph);
  fs.writeFileSync(path.join(dir,'top.v'),verilog||'');
  if(testbench)fs.writeFileSync(path.join(dir,'top_tb.v'),testbench);
  if(meta)writeJSON(path.join(dir,'meta.json'),meta);
  return{ok:true};
});
ipcMain.handle('project:load',async(_,name)=>{
  const dir=projectDir(PROJ,name);
  const graphPath=path.join(dir,'graph.json');
  if(!exists(graphPath))throw new Error('Project not found');
  return{
    graph:readJSON(graphPath),
    verilog:exists(path.join(dir,'top.v'))?fs.readFileSync(path.join(dir,'top.v'),'utf8'):'',
    testbench:exists(path.join(dir,'top_tb.v'))?fs.readFileSync(path.join(dir,'top_tb.v'),'utf8'):'',
    meta:exists(path.join(dir,'meta.json'))?readJSON(path.join(dir,'meta.json')):{},
  };
});
ipcMain.handle('project:export-as-block',async(_,{name,blockMeta})=>{
  const dir=path.join(__dirname,'pdk','user-blocks');fs.mkdirSync(dir,{recursive:true});
  const topV=path.join(projectDir(PROJ,name),'top.v');
  const verilog=exists(topV)?fs.readFileSync(topV,'utf8'):'';
  writeJSON(resolveInside(dir,`${safeName(name,'block name')}.json`),{...blockMeta,verilogCode:verilog});
  return{ok:true};
});
ipcMain.handle('project:list-user-blocks',async()=>{
  const dir=path.join(__dirname,'pdk','user-blocks');fs.mkdirSync(dir,{recursive:true});
  return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>{try{return readJSON(path.join(dir,f));}catch{return null;}}).filter(Boolean);
});

// ── Yosys ────────────────────────────────────────────────────────────────────
ipcMain.handle('yosys:synth',async(_,{projectName,verilog,pdkRoot,pdkId})=>
  runSynthesis({projDir:projectDir(PROJ,projectName||'tmp'),outDir:path.join(__dirname,'synthesis','output'),verilog,pdkId,pdkRoot:pdkRoot||''}));

// ── Simulation (iverilog) ─────────────────────────────────────────────────────
ipcMain.handle('sim:run',async(_,{projectName,verilog,testbench})=>
  runSimulation({simDir:path.join(projectDir(PROJ,projectName||'tmp'),'sim'),verilog,testbench}));

// ── Dialog ───────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-folder',async()=>{
  const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});
  return r.canceled?null:r.filePaths[0];
});

// ── ATPG (atalanta) ───────────────────────────────────────────────────────────
ipcMain.handle('atpg:run',async(_,{projectName,verilog})=>new Promise(resolve=>{
  const projDir=projectDir(PROJ,projectName||'tmp_atpg');
  const atpgDir=path.join(__dirname,'atpg');
  fs.mkdirSync(projDir,{recursive:true});fs.mkdirSync(atpgDir,{recursive:true});
  const topV=path.join(projDir,'top.v'),synthV=path.join(atpgDir,'top_atpg_synth.v'),
    benchF=path.join(atpgDir,'top.bench'),ysScript=path.join(atpgDir,'atpg_synth.ys');
  fs.writeFileSync(topV,verilog||'');
  fs.writeFileSync(ysScript,[
    `read_verilog -sv "${topV}"`,
    'hierarchy -top top','proc; opt','techmap; opt','clean',
    `write_verilog "${synthV}"`,`write_bench -top top "${benchF}"`,
  ].join('\n'));
  let ysOut='';
  const ys=spawn('yosys',['-s',ysScript]);
  ys.stdout.on('data',d=>{ysOut+=d;});ys.stderr.on('data',d=>{ysOut+=d;});
  ys.on('error',()=>resolve({ok:false,stage:'yosys',output:'ERROR: yosys not found in PATH.\nIn nix-shell: nix-shell then restart.'}));
  ys.on('close',ysCode=>{
    if(ysCode!==0||!exists(benchF))return resolve({ok:false,stage:'yosys',output:'Yosys bench export failed:\n'+ysOut});
    let atpgOut='';
    const at=spawn('atalanta',[benchF],{cwd:path.dirname(benchF)});   // it writes <name>.test into its cwd
    at.stdout.on('data',d=>{atpgOut+=d;});at.stderr.on('data',d=>{atpgOut+=d;});
    at.on('error',()=>resolve({ok:false,stage:'atalanta',output:'ERROR: atalanta not found.\nInstall from: https://github.com/CK-Explorer/atalanta'}));
    at.on('close',()=>{
      const lines=atpgOut.split('\n');let coverage=null,detected=null,total=null,vectors=0;
      const faults={detected:[],undetected:[],redundant:[]};
      for(const l of lines){
        const cm=l.match(/fault\s+coverage\s*[=:]\s*([\d.]+)%\s*\((\d+)\/(\d+)\)/i);
        if(cm){coverage=parseFloat(cm[1]);detected=parseInt(cm[2]);total=parseInt(cm[3]);}
        const vm=l.match(/(\d+)\s+(?:test\s+)?vectors?/i);if(vm)vectors=Math.max(vectors,parseInt(vm[1]));
        const dt=l.match(/^DT\s+(\S+)/i);if(dt)faults.detected.push(dt[1]);
        const un=l.match(/^UN\s+(\S+)/i);if(un)faults.undetected.push(un[1]);
        const re=l.match(/^RE\s+(\S+)/i);if(re)faults.redundant.push(re[1]);
      }
      resolve({ok:true,stage:'done',output:atpgOut,
        bench:exists(benchF)?fs.readFileSync(benchF,'utf8'):'',
        coverage,detected,total,vectors,faults});
    });
  });
}));
