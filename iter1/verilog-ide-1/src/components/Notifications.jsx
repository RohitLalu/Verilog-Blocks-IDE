import React from 'react';
import useStore from '../store/graphStore.js';
const S={success:{border:'#166534',bg:'#0a2218',color:'#4ade80',icon:'✓'},error:{border:'#991b1b',bg:'#1c0505',color:'#f87171',icon:'✗'},warn:{border:'#92400e',bg:'#1c1004',color:'#fbbf24',icon:'⚠'},info:{border:'#1e40af',bg:'#0a1628',color:'#60a5fa',icon:'ℹ'}};
export default function Notifications(){
  const ns=useStore(s=>s.notifications),dismiss=useStore(s=>s.dismissNotification);
  if(!ns.length)return null;
  return(<div style={{position:'fixed',bottom:20,right:20,display:'flex',flexDirection:'column',gap:8,zIndex:9999,pointerEvents:'none'}}>
    {ns.map(n=>{const s=S[n.type]||S.info;return(<div key={n.id} style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:7,padding:'9px 14px',display:'flex',alignItems:'center',gap:8,fontFamily:"'Space Grotesk',sans-serif",boxShadow:'0 8px 24px rgba(0,0,0,.4)',pointerEvents:'all',animation:'slideIn .2s ease',minWidth:240,maxWidth:360}}>
      <span style={{color:s.color,fontSize:13,flexShrink:0}}>{s.icon}</span>
      <span style={{color:s.color,fontSize:12,flex:1}}>{n.msg}</span>
      <button onClick={()=>dismiss(n.id)} style={{background:'transparent',border:'none',color:s.border,cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}>×</button>
    </div>);})}
  </div>);
}
