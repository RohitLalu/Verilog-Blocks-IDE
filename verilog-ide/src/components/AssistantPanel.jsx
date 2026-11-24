import React,{useEffect,useRef,useState}from'react';
import useStore from'../store/graphStore.js';
import{generateVerilog}from'../codegen/graphToVerilog.js';
import{DEFAULT_MODEL,installedModels,pullModel,chat,buildMessages}from'../lib/ollama.js';

// Learning assistant: a small open-source model running locally in Ollama. The conversation lives only in this panel.
export default function AssistantPanel(){
  const{nodes,edges,projectName,pdkContext}=useStore();
  const[models,setModels]=useState(undefined);        // undefined = checking, null = Ollama not running
  const[model,setModel]=useState(DEFAULT_MODEL);
  const[pull,setPull]=useState(null);                 // {fraction,status} while downloading
  const[history,setHistory]=useState([]);             // [{role,content}]
  const[input,setInput]=useState('');
  const[withDesign,setWithDesign]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const abort=useRef(null),endRef=useRef(null);

  const check=async()=>{
    setModels(undefined);setError('');
    const m=await installedModels();setModels(m);
    if(m&&m.length&&!m.includes(model))setModel(m.find(x=>x.startsWith('qwen'))||m[0]);
  };
  useEffect(()=>{check();return()=>abort.current?.abort();},[]);
  useEffect(()=>{endRef.current?.scrollIntoView({block:'end'});},[history]);

  const download=async()=>{
    setError('');setPull({fraction:0,status:'starting'});abort.current=new AbortController();
    try{await pullModel(DEFAULT_MODEL,(fraction,status)=>setPull({fraction,status}),{signal:abort.current.signal});setModel(DEFAULT_MODEL);await check();}
    catch(e){if(e.name!=='AbortError')setError(`Download failed: ${e.message}`);}
    setPull(null);
  };

  const send=async()=>{
    const q=input.trim();if(!q||busy)return;
    const design=withDesign&&nodes.length?generateVerilog(nodes,edges,projectName,pdkContext).verilog:'';
    const asked=[...history,{role:'user',content:q}];
    setHistory([...asked,{role:'assistant',content:''}]);setInput('');setBusy(true);setError('');
    abort.current=new AbortController();
    try{
      await chat(model,buildMessages(asked,design),t=>setHistory(h=>{const c=[...h];c[c.length-1]={role:'assistant',content:c[c.length-1].content+t};return c;}),{signal:abort.current.signal});
    }catch(e){if(e.name!=='AbortError')setError(e.message);}
    setBusy(false);
  };

  const ready=models&&models.includes(model);
  return(
    <div style={S.panel}>
      <div style={S.head}>
        <span style={{color:'#f472b6',fontSize:13,fontWeight:700}}>✦ Learning assistant</span>
        {ready&&<select value={model} onChange={e=>setModel(e.target.value)} style={S.select} aria-label="Model">
          {models.map(m=><option key={m}>{m}</option>)}</select>}
      </div>

      {models===undefined&&<div style={S.note}>Looking for Ollama…</div>}

      {models===null&&<div style={S.note}>
        <p style={{margin:'0 0 8px',color:'#cbd5e1'}}>The assistant runs a small open-source model on your own computer with <b>Ollama</b>. Nothing you type leaves this machine.</p>
        <ol style={{margin:'0 0 10px',paddingLeft:18}}>
          <li>Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={S.link}>ollama.com/download</a> (free; macOS, Windows, Linux).</li>
          <li>Start it (it runs in the background).</li>
          <li>Click <b>Check again</b>.</li>
        </ol>
        <button onClick={check} style={S.btn}>Check again</button>
      </div>}

      {models&&!ready&&!pull&&<div style={S.note}>
        <p style={{margin:'0 0 10px',color:'#cbd5e1'}}>Ollama is running. Download the assistant's model once: <b>Qwen2.5-Coder 1.5B</b> (Apache-2.0 licence, about 1 GB).</p>
        <button onClick={download} style={S.btn}>Download model</button>
      </div>}

      {pull&&<div style={S.note}>
        <div style={{marginBottom:6}}>Downloading {DEFAULT_MODEL}… {pull.fraction!=null?`${Math.round(pull.fraction*100)}%`:pull.status}</div>
        <div style={{height:6,background:'#1e2733',borderRadius:3}}><div style={{height:6,width:`${Math.round((pull.fraction||0)*100)}%`,background:'#f472b6',borderRadius:3}}/></div>
        <button onClick={()=>abort.current?.abort()} style={{...S.btn,marginTop:10}}>Cancel</button>
      </div>}

      {ready&&<>
        <div style={S.log} aria-live="polite">
          {!history.length&&<div style={{color:'#475569',fontSize:11.5,lineHeight:1.6}}>
            Ask about your circuit, Verilog or any step in the flow. For example:
            {['Explain what my circuit does','Why does my design have this critical path?','What is a stuck-at fault?','How would I add a carry-in?']
              .map(s=><button key={s} onClick={()=>setInput(s)} style={S.chip}>{s}</button>)}
          </div>}
          {history.map((m,i)=><div key={i} style={m.role==='user'?S.user:S.bot}>{m.content||(busy&&i===history.length-1?'…':'')}</div>)}
          <div ref={endRef}/>
        </div>
        {error&&<div style={{...S.note,color:'#f87171',borderTop:'1px solid #1e2733'}}>{error}</div>}
        <div style={S.foot}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} rows={3} placeholder="Ask a question…  (Enter to send, Shift+Enter for a new line)"
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} style={S.input} aria-label="Question"/>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
            <label style={{color:'#64748b',fontSize:10.5,display:'flex',gap:5,alignItems:'center',flex:1}}>
              <input type="checkbox" checked={withDesign} onChange={e=>setWithDesign(e.target.checked)}/> Include my design</label>
            {history.length>0&&!busy&&<button onClick={()=>setHistory([])} style={S.btnGhost}>Clear</button>}
            {busy?<button onClick={()=>abort.current?.abort()} style={S.btn}>Stop</button>
                 :<button onClick={send} disabled={!input.trim()} style={{...S.btn,opacity:input.trim()?1:.5}}>Ask</button>}
          </div>
          <div style={{color:'#334155',fontSize:9.5,marginTop:6}}>A small local model can be wrong. Check important answers.</div>
        </div>
      </>}
      {!ready&&error&&<div style={{...S.note,color:'#f87171'}}>{error}</div>}
    </div>
  );
}

const S={
  panel:{width:420,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'Space Grotesk',sans-serif",flexShrink:0},
  head:{padding:'12px 14px',borderBottom:'1px solid #1e2733',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8},
  select:{background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#94a3b8',fontSize:10.5,padding:'2px 4px',maxWidth:180},
  note:{padding:'14px',color:'#94a3b8',fontSize:12,lineHeight:1.6},
  link:{color:'#38bdf8'},
  btn:{background:'#2a0f24',border:'1px solid #9d174d',color:'#f472b6',borderRadius:6,fontSize:11.5,padding:'5px 12px',cursor:'pointer',fontFamily:'inherit'},
  btnGhost:{background:'transparent',border:'1px solid #1e2733',color:'#64748b',borderRadius:6,fontSize:11,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit'},
  chip:{display:'block',margin:'6px 0 0',background:'#161b27',border:'1px solid #1e2733',color:'#94a3b8',borderRadius:6,fontSize:11,padding:'5px 9px',cursor:'pointer',textAlign:'left',fontFamily:'inherit'},
  log:{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:10},
  user:{alignSelf:'flex-end',maxWidth:'85%',background:'#1e3a5f',color:'#e2e8f0',borderRadius:'10px 10px 2px 10px',padding:'7px 10px',fontSize:12,whiteSpace:'pre-wrap'},
  bot:{alignSelf:'flex-start',maxWidth:'95%',background:'#161b27',border:'1px solid #1e2733',color:'#cbd5e1',borderRadius:'10px 10px 10px 2px',padding:'8px 11px',fontSize:12,lineHeight:1.55,whiteSpace:'pre-wrap'},
  foot:{borderTop:'1px solid #1e2733',padding:'10px 14px'},
  input:{width:'100%',boxSizing:'border-box',background:'#161b27',border:'1px solid #1e2733',borderRadius:6,color:'#e2e8f0',fontSize:12,padding:'7px 9px',fontFamily:'inherit',resize:'vertical',outline:'none'},
};
