import React,{useState}from'react';
import useStore from'../store/graphStore.js';
const KW=['module','endmodule','input','output','wire','reg','assign','always','posedge','negedge','if','else','begin','end','case','endcase','parameter','timescale'];
function VHL({code}){return<>{code.split('\n').map((l,i)=>{if(l.trim().startsWith('//'))return<span key={i} style={{color:'#2d4a2d'}}>{l}{'\n'}</span>;if(l.trim().startsWith('`'))return<span key={i} style={{color:'#4c1d95'}}>{l}{'\n'}</span>;return<span key={i}>{l.split(/(\b\w+\b|'[01xz]|"[^"]*"|#\d+)/).map((t,j)=>KW.includes(t)?<span key={j} style={{color:'#60a5fa'}}>{t}</span>:/^\d+$/.test(t)?<span key={j} style={{color:'#f59e0b'}}>{t}</span>:t)}{'\n'}</span>;})}</>;}
export default function TutorialPanel(){
  const b=useStore(s=>s.tutorialBlock),setShow=useStore(s=>s.setShowTutorial);
  const[tab,setTab]=useState('learn');const[copied,setCopied]=useState(false);
  if(!b)return null;
  const color=b.color||'#60a5fa';
  const snippet=b.verilogSnippet
    ?`// ${b.cell||b.module}\n\n`+b.verilogSnippet.replace('{inst}',`${b.module||b.id}_0`).replace(/\{(\w+)\}/g,'$1')
    :`module ${b.module||b.id} (\n${(b.ports?.inputs||[]).map(p=>`    input  wire ${p.width>1?`[${p.width-1}:0] `:''}${p.name}`).join(',\n')}${b.ports?.inputs?.length&&b.ports?.outputs?.length?',\n':''}${(b.ports?.outputs||[]).map(p=>`    output wire ${p.width>1?`[${p.width-1}:0] `:''}${p.name}`).join(',\n')}\n);\n    // ${b.logic||'// logic'}\nendmodule`;
  const tabs=['learn','code','ports','timing'];
  return(
    <div style={{width:340,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'Space Grotesk',sans-serif",flexShrink:0}}>
      <div style={{padding:'12px 16px 0',borderBottom:'1px solid #1e2733'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{background:color,color:'#000',fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:4}}>{b.symbol}</span>
            <span style={{color:'#e2e8f0',fontSize:14,fontWeight:700}}>{b.label}</span>
          </div>
          <button onClick={()=>setShow(false)} style={{background:'transparent',border:'none',color:'#334155',cursor:'pointer',fontSize:18}}>×</button>
        </div>
        {b.cell&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9.5,color:'#1e3a5f',marginBottom:8}}>{b.cell}</div>}
        <div style={{display:'flex'}}>{tabs.map(t=><button key={t} onClick={()=>setTab(t)} style={{background:'transparent',border:'none',borderBottom:`2px solid ${tab===t?color:'transparent'}`,color:tab===t?color:'#334155',fontSize:11,fontWeight:tab===t?600:400,padding:'5px 12px 8px',cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",textTransform:'capitalize'}}>{t}</button>)}</div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:16}}>
        {tab==='learn'&&<>
          <p style={{color:'#94a3b8',fontSize:12.5,lineHeight:1.8,marginBottom:16}}>{b.description}</p>
          <div style={{background:'#0a1628',border:`1px solid ${color}22`,borderRadius:8,padding:14,marginBottom:16}}>
            <div style={{color:color,fontSize:9.5,letterSpacing:1.5,textTransform:'uppercase',marginBottom:8}}>How it works</div>
            <p style={{color:'#7ea9c8',fontSize:12,lineHeight:1.9,margin:0}}>{b.tutorial}</p>
          </div>
          {b.logic&&<div style={{background:'#111827',borderRadius:6,padding:'10px 12px',fontFamily:"'JetBrains Mono',monospace"}}>
            <div style={{color:'#334155',fontSize:9,marginBottom:4}}>BOOLEAN</div>
            <div style={{color:'#4ade80',fontSize:12}}>{b.logic}</div>
          </div>}
        </>}
        {tab==='code'&&<>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{color:'#334155',fontSize:10,textTransform:'uppercase',letterSpacing:1}}>Verilog</span>
            <button onClick={()=>{navigator.clipboard.writeText(snippet);setCopied(true);setTimeout(()=>setCopied(false),1500);}} style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#475569',fontSize:10,padding:'2px 8px',cursor:'pointer'}}>{copied?'✓':'copy'}</button>
          </div>
          <pre style={{background:'#0a0e18',border:'1px solid #1e2733',borderRadius:6,padding:12,margin:0,fontSize:11,lineHeight:1.8,color:'#94a3b8',whiteSpace:'pre-wrap',fontFamily:"'JetBrains Mono',monospace"}}><VHL code={snippet}/></pre>
        </>}
        {tab==='ports'&&<table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'JetBrains Mono',monospace"}}>
          <thead><tr>{['Name','Dir','Width'].map(h=><th key={h} style={{color:'#334155',fontSize:9.5,textAlign:'left',padding:'4px 6px',fontWeight:500}}>{h}</th>)}</tr></thead>
          <tbody>
            {(b.ports?.inputs||[]).map(p=><tr key={`i_${p.name}`} style={{borderBottom:'1px solid #0f1419'}}><td style={{color:'#60a5fa',fontSize:11,padding:'5px 6px'}}>{p.name}</td><td style={{color:'#334155',fontSize:10,padding:'5px 6px'}}>→</td><td style={{color:'#475569',fontSize:10,padding:'5px 6px',fontFamily:"'JetBrains Mono',monospace"}}>[{p.width-1}:0]</td></tr>)}
            {(b.ports?.outputs||[]).map(p=><tr key={`o_${p.name}`} style={{borderBottom:'1px solid #0f1419'}}><td style={{color:'#4ade80',fontSize:11,padding:'5px 6px'}}>{p.name}</td><td style={{color:'#334155',fontSize:10,padding:'5px 6px'}}>←</td><td style={{color:'#475569',fontSize:10,padding:'5px 6px',fontFamily:"'JetBrains Mono',monospace"}}>[{p.width-1}:0]</td></tr>)}
          </tbody>
        </table>}
        {tab==='timing'&&(()=>{
          const t=b.timingHint;
          if(!t)return<div style={{color:'#334155',fontSize:12}}>No timing data available.</div>;
          const rows=[];
          if(t.tpd_typ)rows.push({l:'Propagation delay (typ)',v:`${t.tpd_typ} ns`,n:'TT 1.8V 25°C'});
          if(t.tsu)rows.push({l:'Setup time',v:`${t.tsu} ns`,n:'CLK→D'});
          if(t.thd)rows.push({l:'Hold time',v:`${t.thd} ns`,n:'CLK→D'});
          if(t.tco)rows.push({l:'Clock-to-Q',v:`${t.tco} ns`,n:'typ'});
          return<>
            <div style={{color:'#334155',fontSize:10,marginBottom:10}}>TT corner · {b.cell||b.module} · {b.timingHint?.unit||'ns'}</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'JetBrains Mono',monospace"}}>
              <tbody>{rows.map(r=><tr key={r.l} style={{borderBottom:'1px solid #0f1419'}}><td style={{color:'#475569',fontSize:11,padding:'6px 6px'}}>{r.l}</td><td style={{color,fontSize:12,padding:'6px 6px',fontWeight:700}}>{r.v}</td><td style={{color:'#1e2733',fontSize:10,padding:'6px 6px'}}>{r.n}</td></tr>)}</tbody>
            </table>
          </>;
        })()}
      </div>
    </div>
  );
}
