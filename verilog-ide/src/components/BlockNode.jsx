import React,{memo}from'react';
import{Handle,Position}from'reactflow';
import useStore from'../store/graphStore.js';
const PC={CLK:'#facc15',clk:'#facc15',RESET_B:'#f87171',RN:'#f87171',RST:'#f87171',SET_B:'#fb923c',SN:'#fb923c',SCE:'#f97316',SE:'#f97316',SCD:'#fdba74',SI:'#fdba74',default_in:'#60a5fa',default_out:'#4ade80'};
const pc=(n,o)=>PC[n]||(o?'#4ade80':'#60a5fa');

const slackColor=s=>{
  if(s===undefined||s===null)return null;
  if(s<0)return'#991b1b';
  if(s<0.5)return'#92400e';
  if(s<2)return'#166534';
  return null;
};

const BlockNode=memo(({id,data,selected})=>{
  const removeNode=useStore(s=>s.removeNode);
  const setTB=useStore(s=>s.setTutorialBlock);
  const setShow=useStore(s=>s.setShowTutorial);
  const staSlack=useStore(s=>s.staSlack);

  const ins=data.ports?.inputs||[],outs=data.ports?.outputs||[];
  const minH=Math.max(80,Math.max(ins.length,outs.length)*26+52);
  const color=data.color||'#60a5fa';
  const slack=staSlack[data.instanceName];
  const slackBorder=slackColor(slack);
  const borderColor=slackBorder||(selected?color:'#1e2d3d');

  return(
    <div style={{background:'linear-gradient(150deg,#1a2035 0%,#111827 100%)',border:`1.5px solid ${borderColor}`,borderRadius:8,minWidth:155,minHeight:minH,fontFamily:"'JetBrains Mono',monospace",boxShadow:selected?`0 0 0 1px ${color}44,0 8px 24px rgba(0,0,0,.5)`:'0 4px 14px rgba(0,0,0,.4)',position:'relative'}}>
      {/* STA slack badge */}
      {slack!==undefined&&<div style={{position:'absolute',top:-9,right:4,background:slackBorder||'#166534',color:'#fff',fontSize:8,padding:'1px 5px',borderRadius:3,fontWeight:700}}>
        {slack>=0?'+':''}{slack.toFixed(2)}ns
      </div>}
      <div style={{background:`${color}18`,borderBottom:`1px solid ${color}33`,borderRadius:'6px 6px 0 0',padding:'6px 10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{background:color,color:'#000',fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:3}}>{data.symbol||'?'}</span>
          <span style={{color:'#cbd5e1',fontSize:11,fontWeight:500,maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data.label}</span>
        </div>
        <div style={{display:'flex',gap:4}}>
          <button onClick={()=>{setTB(data);setShow(true);}} style={iconBtn}>?</button>
          <button onClick={()=>removeNode(id)} style={{...iconBtn,color:'#64748b'}}>×</button>
        </div>
      </div>
      <div style={{padding:'3px 10px 0'}}>
        <div style={{color:'#334155',fontSize:8.5}}>{data.instanceName}</div>
        {data.cell&&<div style={{color:'#1e3a5f',fontSize:7.5,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data.cell}</div>}
      </div>
      <div style={{padding:'4px 0 8px'}}>
        {ins.map(p=>(
          <div key={`i_${p.name}`} style={{display:'flex',alignItems:'center',height:24,position:'relative'}}>
            <Handle type="target" position={Position.Left} id={p.name} style={{background:pc(p.name,false),width:9,height:9,border:'1.5px solid #0d1117',left:-5,top:'50%',transform:'translateY(-50%)'}}/>
            <span style={{color:pc(p.name,false),fontSize:9,marginLeft:10,opacity:.85}}>{p.name}{p.width>1&&<span style={{color:'#334155',fontSize:8}}>[{p.width-1}:0]</span>}</span>
          </div>
        ))}
        {outs.map(p=>(
          <div key={`o_${p.name}`} style={{display:'flex',alignItems:'center',justifyContent:'flex-end',height:24,position:'relative'}}>
            <span style={{color:'#4ade80',fontSize:9,marginRight:10,opacity:.85}}>{p.width>1&&<span style={{color:'#334155',fontSize:8}}>[{p.width-1}:0]</span>}{p.name}</span>
            <Handle type="source" position={Position.Right} id={p.name} style={{background:'#4ade80',width:9,height:9,border:'1.5px solid #0d1117',right:-5,top:'50%',transform:'translateY(-50%)'}}/>
          </div>
        ))}
      </div>
      {data.logic&&<div style={{borderTop:'1px solid #1e2733',padding:'3px 10px 5px',color:'#1e3a5f',fontSize:8,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data.logic}</div>}
    </div>
  );
});
const iconBtn={background:'transparent',border:'none',color:'#475569',cursor:'pointer',fontSize:11,padding:'0 3px',lineHeight:1};
export default BlockNode;
