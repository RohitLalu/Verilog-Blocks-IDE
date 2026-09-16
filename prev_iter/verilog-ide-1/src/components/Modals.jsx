// CustomBlockBuilder, HierarchyExporter, PDKSelector — exported from this file
import React, { useState, useMemo, useEffect } from 'react';
import useStore from '../store/graphStore.js';
import { exportAsBlock, generateVerilog } from '../codegen/graphToVerilog.js';

// ── CustomBlockBuilder ────────────────────────────────────────────────────────
const COLORS=['#a78bfa','#60a5fa','#4ade80','#f59e0b','#f472b6','#38bdf8','#fb923c','#34d399'];
export function CustomBlockBuilder() {
  const{setShowCustomBlockBuilder,customBlockDraft:d,setCustomBlockDraft,resetCustomBlockDraft,saveUserBlock,pushNotification}=useStore();
  const[step,setStep]=useState(0);
  const addIn=()=>setCustomBlockDraft({ports:{...d.ports,inputs:[...d.ports.inputs,{name:`I${d.ports.inputs.length}`,width:1}]}});
  const addOut=()=>setCustomBlockDraft({ports:{...d.ports,outputs:[...d.ports.outputs,{name:`O${d.ports.outputs.length}`,width:1}]}});
  const delIn=i=>setCustomBlockDraft({ports:{...d.ports,inputs:d.ports.inputs.filter((_,j)=>j!==i)}});
  const delOut=i=>setCustomBlockDraft({ports:{...d.ports,outputs:d.ports.outputs.filter((_,j)=>j!==i)}});
  const upPort=(dir,i,f,v)=>{const a=[...d.ports[dir]];a[i]={...a[i],[f]:f==='width'?parseInt(v)||1:v};setCustomBlockDraft({ports:{...d.ports,[dir]:a}});};
  const genStub=()=>{
    const ins=d.ports.inputs.map(p=>`    input  wire ${p.width>1?`[${p.width-1}:0] `:''}${p.name}`).join(',\n');
    const outs=d.ports.outputs.map(p=>`    output wire ${p.width>1?`[${p.width-1}:0] `:''}${p.name}`).join(',\n');
    setCustomBlockDraft({verilogCode:`module ${d.module||'my_block'} (\n${ins}${ins&&outs?',\n':''}${outs}\n);\n    // TODO: implement logic\nendmodule`});
    setStep(2);
  };
  const handleSave=()=>{
    if(!d.id||!d.label||!d.module){pushNotification('Fill in ID, Label, and Module name.','error');return;}
    saveUserBlock({...d,category:'custom',file:null,isCustom:true,timingHint:null});
    pushNotification(`Block "${d.label}" saved!`,'success');
    resetCustomBlockDraft();setShowCustomBlockBuilder(false);
  };
  const inp={background:'#0a0e18',border:'1px solid #1e2733',borderRadius:5,color:'#e2e8f0',fontSize:12,padding:'6px 10px',outline:'none',fontFamily:"'JetBrains Mono',monospace",width:'100%',boxSizing:'border-box'};
  return(
    <Modal title="✦ New Custom Block" onClose={()=>setShowCustomBlockBuilder(false)}>
      <div style={{display:'flex',borderBottom:'1px solid #1e2733',marginBottom:16}}>
        {['1. Meta','2. Ports','3. Code'].map((s,i)=><button key={s} onClick={()=>setStep(i)} style={{background:'transparent',border:'none',borderBottom:`2px solid ${step===i?'#a78bfa':'transparent'}`,color:step===i?'#a78bfa':'#334155',fontSize:12,padding:'4px 16px 8px',cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif"}}>{s}</button>)}
      </div>
      {step===0&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
        {[['Block ID','id','my_adder',true],['Display Label','label','My Adder',false],['Module Name','module','my_adder',true]].map(([l,k,ph,slug])=>
          <div key={k}><div style={{color:'#475569',fontSize:10.5,marginBottom:5}}>{l}</div><input value={d[k]} onChange={e=>setCustomBlockDraft({[k]:slug?e.target.value.replace(/\W/g,'_'):e.target.value})} placeholder={ph} style={inp}/></div>
        )}
        <div><div style={{color:'#475569',fontSize:10.5,marginBottom:5}}>Symbol (2–5 chars)</div><input value={d.symbol} onChange={e=>setCustomBlockDraft({symbol:e.target.value.slice(0,5).toUpperCase()})} placeholder="ADD" style={{...inp,width:80}}/></div>
        <div><div style={{color:'#475569',fontSize:10.5,marginBottom:5}}>Description</div><textarea value={d.description} onChange={e=>setCustomBlockDraft({description:e.target.value})} rows={2} style={{...inp,resize:'vertical',height:58,lineHeight:1.6}}/></div>
        <div><div style={{color:'#475569',fontSize:10.5,marginBottom:5}}>Color</div><div style={{display:'flex',gap:6}}>{COLORS.map(c=><div key={c} onClick={()=>setCustomBlockDraft({color:c})} style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:`2px solid ${d.color===c?'#fff':'transparent'}`}}/>)}</div></div>
      </div>}
      {step===1&&<div>
        {[['Inputs','inputs','#60a5fa',addIn,delIn],['Outputs','outputs','#4ade80',addOut,delOut]].map(([lbl,dir,col,add,del])=>(
          <div key={dir} style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{color:col,fontSize:11,fontWeight:600}}>{lbl} ({d.ports[dir].length})</span>
              <button onClick={add} style={{background:`${col}18`,border:`1px solid ${col}44`,borderRadius:4,color:col,fontSize:10,padding:'2px 8px',cursor:'pointer'}}>+ Add</button>
            </div>
            {d.ports[dir].map((p,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:6,alignItems:'center'}}>
              <input value={p.name} onChange={e=>upPort(dir,i,'name',e.target.value)} style={{...inp,flex:1}} placeholder="port_name"/>
              <span style={{color:'#334155',fontSize:11}}>w</span>
              <input type="number" min={1} max={64} value={p.width} onChange={e=>upPort(dir,i,'width',e.target.value)} style={{...inp,width:52}}/>
              <button onClick={()=>del(i)} style={{background:'transparent',border:'none',color:'#334155',cursor:'pointer',fontSize:14}}>×</button>
            </div>)}
          </div>
        ))}
        <button onClick={genStub} style={{background:'#0a1628',border:'1px solid #1e40af',borderRadius:6,color:'#60a5fa',fontSize:12,padding:'8px 16px',cursor:'pointer'}}>→ Auto-generate Verilog stub</button>
      </div>}
      {step===2&&<div>
        <div style={{color:'#475569',fontSize:11,marginBottom:8}}>Write the module implementation.</div>
        <textarea value={d.verilogCode} onChange={e=>setCustomBlockDraft({verilogCode:e.target.value})} style={{width:'100%',height:260,background:'#0a0e18',border:'1px solid #1e2733',borderRadius:6,color:'#94a3b8',fontSize:11,fontFamily:"'JetBrains Mono',monospace",padding:12,resize:'vertical',outline:'none',boxSizing:'border-box',lineHeight:1.8}} placeholder={`module ${d.module||'my_block'} (...);\n    assign out = a & b;\nendmodule`}/>
      </div>}
      <div style={{display:'flex',justifyContent:'space-between',marginTop:16}}>
        <div style={{display:'flex',gap:8}}>{step>0&&<GhostBtn onClick={()=>setStep(s=>s-1)}>← Back</GhostBtn>}{step<2&&<GhostBtn onClick={()=>setStep(s=>s+1)}>Next →</GhostBtn>}</div>
        <button onClick={handleSave} style={{background:'#a78bfa',border:'none',borderRadius:6,color:'#0d0d0d',fontSize:13,fontWeight:700,padding:'8px 22px',cursor:'pointer'}}>Save Block</button>
      </div>
    </Modal>
  );
}

// ── HierarchyExporter ─────────────────────────────────────────────────────────
export function HierarchyExporter() {
  const{nodes,edges,projectName,setShowHierarchyExporter,saveUserBlock,pushNotification,pdkContext}=useStore();
  const[label,setLabel]=useState(projectName);const[desc,setDesc]=useState('');const[color,setColor]=useState('#818cf8');const[saved,setSaved]=useState(false);
  const blockDef=useMemo(()=>nodes.length?exportAsBlock(nodes,edges,{blockId:projectName.replace(/\W/g,'_'),label,description:desc,color}):null,[nodes,edges,projectName,label,desc,color]);
  const handleExport=async()=>{
    if(!blockDef)return;
    const{verilog}=generateVerilog(nodes,edges,projectName,pdkContext);
    const fullBlock={...blockDef,verilogCode:verilog,isHierarchical:true,sourceProject:projectName};
    saveUserBlock(fullBlock);
    if(window.api)await window.api.project.exportAsBlock({name:projectName,blockMeta:fullBlock}).catch(()=>{});
    setSaved(true);pushNotification(`"${label}" exported to library!`,'success');
    setTimeout(()=>setShowHierarchyExporter(false),1500);
  };
  return(
    <Modal title="⬡ Export as Hierarchy Block" onClose={()=>setShowHierarchyExporter(false)} width={520}>
      <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:16}}>
        <F label="Block Label"><input value={label} onChange={e=>setLabel(e.target.value)} style={iStyle}/></F>
        <F label="Description"><textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} style={{...iStyle,resize:'vertical',height:58,lineHeight:1.6}}/></F>
        <F label="Color"><div style={{display:'flex',gap:6}}>{COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:`2px solid ${color===c?'#fff':'transparent'}`}}/>)}</div></F>
      </div>
      {blockDef&&<div style={{background:'#0a0e18',border:`1px solid ${color}33`,borderRadius:8,padding:14,marginBottom:16}}>
        <div style={{color:'#334155',fontSize:9.5,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Derived Interface</div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <span style={{background:color,color:'#000',fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:4}}>{blockDef.symbol}</span>
          <span style={{color:'#e2e8f0',fontSize:13,fontWeight:600}}>{label||blockDef.label}</span>
        </div>
        <div style={{display:'flex',gap:20}}>
          {[['INPUTS','#60a5fa',blockDef.ports.inputs],['OUTPUTS','#4ade80',blockDef.ports.outputs]].map(([lbl,c,ps])=><div key={lbl}><div style={{color:c,fontSize:9.5,marginBottom:5}}>{lbl}</div>{ps.map(p=><div key={p.name} style={{color:'#475569',fontSize:10.5,fontFamily:"'JetBrains Mono',monospace",marginBottom:2}}>{p.width>1?`[${p.width-1}:0] `:''}{p.name}</div>)}{!ps.length&&<div style={{color:'#1e2733',fontSize:10}}>none</div>}</div>)}
        </div>
      </div>}
      {!nodes.length&&<div style={{color:'#334155',fontSize:12,textAlign:'center',padding:20}}>Add blocks to workspace first.</div>}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
        <GhostBtn onClick={()=>setShowHierarchyExporter(false)}>Cancel</GhostBtn>
        <button onClick={handleExport} disabled={!nodes.length||saved} style={{background:saved?'#0a2218':'#818cf8',border:saved?'1px solid #166534':'none',borderRadius:6,color:saved?'#4ade80':'#0d0d0d',fontSize:13,fontWeight:700,padding:'8px 22px',cursor:!nodes.length||saved?'default':'pointer',opacity:!nodes.length?.4:1}}>{saved?'✓ Exported!':'Export to Library'}</button>
      </div>
    </Modal>
  );
}

// ── PDKSelector ───────────────────────────────────────────────────────────────
const FALLBACK = [
  {id:'sky130',name:'SkyWater SKY130',process:'130nm',color:'#38bdf8',enabled:true,description:'Open-source 130nm CMOS. Industry standard.',downloadUrl:'https://github.com/google/skywater-pdk'},
  {id:'gf180',name:'GF180MCU',process:'180nm',color:'#fb923c',enabled:false,description:'GlobalFoundries 180nm open PDK.',downloadUrl:'https://github.com/google/gf180mcu-pdk'},
  {id:'ihp130',name:'IHP SG13G2',process:'130nm BiCMOS',color:'#a78bfa',enabled:false,description:'IHP open-source BiCMOS PDK.',downloadUrl:'https://github.com/IHP-GmbH/IHP-Open-PDK'},
  {id:'asap7',name:'ASAP7 (academic)',process:'7nm predictive',color:'#4ade80',enabled:false,description:'Predictive 7nm FinFET — academic only.',downloadUrl:'https://github.com/The-OpenROAD-Project/asap7'},
];
export function PDKSelector({ onComplete }) {
  const{selectedPDK,setSelectedPDK,setProjectName,projectName,nodes}=useStore();
  const[reg,setReg]=useState(FALLBACK);const[picked,setPicked]=useState(selectedPDK?.id||'sky130');
  const[paths,setPaths]=useState({});const[val,setVal]=useState({});const[checking,setChecking]=useState({});
  const[projName,setProjName]=useState(projectName||'my_project');const[loading,setLoading]=useState(false);
  useEffect(()=>{
    async function init(){
      if(window.api){
        const r=await window.api.pdk.list().catch(()=>FALLBACK);setReg(r);
        const prefs=await window.api.prefs.get().catch(()=>({}));
        const saved=prefs.pdkPaths||{};
        // Pre-fill from env-detected paths (server sets detectedPath)
        const merged={...saved};
        r.forEach(p=>{if(p.detectedPath&&!merged[p.id])merged[p.id]=p.detectedPath;});
        setPaths(merged);
      }
    }
    init();
  },[]);
  const handleValidate=async(pdkId,path)=>{
    if(!window.api||!path)return;
    setChecking(c=>({...c,[pdkId]:true}));
    const res=await window.api.pdk.validatePath({pdkId,rootPath:path});
    setChecking(c=>({...c,[pdkId]:false}));setVal(v=>({...v,[pdkId]:res}));
  };
  const handleConfirm=async()=>{
    if(!picked)return;setLoading(true);
    const entry=reg.find(r=>r.id===picked);
    if(window.api)await window.api.prefs.set({pdkPaths:paths,lastPDK:picked}).catch(()=>{});
    setSelectedPDK({...entry,rootPath:paths[picked]||''});
    setProjectName(projName);setLoading(false);onComplete?.();
  };
  const isLocked=nodes.length>0;
  return(
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,fontFamily:"'Space Grotesk',sans-serif"}}>
      <div style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:12,width:680,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,.6)'}}>
        <div style={{padding:'20px 24px 16px',borderBottom:'1px solid #1e2733'}}>
          <div style={{color:'#e2e8f0',fontSize:18,fontWeight:700}}>{isLocked?'⚙ PDK Settings':'⬡ New Project — Select PDK'}</div>
          <div style={{color:'#475569',fontSize:12,marginTop:4}}>PDK is locked once blocks are placed.</div>
        </div>
        <div style={{overflowY:'auto',flex:1,padding:24,display:'flex',flexDirection:'column',gap:16}}>
          <F label="Project Name"><input value={projName} onChange={e=>setProjName(e.target.value.replace(/[^a-zA-Z0-9_]/g,'_'))} style={{...iStyle,fontFamily:"'JetBrains Mono',monospace"}} placeholder="my_design"/></F>
          <div>
            <div style={{color:'#475569',fontSize:10.5,marginBottom:10}}>Process Design Kit</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {reg.map(pdk=>(
                <div key={pdk.id} onClick={()=>!isLocked&&pdk.enabled&&setPicked(pdk.id)}
                  style={{border:`1px solid ${picked===pdk.id?pdk.color:'#1e2733'}`,borderRadius:8,background:picked===pdk.id?`${pdk.color}11`:'#0d1117',padding:'12px 14px',cursor:isLocked?'not-allowed':pdk.enabled?'pointer':'default',opacity:isLocked&&selectedPDK?.id!==pdk.id?.4:pdk.enabled?1:.55,transition:'all .15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:pdk.color,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{color:'#e2e8f0',fontSize:13,fontWeight:600}}>{pdk.name}</span>
                        <span style={{color:pdk.color,fontSize:10,background:`${pdk.color}22`,padding:'1px 6px',borderRadius:3}}>{pdk.process}</span>
                        {!pdk.enabled&&<span style={{color:'#475569',fontSize:10}}>(disabled) — <a href={pdk.downloadUrl} target="_blank" rel="noreferrer" style={{color:'#3b82f6',textDecoration:'none'}} onClick={e=>e.stopPropagation()}>Download ↗</a></span>}
                      </div>
                      <div style={{color:'#475569',fontSize:11,marginTop:2}}>{pdk.description}</div>
                    </div>
                  </div>
                  {picked===pdk.id&&pdk.enabled&&(
                    <div onClick={e=>e.stopPropagation()} style={{marginTop:10,paddingTop:10,borderTop:'1px solid #1e2733'}}>
                      <div style={{color:'#475569',fontSize:10,marginBottom:6}}>PDK root directory (container path):</div>
                      <div style={{display:'flex',gap:6}}>
                        <input value={paths[pdk.id]||''} onChange={e=>setPaths(p=>({...p,[pdk.id]:e.target.value}))} placeholder="/pdk/sky130/versions/..." style={{flex:1,background:'#0d1117',border:'1px solid #2d3748',borderRadius:4,color:'#e2e8f0',fontSize:11,padding:'5px 8px',fontFamily:"'JetBrains Mono',monospace",outline:'none'}}/>
                        <button onClick={()=>handleValidate(pdk.id,paths[pdk.id])} style={{background:'#1e3a5f',border:'1px solid #3b82f6',borderRadius:4,color:'#60a5fa',fontSize:11,padding:'5px 10px',cursor:'pointer'}}>Validate</button>
                      </div>
                      {checking[pdk.id]&&<div style={{color:'#475569',fontSize:11,marginTop:5}}>Checking...</div>}
                      {val[pdk.id]&&<div style={{color:val[pdk.id].ok?'#4ade80':'#f87171',fontSize:11,marginTop:5,fontFamily:"'JetBrains Mono',monospace"}}>{val[pdk.id].ok?'✓ Found':'✗ Not found'}</div>}
                      <div style={{color:'#334155',fontSize:10,marginTop:6,fontFamily:"'JetBrains Mono',monospace"}}>In Docker: /pdk/sky130/versions/0fe599b2…</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{padding:'16px 24px',borderTop:'1px solid #1e2733',display:'flex',justifyContent:'flex-end',gap:10}}>
          {isLocked&&<GhostBtn onClick={onComplete}>Cancel</GhostBtn>}
          <button onClick={handleConfirm} disabled={loading||!picked} style={{background:'#3b82f6',border:'none',borderRadius:6,color:'#fff',fontSize:13,fontWeight:600,padding:'8px 24px',cursor:loading?'wait':'pointer',opacity:loading?.7:1}}>
            {loading?'Loading PDK…':isLocked?'Apply':'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=580 }) {
  return(
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,fontFamily:"'Space Grotesk',sans-serif"}}>
      <div style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:12,width,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,.6)'}}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid #1e2733',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'#a78bfa',fontSize:15,fontWeight:700}}>{title}</span>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'#334155',cursor:'pointer',fontSize:18}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:22}}>{children}</div>
      </div>
    </div>
  );
}
function F({ label, children }) { return <div><div style={{color:'#475569',fontSize:10.5,marginBottom:5}}>{label}</div>{children}</div>; }
function GhostBtn({ onClick, children }) { return <button onClick={onClick} style={{background:'transparent',border:'1px solid #1e2733',borderRadius:6,color:'#475569',fontSize:12,padding:'6px 14px',cursor:'pointer'}}>{children}</button>; }
const iStyle={background:'#0a0e18',border:'1px solid #1e2733',borderRadius:5,color:'#e2e8f0',fontSize:12,padding:'6px 10px',outline:'none',width:'100%',boxSizing:'border-box'};
