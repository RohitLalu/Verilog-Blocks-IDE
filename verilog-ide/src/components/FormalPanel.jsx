import React,{useEffect,useState}from'react';
import useStore from'../store/graphStore.js';
import{generateVerilog}from'../codegen/graphToVerilog.js';
import{generateFormalProps}from'../codegen/formalTemplate.js';
import ExplainButton from'./ExplainButton.jsx';

// Formal verification with SymbiYosys: the student writes properties (assert / assume) in a module that wraps the
// design; "prove" checks them for every input sequence, "bounded" checks the first N steps. A failure opens as a waveform.
const STATUS_COLOR={PASS:'#4ade80',FAIL:'#f87171',UNKNOWN:'#fbbf24',ERROR:'#f87171',TIMEOUT:'#fbbf24'};
const STATUS_TEXT={PASS:'Proved: the properties always hold',FAIL:'Failed: a counterexample was found',
  UNKNOWN:'Not decided: the proof did not close (try a bounded check, or add assumptions)',ERROR:'Did not run',TIMEOUT:'Timed out'};

export default function FormalPanel(){
  const{nodes,edges,projectName,pdkContext,formalProps,setFormalProps,formalResult,setFormalResult,setLastVCD,setActivePanel,setShowTools,pushNotification}=useStore();
  const[mode,setMode]=useState('prove');const[depth,setDepth]=useState(20);const[running,setRunning]=useState(false);
  useEffect(()=>{if(!formalProps&&nodes.length)setFormalProps(generateFormalProps(nodes,edges));},[]);
  const hasAssert=/^\s*assert\s*\(/m.test((formalProps||'').replace(/\/\/.*$/gm,''));

  const runCheck=async()=>{
    if(!window.api?.formal){pushNotification('Formal checks run in the desktop app or the Docker server.','error');return;}
    setRunning(true);setFormalResult(null);
    try{
      const verilog=generateVerilog(nodes,edges,projectName,pdkContext).verilog;
      const r=await window.api.formal.run({projectName,verilog,props:formalProps,mode,depth});
      setFormalResult(r);pushNotification(`Formal (${mode}): ${r.status}`,r.ok?'success':'error');
    }catch(e){setFormalResult({ok:false,status:'ERROR',output:String(e.message||e)});}
    setRunning(false);
  };
  const openTrace=()=>{setLastVCD(formalResult.vcd);setActivePanel('simulator');};

  return(
    <div style={{width:440,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'Space Grotesk',sans-serif",flexShrink:0}}>
      <div style={{padding:'12px 14px',borderBottom:'1px solid #1e2733'}}>
        <div style={{color:'#a78bfa',fontSize:13,fontWeight:700,marginBottom:6}}>⊨ Formal verification <span style={{color:'#475569',fontWeight:400,fontSize:11}}>SymbiYosys</span></div>
        <div style={{color:'#64748b',fontSize:11,lineHeight:1.6,marginBottom:10}}>
          Simulation tries the inputs you pick; a formal check tries <b style={{color:'#cbd5e1'}}>all</b> of them. Write what must always be
          true as <code style={{color:'#facc15'}}>assert(...)</code> below, then run.
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <select value={mode} onChange={e=>setMode(e.target.value)} aria-label="Check" style={S.select}>
            <option value="prove">Prove (all cases)</option><option value="bmc">Bounded check (first N steps)</option></select>
          <label style={{color:'#64748b',fontSize:11,display:'flex',gap:5,alignItems:'center'}}>depth
            <input type="number" min={1} max={200} value={depth} onChange={e=>setDepth(parseInt(e.target.value,10)||20)} style={{...S.select,width:56}}/></label>
          <button onClick={runCheck} disabled={running||!formalProps} style={{...S.run,opacity:running?0.6:1}}>{running?'⟳ Checking…':'▶ Run'}</button>
          <button onClick={()=>setFormalProps(generateFormalProps(nodes,edges))} title="Replace with a fresh template for the current ports" style={S.ghost}>Regenerate</button>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:14}}>
        {!hasAssert&&formalProps&&<div style={S.warn}>No <code>assert</code> yet: write at least one, or the check has nothing to prove.</div>}
        <textarea value={formalProps} onChange={e=>setFormalProps(e.target.value)} spellCheck={false} aria-label="Formal properties (SystemVerilog)"
          style={{width:'100%',height:280,background:'#0a0e18',border:'1px solid #1e2733',borderRadius:6,color:'#94a3b8',fontSize:10.5,
            fontFamily:"'JetBrains Mono',monospace",padding:12,resize:'vertical',outline:'none',boxSizing:'border-box',lineHeight:1.7}}/>
        {formalResult&&<div style={{marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
            <span style={{color:STATUS_COLOR[formalResult.status]||'#94a3b8',fontSize:12.5,fontWeight:700}}>{formalResult.status}</span>
            <span style={{color:'#94a3b8',fontSize:11.5}}>{STATUS_TEXT[formalResult.status]||''}</span>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap'}}>
            {formalResult.vcd&&<button onClick={openTrace} style={S.run}>〰 Open the counterexample</button>}
            <ExplainButton prompt={formalResult.ok?'Explain what my formal check proved, and what properties I could add next.'
              :'My formal check did not pass. Explain the result and the counterexample, and whether my design or my property is wrong.'}/>
            {/not found/.test(formalResult.output||'')&&<button onClick={()=>setShowTools(true)} style={S.ghost}>⚙ Tools</button>}
          </div>
          <pre style={{background:'#0a0e18',border:'1px solid #1e2733',borderRadius:6,padding:10,margin:0,fontSize:10,lineHeight:1.6,color:'#64748b',
            whiteSpace:'pre-wrap',wordBreak:'break-word',fontFamily:"'JetBrains Mono',monospace",maxHeight:240,overflowY:'auto'}}>{(formalResult.output||'').slice(-4000)}</pre>
        </div>}
      </div>
    </div>
  );
}

const S={
  select:{background:'#161b27',border:'1px solid #1e2733',borderRadius:5,color:'#94a3b8',fontSize:11,padding:'4px 6px'},
  run:{background:'#160f2e',border:'1px solid #5b21b6',borderRadius:6,color:'#c4b5fd',fontSize:11.5,fontWeight:600,padding:'5px 12px',cursor:'pointer'},
  ghost:{background:'#161b27',border:'1px solid #1e2733',borderRadius:6,color:'#64748b',fontSize:11,padding:'5px 10px',cursor:'pointer'},
  warn:{background:'#1c1508',border:'1px solid #92400e',borderRadius:6,color:'#fde68a',fontSize:11,padding:'6px 10px',marginBottom:8},
};
