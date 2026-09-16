// VerilogPanel
import React,{useState}from'react';
import useStore from'../store/graphStore.js';
const KW=['module','endmodule','input','output','inout','wire','reg','assign','always','posedge','negedge','if','else','begin','end','case','endcase','parameter','localparam','timescale'];
function HL({code}){return<>{code.split('\n').map((l,i)=>{if(l.trim().startsWith('//'))return<span key={i} style={{color:'#1e3a2e'}}>{l}{'\n'}</span>;if(l.trim().startsWith('`'))return<span key={i} style={{color:'#4c1d95'}}>{l}{'\n'}</span>;return<span key={i}>{l.split(/(\b\w+\b|'[01xzbhd]+|"[^"]*"|#\d+\.?\d*)/).map((t,j)=>KW.includes(t)?<span key={j} style={{color:'#60a5fa'}}>{t}</span>:/^\d[\d.'_]*$/.test(t)||/^'\d*[bdho]/i.test(t)?<span key={j} style={{color:'#f59e0b'}}>{t}</span>:t)}{'\n'}</span>;})}</>;}
export function VerilogPanel(){
  const code=useStore(s=>s.generatedVerilog);const[copied,setCopied]=useState(false);
  const lines=code.split('\n');
  return(<div style={{width:390,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>
    <div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{color:'#4ade80',fontSize:12,fontWeight:600}}>top.v</span>
      <div style={{display:'flex',gap:6}}>
        <span style={{color:'#1e2733',fontSize:10}}>{lines.length} lines</span>
        <button onClick={()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1500);}} style={sb}>{copied?'✓':'copy'}</button>
        <button onClick={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([code],{type:'text/plain'}));a.download='top.v';a.click();}} style={sb}>↓ .v</button>
      </div>
    </div>
    <div style={{flex:1,overflowY:'auto'}}>
      {code?<table style={{borderCollapse:'collapse',width:'100%',tableLayout:'fixed'}}><tbody>{lines.map((l,i)=><tr key={i} style={{lineHeight:1.7}}><td style={{width:36,textAlign:'right',paddingRight:10,paddingLeft:8,color:'#1e2733',fontSize:10,userSelect:'none',borderRight:'1px solid #111827',verticalAlign:'top'}}>{i+1}</td><td style={{paddingLeft:12,fontSize:11,color:'#64748b',whiteSpace:'pre',overflow:'hidden'}}><HL code={l}/></td></tr>)}</tbody></table>
      :<div style={{color:'#1e2733',fontSize:12,padding:20,textAlign:'center'}}>Click {'</>'} in toolbar to generate Verilog</div>}
    </div>
  </div>);
}
const sb={background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#475569',fontSize:10,padding:'2px 8px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace"};

// SynthesisPanel
import{useMemo}from'react';
export function SynthesisPanel(){
  const out=useStore(s=>s.synthesisOutput),running=useStore(s=>s.synthesisRunning),errors=useStore(s=>s.errors);
  const stats=useMemo(()=>{if(!out)return null;const cells={};let inS=false;out.split('\n').forEach(l=>{if(l.includes('Number of cells:'))inS=true;if(inS){const m=l.match(/^\s+(sky130\S+|gf180\S+|\$\w+)\s+(\d+)/);if(m)cells[m[1]]=parseInt(m[2]);}});const total=out.match(/Number of cells:\s+(\d+)/)?.[1],wires=out.match(/Number of wires:\s+(\d+)/)?.[1];return Object.keys(cells).length?{cells,total,wires}:null;},[out]);
  const isErr=out?.includes('ERROR'),isDone=out?.includes('stat');
  return(<div style={{width:420,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>
    <div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',display:'flex',alignItems:'center',gap:8}}>
      <span style={{color:'#c084fc',fontSize:12,fontWeight:600}}>⚛ Yosys</span>
      {running&&<span style={{color:'#7c3aed',fontSize:10,animation:'pulse 1s infinite'}}>running…</span>}
      {isDone&&!running&&<span style={{color:'#4ade80',fontSize:10}}>✓ done</span>}
      {isErr&&<span style={{color:'#f87171',fontSize:10}}>✗ error</span>}
    </div>
    {errors.length>0&&<div style={{borderBottom:'1px solid #1a0505',background:'#0d0505'}}>{errors.map((e,i)=><div key={i} style={{color:'#f87171',fontSize:11,padding:'5px 14px'}}>⚠ {e.message||e}</div>)}</div>}
    {stats&&<div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',background:'#0a0e18'}}>
      <div style={{display:'flex',gap:16,marginBottom:8}}>
        {stats.total&&<Stat l="Cells" v={stats.total} c="#c084fc"/>}
        {stats.wires&&<Stat l="Wires" v={stats.wires} c="#60a5fa"/>}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {Object.entries(stats.cells).map(([cell,count])=><div key={cell} style={{background:'#111827',border:'1px solid #1e2733',borderRadius:4,padding:'2px 8px',fontSize:9.5}}><span style={{color:'#334155'}}>{cell.split('__').pop()}</span><span style={{color:'#c084fc',marginLeft:5}}>×{count}</span></div>)}
      </div>
    </div>}
    <pre style={{flex:1,margin:0,padding:'10px 14px',overflowY:'auto',fontSize:10,lineHeight:1.75,color:isErr?'#7f1d1d':'#334155',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
      {running?'⟳ Synthesising…\nYosys + sky130 pre-installed in Docker.':out||'Click ⚛ Yosys to synthesise.'}
    </pre>
  </div>);
}
const Stat=({l,v,c})=><div><div style={{color:'#334155',fontSize:9}}>{l}</div><div style={{color:c,fontSize:18,fontWeight:700}}>{v}</div></div>;

// Notifications
export function Notifications(){
  const ns=useStore(s=>s.notifications),dismiss=useStore(s=>s.dismissNotification);
  if(!ns.length)return null;
  const S={success:{border:'#166534',bg:'#0a2218',color:'#4ade80',icon:'✓'},error:{border:'#991b1b',bg:'#1c0505',color:'#f87171',icon:'✗'},warn:{border:'#92400e',bg:'#1c1004',color:'#fbbf24',icon:'⚠'},info:{border:'#1e40af',bg:'#0a1628',color:'#60a5fa',icon:'ℹ'}};
  return(<div style={{position:'fixed',bottom:20,right:20,display:'flex',flexDirection:'column',gap:8,zIndex:9999,pointerEvents:'none'}}>
    {ns.map(n=>{const s=S[n.type]||S.info;return(<div key={n.id} style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:7,padding:'9px 14px',display:'flex',alignItems:'center',gap:8,fontFamily:"'Space Grotesk',sans-serif",boxShadow:'0 8px 24px rgba(0,0,0,.4)',pointerEvents:'all',animation:'slideIn .2s ease',minWidth:240,maxWidth:360}}>
      <span style={{color:s.color,fontSize:13,flexShrink:0}}>{s.icon}</span>
      <span style={{color:s.color,fontSize:12,flex:1}}>{n.msg}</span>
      <button onClick={()=>dismiss(n.id)} style={{background:'transparent',border:'none',color:s.border,cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}>×</button>
    </div>);})}
  </div>);
}

export default VerilogPanel;
