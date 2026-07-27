import React, { useState } from 'react';
import useStore from '../store/graphStore.js';
const KW=['module','endmodule','input','output','inout','wire','reg','assign','always','posedge','negedge','if','else','begin','end','case','endcase','parameter','localparam','timescale'];
function HL({code}){return<>{code.split('\n').map((l,i)=>{if(l.trim().startsWith('//'))return<span key={i} style={{color:'#1e3a2e'}}>{l}{'\n'}</span>;if(l.trim().startsWith('`'))return<span key={i} style={{color:'#4c1d95'}}>{l}{'\n'}</span>;return<span key={i}>{l.split(/(\b\w+\b|'[01xzbhd]+|"[^"]*"|#\d+\.?\d*)/).map((t,j)=>KW.includes(t)?<span key={j} style={{color:'#60a5fa'}}>{t}</span>:/^\d[\d.'_]*$/.test(t)||/^'\d*[bdho]/i.test(t)?<span key={j} style={{color:'#f59e0b'}}>{t}</span>:t)}{'\n'}</span>;})}</>;}
export default function VerilogPanel(){
  const code=useStore(s=>s.generatedVerilog);
  const[copied,setCopied]=useState(false);
  const lines=code.split('\n');
  return(<div style={{width:390,background:'#0d1117',borderLeft:'1px solid #1e2733',display:'flex',flexDirection:'column',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>
    <div style={{padding:'10px 14px',borderBottom:'1px solid #1e2733',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{color:'#4ade80',fontSize:12,fontWeight:600}}>top.v</span>
      <div style={{display:'flex',gap:6}}>
        <span style={{color:'#1e2733',fontSize:10}}>{lines.length} lines</span>
        <button onClick={()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1500);}} style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#475569',fontSize:10,padding:'2px 8px',cursor:'pointer'}}>{copied?'✓ copied':'copy'}</button>
        <button onClick={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([code],{type:'text/plain'}));a.download='top.v';a.click();}} style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#475569',fontSize:10,padding:'2px 8px',cursor:'pointer'}}>↓ .v</button>
      </div>
    </div>
    <div style={{flex:1,overflowY:'auto'}}>
      {code?<table style={{borderCollapse:'collapse',width:'100%',tableLayout:'fixed'}}><tbody>{lines.map((l,i)=><tr key={i} style={{lineHeight:1.7}}><td style={{width:36,textAlign:'right',paddingRight:10,paddingLeft:8,color:'#1e2733',fontSize:10,userSelect:'none',borderRight:'1px solid #111827',verticalAlign:'top'}}>{i+1}</td><td style={{paddingLeft:12,fontSize:11,color:'#64748b',whiteSpace:'pre',overflow:'hidden'}}><HL code={l}/></td></tr>)}</tbody></table>
      :<div style={{color:'#1e2733',fontSize:12,padding:20,textAlign:'center'}}>Click {'</>'} in toolbar to generate Verilog</div>}
    </div>
  </div>);
}
