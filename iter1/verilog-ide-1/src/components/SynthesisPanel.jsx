import React, { useMemo } from 'react';
import useStore from '../store/graphStore.js';
export default function SynthesisPanel(){
  const out=useStore(s=>s.synthesisOutput),running=useStore(s=>s.synthesisRunning),errors=useStore(s=>s.errors);
  const stats=useMemo(()=>{
    if(!out)return null;
    const cells={};let inS=false;
    out.split('\n').forEach(l=>{if(l.includes('Number of cells:'))inS=true;if(inS){const m=l.match(/^\s+(sky130\S+|gf180\S+|\$\w+)\s+(\d+)/);if(m)cells[m[1]]=parseInt(m[2]);}});
    const wires=out.match(/Number of wires:\s+(\d+)/)?.[1],total=out.match(/Number of cells:\s+(\d+)/)?.[1];
    return Object.keys(cells).length?{cells,wires,total}:null;
  },[out]);
  const isErr=out?.includes('ERROR'),isDone=out?.includes('End of script')||out?.includes('stat');
  return(<div style={{width:420,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>
    <div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',display:'flex',alignItems:'center',gap:8}}>
      <span style={{color:'#c084fc',fontSize:12,fontWeight:600}}>⚛ Yosys Synthesis</span>
      {running&&<span style={{color:'#7c3aed',fontSize:10,animation:'pulse 1s infinite'}}>running...</span>}
      {isDone&&!running&&<span style={{color:'#4ade80',fontSize:10}}>✓ done</span>}
      {isErr&&<span style={{color:'#f87171',fontSize:10}}>✗ error</span>}
    </div>
    {errors.length>0&&<div style={{borderBottom:'1px solid #1a0505',background:'#0d0505'}}>{errors.map((e,i)=><div key={i} style={{color:'#f87171',fontSize:11,padding:'5px 14px'}}>⚠ {e.message||e}</div>)}</div>}
    {stats&&<div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',background:'#0a0e18'}}>
      <div style={{color:'#334155',fontSize:9.5,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Design Stats</div>
      <div style={{display:'flex',gap:16,marginBottom:8}}>
        {stats.total&&<div><div style={{color:'#334155',fontSize:9}}>Total cells</div><div style={{color:'#c084fc',fontSize:18,fontWeight:700}}>{stats.total}</div></div>}
        {stats.wires&&<div><div style={{color:'#334155',fontSize:9}}>Wires</div><div style={{color:'#60a5fa',fontSize:18,fontWeight:700}}>{stats.wires}</div></div>}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {Object.entries(stats.cells).map(([cell,count])=><div key={cell} style={{background:'#111827',border:'1px solid #1e2733',borderRadius:4,padding:'2px 8px',fontSize:9.5,color:'#475569'}}><span style={{color:'#334155'}}>{cell.split('__').pop()}</span><span style={{color:'#c084fc',marginLeft:5}}>×{count}</span></div>)}
      </div>
    </div>}
    <pre style={{flex:1,margin:0,padding:'10px 14px',overflowY:'auto',fontSize:10,lineHeight:1.75,color:isErr?'#7f1d1d':'#334155',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
      {running?'⟳ Synthesising...\n\nMake sure yosys is in PATH.\nIn Docker: it is pre-installed.':out||'Click ⚛ Yosys in the toolbar to synthesise the current design.'}
    </pre>
  </div>);
}
