import React,{useEffect,useRef,useState}from'react';
import useStore from'../store/graphStore.js';
import{generateVerilog}from'../codegen/graphToVerilog.js';
import{DEFAULT_MODEL,TUTOR_MODEL,installedModels,pullModel,createTutor,chat,buildMessages}from'../lib/ollama.js';
import{buildContext}from'../lib/assistantContext.js';

// The learning assistant: a chat floating over the canvas, so it stays open beside any panel. It runs the IDE's own
// tutor model locally in Ollama and is told about the student's design and latest results with every question.
export default function AssistantDock(){
  const setShowAssistant=useStore(s=>s.setShowAssistant);
  const pending=useStore(s=>s.assistantPending),clearPending=useStore(s=>s.clearAssistantPending);
  const[models,setModels]=useState(undefined);        // undefined = checking, null = Ollama not running
  const[model,setModel]=useState(TUTOR_MODEL);
  const[setup,setSetup]=useState(null);               // {fraction,status} while downloading / building the tutor
  const[history,setHistory]=useState([]);
  const[input,setInput]=useState('');
  const[withWork,setWithWork]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const abort=useRef(null),endRef=useRef(null),waiting=useRef('');   // waiting: an Explain question held until setup is done

  const check=async()=>{
    setModels(undefined);setError('');
    const m=await installedModels();setModels(m);
    if(m&&!m.includes(model))setModel(m.includes(TUTOR_MODEL)?TUTOR_MODEL:(m.find(x=>x.startsWith('vbide-tutor'))||TUTOR_MODEL));
  };
  useEffect(()=>{check();return()=>abort.current?.abort();},[]);
  useEffect(()=>{endRef.current?.scrollIntoView({block:'end'});},[history]);

  const ready=!!models&&models.includes(model);
  const hasBase=!!models&&models.includes(DEFAULT_MODEL);

  // Download the base model if needed, then build the tutor from it (seconds; nothing more is downloaded)
  const setUp=async()=>{
    setError('');abort.current=new AbortController();const signal=abort.current.signal;
    try{
      if(!hasBase)await pullModel(DEFAULT_MODEL,(fraction,status)=>setSetup({fraction,status:`Downloading ${DEFAULT_MODEL}: ${status}`}),{signal});
      setSetup({fraction:null,status:'Building the VerilogBlocks tutor…'});
      await createTutor(status=>setSetup({fraction:null,status:`Building the tutor: ${status}`}),{signal});
      setModel(TUTOR_MODEL);await check();
      if(waiting.current){setSetup(null);const q=waiting.current;waiting.current='';setInput('');await send(q,TUTOR_MODEL);return;}
    }catch(e){if(e.name!=='AbortError')setError(`Setup failed: ${e.message}`);}
    setSetup(null);
  };

  const send=async(text,useModel=model)=>{
    const q=(text??input).trim();if(!q||busy)return;
    const st=useStore.getState();
    const context=withWork?buildContext({nodes:st.nodes,verilog:st.nodes.length?generateVerilog(st.nodes,st.edges,st.projectName,st.pdkContext).verilog:'',
      pdkName:st.selectedPDK?.name||st.selectedPDK?.id,simOutput:st.simOutput,lastVCD:st.lastVCD,staResult:st.staResult,atpgResult:st.atpgResult,synthesisOutput:st.synthesisOutput,cocotbResult:st.cocotbResult,formalResult:st.formalResult}):'';
    const asked=[...history,{role:'user',content:q}];
    setHistory([...asked,{role:'assistant',content:''}]);if(text===undefined)setInput('');setBusy(true);setError('');
    abort.current=new AbortController();
    try{
      await chat(useModel,buildMessages(asked,context,useModel),t=>setHistory(h=>{const c=[...h];c[c.length-1]={role:'assistant',content:c[c.length-1].content+t};return c;}),{signal:abort.current.signal});
    }catch(e){if(e.name!=='AbortError')setError(e.message);}
    setBusy(false);
  };

  // A question from an "Explain" button elsewhere: send it when ready, else keep it in the box for after setup
  useEffect(()=>{
    if(!pending)return;
    if(ready&&!busy){clearPending();send(pending.prompt);}
    else if(models!==undefined&&!ready){waiting.current=pending.prompt;setInput(pending.prompt);clearPending();}
  },[pending,ready,models,busy]);

  return(
    <div style={S.dock} role="complementary" aria-label="Learning assistant">
      <div style={S.head}>
        <span style={{color:'#f472b6',fontSize:13,fontWeight:700}}>✦ Assistant</span>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {ready&&models.length>1&&<select value={model} onChange={e=>setModel(e.target.value)} style={S.select} aria-label="Model">
            {models.map(m=><option key={m} value={m}>{m.startsWith('vbide-tutor')?`${m} (VerilogBlocks tutor)`:m}</option>)}</select>}
          <button onClick={()=>setShowAssistant(false)} style={S.x} aria-label="Close assistant" title="Close (the conversation is kept until you clear it)">×</button>
        </div>
      </div>

      {models===undefined&&<div style={S.note}>Looking for Ollama…</div>}

      {models===null&&<div style={S.note}>
        <p style={S.p}>The assistant is VerilogBlocks' own tutor, a small open-source model that runs on your computer with
          <b> Ollama</b>. Nothing you type leaves this machine.</p>
        <ol style={{margin:'0 0 10px',paddingLeft:18}}>
          <li>Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={S.link}>ollama.com/download</a> (free; macOS, Windows, Linux).</li>
          <li>Start it; it runs in the background.</li>
          <li>Click <b>Check again</b>.</li>
        </ol>
        <button onClick={check} style={S.btn}>Check again</button>
      </div>}

      {models&&!ready&&!setup&&<div style={S.note}>
        <p style={S.p}>Ollama is running. Set up the <b>VerilogBlocks tutor</b> once: it is built from Qwen2.5-Coder 1.5B
          (Apache-2.0) with instructions about this app.{hasBase?' The base model is already here, so this takes seconds.':' This downloads about 1 GB.'}</p>
        <button onClick={setUp} style={S.btn}>{hasBase?'Set up the tutor':'Download and set up (about 1 GB)'}</button>
        {input&&<p style={{...S.p,marginTop:10,color:'#64748b'}}>Your question will be sent when setup is done: “{input.slice(0,80)}{input.length>80?'…':''}”</p>}
      </div>}

      {setup&&<div style={S.note}>
        <div style={{marginBottom:6}}>{setup.status}{setup.fraction!=null?` ${Math.round(setup.fraction*100)}%`:''}</div>
        <div style={{height:6,background:'#1e2733',borderRadius:3}}><div style={{height:6,width:`${Math.round((setup.fraction??0.5)*100)}%`,background:'#f472b6',borderRadius:3}}/></div>
        <button onClick={()=>abort.current?.abort()} style={{...S.btn,marginTop:10}}>Cancel</button>
      </div>}

      {ready&&<>
        <div style={S.log} aria-live="polite">
          {!history.length&&<div style={{color:'#475569',fontSize:11.5,lineHeight:1.6}}>
            Ask about your circuit, Verilog or any step of the flow. I can see your design and your latest results.
            {['Explain what my circuit does','Why is this my critical path?','What is a stuck-at fault?','How do I add a carry input?']
              .map(s=><button key={s} onClick={()=>send(s)} style={S.chip}>{s}</button>)}
          </div>}
          {history.map((m,i)=><div key={i} style={m.role==='user'?S.user:S.bot}>{m.content||(busy&&i===history.length-1?'…':'')}</div>)}
          <div ref={endRef}/>
        </div>
        {error&&<div style={{...S.note,color:'#f87171',borderTop:'1px solid #1e2733'}}>{error}</div>}
        <div style={S.foot}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} rows={2} placeholder="Ask a question…  (Enter to send, Shift+Enter for a new line)"
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} style={S.input} aria-label="Question"/>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
            <label style={{color:'#64748b',fontSize:10.5,display:'flex',gap:5,alignItems:'center',flex:1}} title="Your design and the latest simulation, timing, ATPG and Yosys results">
              <input type="checkbox" checked={withWork} onChange={e=>setWithWork(e.target.checked)}/> Use my design and results</label>
            {history.length>0&&!busy&&<button onClick={()=>setHistory([])} style={S.ghost}>Clear</button>}
            {busy?<button onClick={()=>abort.current?.abort()} style={S.btn}>Stop</button>
                 :<button onClick={()=>send()} disabled={!input.trim()} style={{...S.btn,opacity:input.trim()?1:.5}}>Ask</button>}
          </div>
          <div style={{color:'#334155',fontSize:9.5,marginTop:5}}>A small local model can be wrong. Check important answers.</div>
        </div>
      </>}
      {!ready&&error&&<div style={{...S.note,color:'#f87171'}}>{error}</div>}
    </div>
  );
}

const S={
  dock:{position:'absolute',right:14,bottom:14,width:390,maxWidth:'calc(100% - 28px)',height:540,maxHeight:'calc(100% - 28px)',zIndex:20,
    background:'#0d1117',border:'1px solid #9d174d77',borderRadius:12,boxShadow:'0 18px 50px rgba(0,0,0,.6)',display:'flex',flexDirection:'column',
    fontFamily:"'Space Grotesk',sans-serif",overflow:'hidden'},
  head:{padding:'10px 12px 10px 14px',borderBottom:'1px solid #1e2733',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8},
  select:{background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#94a3b8',fontSize:10.5,padding:'2px 4px',maxWidth:190},
  x:{background:'transparent',border:'none',color:'#64748b',fontSize:18,cursor:'pointer',lineHeight:1,padding:'0 4px'},
  note:{padding:'14px',color:'#94a3b8',fontSize:12,lineHeight:1.6},
  p:{margin:'0 0 10px',color:'#cbd5e1'},
  link:{color:'#38bdf8'},
  btn:{background:'#2a0f24',border:'1px solid #9d174d',color:'#f472b6',borderRadius:6,fontSize:11.5,padding:'5px 12px',cursor:'pointer',fontFamily:'inherit'},
  ghost:{background:'transparent',border:'1px solid #1e2733',color:'#64748b',borderRadius:6,fontSize:11,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit'},
  chip:{display:'block',margin:'6px 0 0',background:'#161b27',border:'1px solid #1e2733',color:'#94a3b8',borderRadius:6,fontSize:11,padding:'5px 9px',cursor:'pointer',textAlign:'left',fontFamily:'inherit'},
  log:{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:10},
  user:{alignSelf:'flex-end',maxWidth:'85%',background:'#1e3a5f',color:'#e2e8f0',borderRadius:'10px 10px 2px 10px',padding:'7px 10px',fontSize:12,whiteSpace:'pre-wrap'},
  bot:{alignSelf:'flex-start',maxWidth:'95%',background:'#161b27',border:'1px solid #1e2733',color:'#cbd5e1',borderRadius:'10px 10px 10px 2px',padding:'8px 11px',fontSize:12,lineHeight:1.55,whiteSpace:'pre-wrap'},
  foot:{borderTop:'1px solid #1e2733',padding:'10px 14px'},
  input:{width:'100%',boxSizing:'border-box',background:'#161b27',border:'1px solid #1e2733',borderRadius:6,color:'#e2e8f0',fontSize:12,padding:'7px 9px',fontFamily:'inherit',resize:'vertical',outline:'none'},
};
