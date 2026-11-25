import React,{useEffect,useState}from'react';
import useStore from'../store/graphStore.js';

export const ATALANTA_GUIDE='https://github.com/RohitLalu/Verilog-Blocks-IDE/blob/main/docs/ATALANTA.md';

// The build commands from docs/ATALANTA.md for the visitor's system (the guide has the full explanation)
const SOURCES='error.cpp hash.cpp help.cpp read_cct.cpp structure.cpp io.cpp pio.cpp stem.cpp define_fault_list.cpp testability.cpp fan.cpp learn.cpp ppsfp.cpp truth.cpp lsim.cpp fsim.cpp random.cpp print.cpp sim.cpp atalanta.cpp';
const FETCH='git init atalanta && cd atalanta\ngit fetch --depth 1 https://github.com/hsluoyz/Atalanta a8e07fe4af80c55b0d4ca77e382731b03ad731dc\ngit checkout FETCH_HEAD';
const STEPS={
  mac:`xcode-select --install          # once: Apple's free compiler\n${FETCH}\nc++ -O2 -std=gnu++14 -w ${SOURCES} -o atalanta\nmkdir -p ~/.local/bin && mv atalanta ~/.local/bin/`,
  linux:`sudo apt install g++ git          # or your distribution's equivalent\n${FETCH}\ng++ -O2 -std=gnu++14 -w -static ${SOURCES} -o atalanta\nmkdir -p ~/.local/bin && mv atalanta ~/.local/bin/`,
  win:`# In the "MSYS2 UCRT64" terminal (see the guide for installing MSYS2):\npacman -S --needed git mingw-w64-ucrt-x86_64-gcc\n${FETCH}\nsed -i 's/time((long\\*)NULL)/time(NULL)/' random.cpp\ng++ -O2 -std=gnu++14 -w -static -DWIN32 ${SOURCES} -o atalanta.exe -lpsapi -Wl,--stack,16777216\n# then put atalanta.exe in a folder on your PATH (see the guide)`,
};
const osKey=()=>{const p=(navigator.userAgentData?.platform||navigator.platform||'').toLowerCase();return p.includes('win')?'win':p.includes('mac')?'mac':'linux';};

export default function ToolsModal(){
  const setShowTools=useStore(s=>s.setShowTools);
  const[tools,setTools]=useState(null);const[error,setError]=useState('');const[copied,setCopied]=useState(false);
  const load=async()=>{setTools(null);setError('');
    try{setTools(await window.api.tools.status());}catch(e){setError(String(e.message||e));}};
  useEffect(()=>{load();},[]);
  const atalanta=tools?.find(t=>t.name==='atalanta');
  const steps=STEPS[osKey()];
  const copy=()=>{navigator.clipboard?.writeText(steps).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);},()=>{});};

  return(
    <div style={S.backdrop} onClick={e=>{if(e.target===e.currentTarget)setShowTools(false);}}>
      <div style={S.box} role="dialog" aria-label="Tools">
        <div style={S.head}>
          <span style={{color:'#94a3b8',fontSize:15,fontWeight:700}}>⚙ Tools</span>
          <div style={{display:'flex',gap:8}}>
            <button onClick={load} style={S.ghost}>Refresh</button>
            <button onClick={()=>setShowTools(false)} style={{...S.ghost,border:'none',fontSize:18}} aria-label="Close">×</button>
          </div>
        </div>
        <div style={{padding:'14px 20px',overflowY:'auto'}}>
          {!tools&&!error&&<div style={S.muted}>Checking tools…</div>}
          {error&&<div style={{color:'#f87171',fontSize:12}}>Could not read the tools: {error}</div>}
          {tools&&<table style={{width:'100%',borderCollapse:'collapse'}}><tbody>
            {tools.map(t=>(
              <tr key={t.name} style={{borderBottom:'1px solid #1e2733'}}>
                <td style={{padding:'9px 8px 9px 0',verticalAlign:'top',width:90}}>
                  <div style={{color:'#e2e8f0',fontFamily:"'JetBrains Mono',monospace",fontSize:12.5}}>{t.name}</div></td>
                <td style={{padding:'9px 0',verticalAlign:'top'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={S.chip(t.found?(t.bundled?'#4ade80':'#38bdf8'):'#f87171')}>{t.found?(t.bundled?'included with the app':'installed on this computer'):'missing'}</span>
                    <span style={S.muted}>{t.role}</span>
                  </div>
                  {t.version&&<div style={S.mono}>{t.version}</div>}
                  {t.path&&<div style={{...S.mono,color:'#475569'}}>{t.path}</div>}
                </td>
              </tr>))}
          </tbody></table>}

          {tools?.find(t=>t.name==='cocotb'&&!t.found)&&<p style={{...S.muted,marginTop:12}}>cocotb and pyuvm (Python testbenches) come with the app
            on macOS and Linux. Here, install Python 3, then run <code style={{color:'#facc15'}}>python -m pip install cocotb pyuvm</code> and restart the app.</p>}
          {atalanta&&!atalanta.found&&<div style={S.callout}>
            <div style={{color:'#fbbf24',fontWeight:700,fontSize:13,marginBottom:6}}>Fault coverage (ATPG) needs atalanta</div>
            <p style={S.p}>atalanta is not included with the app. Its licence allows <b>teaching and research use only</b>; commercial use needs
              written permission from Prof. Dong S. Ha (Virginia Tech). You can build it on this computer in a few minutes with a free C++ compiler:</p>
            <pre style={S.pre}>{steps}</pre>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <button onClick={copy} style={S.ghost}>{copied?'Copied':'Copy commands'}</button>
              <a href={ATALANTA_GUIDE} target="_blank" rel="noreferrer" style={{color:'#38bdf8',fontSize:12}}>Step-by-step guide (macOS, Windows, Linux) ↗</a>
            </div>
            <p style={{...S.p,marginTop:10}}>Then restart VerilogBlocks IDE and click <b>Refresh</b>.</p>
          </div>}
        </div>
      </div>
    </div>
  );
}

const S={
  backdrop:{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,fontFamily:"'Space Grotesk',sans-serif"},
  box:{background:'#161b27',border:'1px solid #1e2733',borderRadius:12,width:640,maxWidth:'94vw',maxHeight:'86vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,.6)'},
  head:{padding:'16px 20px',borderBottom:'1px solid #1e2733',display:'flex',justifyContent:'space-between',alignItems:'center'},
  ghost:{background:'transparent',border:'1px solid #1e2733',borderRadius:6,color:'#94a3b8',fontSize:11.5,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit'},
  muted:{color:'#64748b',fontSize:11.5},
  mono:{color:'#94a3b8',fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,marginTop:4,wordBreak:'break-all'},
  chip:c=>({color:c,border:`1px solid ${c}55`,background:`${c}14`,borderRadius:10,fontSize:10.5,padding:'1px 8px'}),
  callout:{marginTop:16,background:'#1c1508',border:'1px solid #92400e',borderRadius:8,padding:'12px 14px'},
  p:{color:'#cbd5e1',fontSize:12,lineHeight:1.6,margin:'0 0 8px'},
  pre:{background:'#0a0e18',border:'1px solid #1e2733',borderRadius:6,color:'#94a3b8',fontSize:10.5,lineHeight:1.6,padding:10,margin:'0 0 10px',whiteSpace:'pre-wrap',wordBreak:'break-all',fontFamily:"'JetBrains Mono',monospace"},
};
