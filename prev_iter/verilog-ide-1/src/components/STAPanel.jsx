import React, { useState } from 'react';
import useStore from '../store/graphStore.js';
import { runSTA } from '../simulator/TimingEngine.js';
export default function STAPanel(){
  const{nodes,edges,pdkContext}=useStore();
  const[cp,setCp]=useState(10);const[id,setId]=useState(0);const[od,setOd]=useState(0);const[res,setRes]=useState(null);const[run,setRun]=useState(false);
  const go=()=>{if(!nodes.length)return;setRun(true);try{setRes(runSTA(nodes,edges,pdkContext,{clockPeriod:cp,inputDelay:id,outputDelay:od}));}catch(e){console.error(e);}setRun(false);};
  const sc=s=>s<0?'#f87171':s<cp*.1?'#fbbf24':'#4ade80';
  const inp=(val,set,min=0)=><div style={{display:'flex',alignItems:'center',gap:4}}><input type="number" min={min} step={.5} value={val} onChange={e=>set(parseFloat(e.target.value)||0)} style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#94a3b8',fontSize:11,padding:'3px 6px',width:58,fontFamily:"'JetBrains Mono',monospace",outline:'none'}}/><span style={{color:'#334155',fontSize:10}}>ns</span></div>;
  return(<div style={{width:400,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'Space Grotesk',sans-serif",flexShrink:0}}>
    <div style={{padding:'12px 14px',borderBottom:'1px solid #1e2733'}}>
      <div style={{color:'#38bdf8',fontSize:13,fontWeight:700,marginBottom:10}}>◈ Static Timing Analysis</div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:10}}>
        {[['Clock period',cp,setCp,.1],['Input delay',id,setId,0],['Output delay',od,setOd,0]].map(([l,v,s,m])=><div key={l}><div style={{color:'#334155',fontSize:9.5,marginBottom:3}}>{l}</div>{inp(v,s,m)}</div>)}
      </div>
      <button onClick={go} disabled={run||!nodes.length} style={{background:'#0a1628',border:'1px solid #1e40af',borderRadius:6,color:'#60a5fa',fontSize:12,fontWeight:600,padding:'6px 16px',cursor:!nodes.length?'not-allowed':'pointer',opacity:!nodes.length?.4:1}}>{run?'⟳ Analysing…':'▶ Run STA'}</button>
    </div>
    <div style={{flex:1,overflowY:'auto'}}>
      {!res&&<div style={{color:'#1e2733',fontSize:12,padding:20,textAlign:'center'}}>Configure constraints and click Run STA.</div>}
      {res&&<>
        <div style={{padding:'12px 14px',borderBottom:'1px solid #1e2733',display:'flex',gap:16,flexWrap:'wrap'}}>
          {[['Clock',`${res.clockPeriod}ns`,'#38bdf8'],['Critical slack',`${res.criticalSlack}ns`,sc(res.criticalSlack)],res.maxFrequencyMHz&&['Max freq',`${res.maxFrequencyMHz}MHz`,'#a78bfa'],['Violations',res.violations.length,res.violations.length>0?'#f87171':'#4ade80']].filter(Boolean).map(([l,v,c])=><div key={l}><div style={{color:'#334155',fontSize:9}}>{l}</div><div style={{color:c,fontSize:17,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div></div>)}
        </div>
        {res.violations.length>0&&<div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',background:'#1c0505'}}>
          <div style={{color:'#f87171',fontSize:10,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Setup Violations ({res.violations.length})</div>
          {res.violations.slice(0,8).map(v=><div key={v.netId} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{color:'#7f1d1d',fontSize:10.5,fontFamily:"'JetBrains Mono',monospace"}}>{v.netId}</span><span style={{color:'#f87171',fontSize:10.5,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v.slack}ns</span></div>)}
        </div>}
        {res.criticalPath.length>0&&<div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733'}}>
          <div style={{color:'#334155',fontSize:10,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Critical Path ({res.criticalPath.length} stages)</div>
          <div style={{position:'relative',paddingLeft:14}}>
            <div style={{position:'absolute',left:5,top:0,bottom:0,width:1,background:'#1e2733'}}/>
            {res.criticalPath.map((s,i)=><div key={i} style={{marginBottom:8,position:'relative'}}>
              <div style={{position:'absolute',left:-11,top:4,width:7,height:7,borderRadius:'50%',background:sc(s.slack)}}/>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{color:'#94a3b8',fontSize:10.5,fontFamily:"'JetBrains Mono',monospace"}}>{s.netId}</span>
                <div style={{display:'flex',gap:8,flexShrink:0}}>
                  <span style={{color:'#60a5fa',fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>+{s.arrival}ns</span>
                  <span style={{color:sc(s.slack),fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>slack={s.slack}</span>
                </div>
              </div>
              {s.fromCell&&<div style={{color:'#334155',fontSize:9.5}}>via {s.fromCell} (+{s.delay}ns)</div>}
            </div>)}
          </div>
        </div>}
      </>}
    </div>
  </div>);
}
