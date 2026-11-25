import React from'react';
import{BaseEdge,EdgeLabelRenderer,getBezierPath}from'reactflow';
import useStore from'../store/graphStore.js';

// A wire: its net name at the middle, and a × to delete it while it is selected (click a wire to select it;
// double-click deletes it straight away; Delete/Backspace also work). Deleting goes through onEdgesChange, so undo works.
export default function WireEdge({id,sourceX,sourceY,targetX,targetY,sourcePosition,targetPosition,style,markerEnd,label,selected}){
  const onEdgesChange=useStore(s=>s.onEdgesChange);
  const[path,lx,ly]=getBezierPath({sourceX,sourceY,sourcePosition,targetX,targetY,targetPosition});
  const remove=e=>{e.stopPropagation();onEdgesChange([{type:'remove',id}]);};
  return(<>
    <BaseEdge path={path} markerEnd={markerEnd} interactionWidth={16}
      style={{...style,...(selected?{stroke:'#f472b6',strokeWidth:2.2}:{})}}/>
    <EdgeLabelRenderer>
      <div className="nodrag nopan" style={{position:'absolute',transform:`translate(-50%,-50%) translate(${lx}px,${ly}px)`,
        display:'flex',alignItems:'center',gap:4,pointerEvents:'all'}}>
        {label&&<span onClick={e=>{e.stopPropagation();onEdgesChange([{type:'select',id,selected:true}]);}} title="Click to select this wire"
          style={{cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:selected?'#f472b6':'#475569',
          background:'#0d1117d9',padding:'1px 3px',borderRadius:2}}>{label}</span>}
        {selected&&<button onClick={remove} title="Delete this wire" aria-label={`Delete wire ${label||''}`}
          style={{width:16,height:16,borderRadius:8,border:'1px solid #9d174d',background:'#2a0f24',color:'#f472b6',
            fontSize:11,lineHeight:'13px',padding:0,cursor:'pointer'}}>×</button>}
      </div>
    </EdgeLabelRenderer>
  </>);
}
