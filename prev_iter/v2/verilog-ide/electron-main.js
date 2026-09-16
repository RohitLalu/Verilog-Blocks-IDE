const{app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('path');
const fs=require('fs');
const{spawn}=require('child_process');

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

function findFile(dir,name,depth=3){
  if(depth<0||!exists(dir))return null;
  try{
    for(const e of fs.readdirSync(dir)){
      const full=path.join(dir,e);
      if(e===name)return full;
      try{if(fs.statSync(full).isDirectory()){const r=findFile(full,name,depth-1);if(r)return r;}}catch{}
    }
  }catch{}
  return null;
}

// ── PDK ──────────────────────────────────────────────────────────────────────
ipcMain.handle('pdk:list',async()=>readJSON(path.join(__dirname,'pdk','pdk-registry.json')));
ipcMain.handle('pdk:cells-manifest',async(_,id)=>{
  const p=path.join(__dirname,'pdk',id,'cells-manifest.json');
  return exists(p)?readJSON(p):null;
});
ipcMain.handle('pdk:validate-path',async(_,{pdkId,rootPath})=>{
  if(!exists(rootPath))return{ok:false,error:'Path does not exist'};
  const expected={sky130:['sky130_fd_sc_hd.v','sky130_fd_sc_hd__tt_025C_1v80.lib'],gf180:['gf180mcu_fd_sc_mcu7t5v0.v','gf180mcu_fd_sc_mcu7t5v0__tt_025C_3v3.lib'],ihp130:['sg13g2_stdcell.v']};
  const found={};
  (expected[pdkId]||[]).forEach(f=>{const h=findFile(rootPath,f,4);if(h)found[f]=h;});
  return{ok:true,found};
});
ipcMain.handle('pdk:read-lib',async(_,{libPath})=>{
  if(!exists(libPath))return{ok:false,error:'Not found'};
  try{return{ok:true,content:fs.readFileSync(libPath,'utf8')};}catch(e){return{ok:false,error:e.message};}
});

// ── Prefs ────────────────────────────────────────────────────────────────────
ipcMain.handle('prefs:get',async()=>loadPrefs());
ipcMain.handle('prefs:set',async(_,p)=>{savePrefs({...loadPrefs(),...p});return true;});

// ── Projects ─────────────────────────────────────────────────────────────────
const PROJ=path.join(__dirname,'projects');
ipcMain.handle('project:list',async()=>{
  fs.mkdirSync(PROJ,{recursive:true});
  return fs.readdirSync(PROJ).filter(f=>{try{return fs.statSync(path.join(PROJ,f)).isDirectory();}catch{return false;}});
});
ipcMain.handle('project:save',async(_,{name,graph,verilog,testbench,meta})=>{
  const dir=path.join(PROJ,name);fs.mkdirSync(dir,{recursive:true});
  writeJSON(path.join(dir,'graph.json'),graph);
  fs.writeFileSync(path.join(dir,'top.v'),verilog||'');
  if(testbench)fs.writeFileSync(path.join(dir,'top_tb.v'),testbench);
  if(meta)writeJSON(path.join(dir,'meta.json'),meta);
  return{ok:true};
});
ipcMain.handle('project:load',async(_,name)=>{
  const dir=path.join(PROJ,name);
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
  const verilog=exists(path.join(PROJ,name,'top.v'))?fs.readFileSync(path.join(PROJ,name,'top.v'),'utf8'):'';
  writeJSON(path.join(dir,`${name}.json`),{...blockMeta,verilogCode:verilog});
  return{ok:true};
});
ipcMain.handle('project:list-user-blocks',async()=>{
  const dir=path.join(__dirname,'pdk','user-blocks');fs.mkdirSync(dir,{recursive:true});
  return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>{try{return readJSON(path.join(dir,f));}catch{return null;}}).filter(Boolean);
});

// ── Yosys ────────────────────────────────────────────────────────────────────
ipcMain.handle('yosys:synth',async(_,{projectName,verilog,pdkRoot,pdkId})=>new Promise(resolve=>{
  const projDir=path.join(PROJ,projectName||'tmp');fs.mkdirSync(projDir,{recursive:true});
  const outDir=path.join(__dirname,'synthesis','output');fs.mkdirSync(outDir,{recursive:true});
  const vPath=path.join(projDir,'top.v');
  fs.writeFileSync(vPath,verilog||'');
  let script=`read_verilog -sv "${vPath}"\n`;
  if(pdkRoot&&exists(pdkRoot))script+=`read_verilog -sv "${pdkRoot}"\n`;
  script+=['hierarchy -top top','proc; opt; fsm; opt; memory; opt',pdkId==='sky130'?'synth_sky130 -top top':pdkId==='gf180'?'synth -top top':'synth -top top',`write_verilog "${path.join(outDir,'top_synth.v')}"`,`write_json "${path.join(outDir,'top_synth.json')}"`,'stat'].join('\n');
  const sp=path.join(outDir,'synth.ys');
  fs.writeFileSync(sp,script);
  let out='';
  const proc=spawn('yosys',['-s',sp]);
  proc.stdout.on('data',d=>{out+=d;});proc.stderr.on('data',d=>{out+=d;});
  proc.on('close',code=>resolve({ok:code===0,output:out}));
  proc.on('error',()=>resolve({ok:false,output:'ERROR: yosys not found.\n\nIn nix-shell:\ncd ~/librelane && nix-shell\nthen: cd ~/verilog-ide && npm start\n\nOr use Docker — yosys is pre-installed there.'}));
}));

// ── Simulation (iverilog) ─────────────────────────────────────────────────────
ipcMain.handle('sim:run',async(_,{projectName,verilog,testbench})=>new Promise(resolve=>{
  const simDir=path.join(PROJ,projectName||'tmp','sim');fs.mkdirSync(simDir,{recursive:true});
  const top=path.join(simDir,'top.v'),tb=path.join(simDir,'top_tb.v'),out=path.join(simDir,'sim.out'),vcd=path.join(simDir,'wave.vcd');
  fs.writeFileSync(top,verilog||'');fs.writeFileSync(tb,testbench||'');
  let ce='';
  const iv=spawn('iverilog',['-g2012','-o',out,tb,top]);
  iv.stderr.on('data',d=>{ce+=d;});
  iv.on('error',()=>resolve({ok:false,output:'ERROR: iverilog not found.\nIn Docker, it is pre-installed.\nLocally: brew install icarus-verilog',vcd:null}));
  iv.on('close',code=>{
    if(code!==0)return resolve({ok:false,output:'Compile error:\n'+ce,vcd:null});
    let so='';
    const vvp=spawn('vvp',[out]);
    vvp.stdout.on('data',d=>{so+=d;});vvp.stderr.on('data',d=>{so+=d;});
    vvp.on('close',()=>resolve({ok:true,output:so,vcd:exists(vcd)?fs.readFileSync(vcd,'utf8'):null}));
    vvp.on('error',()=>resolve({ok:false,output:'ERROR: vvp not found.',vcd:null}));
  });
}));

// ── Dialog ───────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-folder',async()=>{
  const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});
  return r.canceled?null:r.filePaths[0];
});

// ── ATPG (atalanta) ───────────────────────────────────────────────────────────
ipcMain.handle('atpg:run',async(_,{projectName,verilog})=>new Promise(resolve=>{
  const projDir=path.join(__dirname,'projects',projectName||'tmp_atpg');
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
    const at=spawn('atalanta',[benchF]);
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
