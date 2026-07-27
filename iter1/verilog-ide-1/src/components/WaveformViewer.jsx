import React, { useRef, useEffect, useState, useCallback } from 'react';
const ROW_H=28,LABEL_W=140,HDR_H=28,MIN_PX_NS=4;
export default function WaveformViewer({waveform,signals=[],endTime=100}){
  const cvs=useRef(null);const[zoom,setZoom]=useState(1);const[off,setOff]=useState(0);const[cur,setCur]=useState(null);const[drag,setDrag]=useState(false);const[ds,setDs]=useState(0);const[doff,setDoff]=useState(0);
  const pxns=MIN_PX_NS*zoom,totalPx=endTime*pxns;
  useEffect(()=>{
    const c=cvs.current;if(!c)return;
    const dw=c.clientWidth||c.width;if(c.width!==dw)c.width=dw;
    const ctx=c.getContext('2d'),W=c.width,H=c.height;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#0a0e18';ctx.fillRect(0,0,W,H);
    const gns=zoom>4?1:zoom>1?5:10;ctx.strokeStyle='#1a2030';ctx.lineWidth=1;
    for(let t=0;t<=endTime;t+=gns){const x=LABEL_W+t*pxns-off;if(x>=LABEL_W&&x<=W){ctx.beginPath();ctx.moveTo(x,HDR_H);ctx.lineTo(x,H);ctx.stroke();}}
    ctx.fillStyle='#111827';ctx.fillRect(LABEL_W,0,W-LABEL_W,HDR_H);
    ctx.fillStyle='#334155';ctx.font='9px JetBrains Mono,monospace';
    for(let t=0;t<=endTime;t+=gns){const x=LABEL_W+t*pxns-off;if(x>=LABEL_W&&x<=W){ctx.fillText(`${t}ns`,x+2,17);ctx.strokeStyle='#2d3748';ctx.beginPath();ctx.moveTo(x,22);ctx.lineTo(x,HDR_H);ctx.stroke();}}
    signals.forEach((sig,ri)=>{
      const y0=HDR_H+ri*ROW_H,mid=y0+ROW_H/2,hi=y0+4,lo=y0+ROW_H-4;
      ctx.fillStyle=ri%2===0?'#0d1117':'#0a0e18';ctx.fillRect(LABEL_W,y0,W-LABEL_W,ROW_H);
      ctx.strokeStyle='#161e2e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y0+ROW_H);ctx.lineTo(W,y0+ROW_H);ctx.stroke();
      ctx.fillStyle='#475569';ctx.font='10px JetBrains Mono,monospace';ctx.fillText(sig.label||sig.netId,6,mid+4,LABEL_W-12);
      const wave=waveform?.get(sig.netId);
      if(!wave||!wave.length){ctx.strokeStyle='#334155';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(LABEL_W,mid);ctx.lineTo(W,mid);ctx.stroke();ctx.setLineDash([]);return;}
      ctx.strokeStyle=sig.color||'#4ade80';ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.beginPath();
      const xAt=t=>LABEL_W+t*pxns-off,yAt=v=>v===1?hi:v===0?lo:mid;
      let pY=yAt(wave[0]?.value??'x');ctx.moveTo(LABEL_W,pY);
      wave.forEach((pt,i)=>{const x=Math.max(LABEL_W,xAt(pt.time));const y=yAt(pt.value);if(i>0){ctx.lineTo(x,pY);ctx.lineTo(x,y);}pY=y;const nxt=wave[i+1]?.time??endTime;ctx.lineTo(Math.min(W,xAt(nxt)),y);pY=y;});
      ctx.stroke();
    });
    ctx.strokeStyle='#1e2733';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(LABEL_W,0);ctx.lineTo(LABEL_W,H);ctx.stroke();
    if(cur!==null){const cx=LABEL_W+cur*pxns-off;if(cx>=LABEL_W&&cx<=W){ctx.strokeStyle='#facc15';ctx.lineWidth=1;ctx.setLineDash([4,2]);ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#facc15';ctx.font='9px JetBrains Mono,monospace';ctx.fillText(`${cur.toFixed(2)}ns`,cx+3,12);}}
  },[waveform,signals,endTime,zoom,off,cur,pxns]);
  const onMM=useCallback(e=>{const r=cvs.current?.getBoundingClientRect();if(!r)return;setCur(Math.max(0,parseFloat(((e.clientX-r.left-LABEL_W+off)/pxns).toFixed(2))));if(drag)setOff(o=>Math.max(0,Math.min(totalPx-100,doff-(e.clientX-ds))));},[drag,ds,doff,off,pxns,totalPx]);
  const onMD=useCallback(e=>{setDrag(true);setDs(e.clientX);setDoff(off);},[off]);
  const onMU=useCallback(()=>setDrag(false),[]);
  const onW=useCallback(e=>{e.preventDefault();if(e.ctrlKey||e.metaKey)setZoom(z=>Math.max(.25,Math.min(20,z*(e.deltaY<0?1.2:.83))));else setOff(o=>Math.max(0,Math.min(totalPx,o+e.deltaX+e.deltaY)));},[totalPx]);
  const H=HDR_H+signals.length*ROW_H;
  const getV=(id)=>{if(cur===null)return'—';const w=waveform?.get(id);if(!w)return'x';let v='x';for(const e of w){if(e.time<=cur)v=e.value;else break;}return v;};
  return(<div style={{display:'flex',flexDirection:'column',height:'100%',background:'#0a0e18'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderBottom:'1px solid #1e2733',flexShrink:0}}>
      <span style={{color:'#334155',fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>Waveform</span>
      <div style={{flex:1}}/>
      <button onClick={()=>setZoom(z=>Math.min(20,z*1.5))} style={zb}>+</button>
      <span style={{color:'#334155',fontSize:10,fontFamily:"'JetBrains Mono',monospace",minWidth:40,textAlign:'center'}}>{zoom.toFixed(1)}×</span>
      <button onClick={()=>setZoom(z=>Math.max(.25,z/1.5))} style={zb}>−</button>
      <button onClick={()=>{setZoom(1);setOff(0);}} style={zb}>fit</button>
      {cur!==null&&<span style={{color:'#facc15',fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginLeft:8}}>t={cur}ns</span>}
    </div>
    <div style={{flex:1,overflow:'hidden',cursor:drag?'grabbing':'crosshair'}}>
      <canvas ref={cvs} width={900} height={Math.max(H,60)} style={{display:'block',width:'100%'}}
        onMouseMove={onMM} onMouseDown={onMD} onMouseUp={onMU} onMouseLeave={onMU} onWheel={onW}/>
    </div>
    {cur!==null&&signals.length>0&&<div style={{borderTop:'1px solid #1e2733',padding:'6px 10px',display:'flex',gap:12,flexWrap:'wrap',flexShrink:0}}>
      {signals.slice(0,8).map(s=><div key={s.netId} style={{display:'flex',gap:4,alignItems:'center'}}>
        <span style={{color:'#334155',fontSize:9.5,fontFamily:"'JetBrains Mono',monospace"}}>{s.label}=</span>
        <span style={{color:s.color||'#4ade80',fontSize:10,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{getV(s.netId)}</span>
      </div>)}
    </div>}
  </div>);
}
const zb={background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#475569',fontSize:12,width:24,height:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'JetBrains Mono',monospace"};
