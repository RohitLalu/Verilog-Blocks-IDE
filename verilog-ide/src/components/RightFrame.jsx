import React,{useEffect,useRef}from'react';

// A panel that throws while drawing shows this instead of taking the whole window down with it.
class PanelGuard extends React.Component{
  constructor(p){super(p);this.state={error:null};}
  static getDerivedStateFromError(error){return{error};}
  componentDidUpdate(prev){if(prev.panel!==this.props.panel&&this.state.error)this.setState({error:null});}
  render(){
    if(!this.state.error)return this.props.children;
    return(<div style={{padding:16,color:'#f87171',fontSize:12,fontFamily:"'Space Grotesk',sans-serif",lineHeight:1.6}}>
      <b>This panel hit an error and was closed.</b><br/>{String(this.state.error.message||this.state.error)}<br/>
      <span style={{color:'#64748b'}}>Your design is safe. Please report this on GitHub (Issues) with what you clicked.</span><br/>
      <button onClick={this.props.onClose} style={{marginTop:8,background:'#1c0a0a',border:'1px solid #991b1b',color:'#f87171',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>Close panel</button>
    </div>);
  }
}
import useStore from'../store/graphStore.js';

// The right-hand frame: every opened tool panel is a tab (like Vivado's windows); drag the left edge to resize,
// double-click the edge to go back to the panel's own width. The width is remembered.
export const PANEL_LABELS={verilog:'</> Verilog',synthesis:'⚛ Yosys',sta:'◈ STA',testbench:'⚡ Testbench',simulator:'〰 Waveform',atpg:'◈ ATPG',formal:'⊨ Formal'};
const DEFAULT_WIDTH={verilog:390,synthesis:420,sta:400,testbench:380,simulator:680,atpg:440,formal:440};
const clampW=w=>Math.round(Math.max(300,Math.min(w,window.innerWidth-480)));

export default function RightFrame({children}){
  const{openPanels,activePanel,setActivePanel,closePanel,rightWidth,setRightWidth}=useStore();
  const drag=useRef(null),bar=useRef(null);
  // keep the tab in front visible when many are open
  useEffect(()=>{bar.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[activePanel,openPanels.length]);
  const width=clampW(rightWidth??DEFAULT_WIDTH[activePanel]??420);
  const startResize=e=>{
    e.preventDefault();drag.current={x:e.clientX,w:width};
    const move=ev=>setRightWidth(clampW(drag.current.w+(drag.current.x-ev.clientX)));
    const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);document.body.style.cursor='';};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);document.body.style.cursor='col-resize';
  };
  return(
    <div style={{width,flexShrink:0,display:'flex',flexDirection:'column',position:'relative',minHeight:0,background:'#0d1117',borderLeft:'1px solid #1e2733'}}>
      <div onMouseDown={startResize} onDoubleClick={()=>setRightWidth(null)} title="Drag to resize; double-click to reset"
        role="separator" aria-orientation="vertical" aria-label="Resize panel"
        style={{position:'absolute',left:-4,top:0,bottom:0,width:8,cursor:'col-resize',zIndex:6}}/>
      <div role="tablist" ref={bar} style={{display:'flex',gap:2,padding:'5px 6px 0',borderBottom:'1px solid #1e2733',background:'#0a0e18',overflowX:'auto',flexShrink:0}}>
        {openPanels.map(p=>{const on=p===activePanel;return(
          <div key={p} role="tab" aria-selected={on} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 6px 5px 10px',borderRadius:'6px 6px 0 0',
            background:on?'#0d1117':'transparent',border:`1px solid ${on?'#1e2733':'transparent'}`,borderBottom:'none',marginBottom:-1,whiteSpace:'nowrap'}}>
            <button onClick={()=>setActivePanel(p)} style={{background:'none',border:'none',color:on?'#e2e8f0':'#64748b',fontSize:11,cursor:'pointer',padding:0,fontFamily:"'Space Grotesk',sans-serif"}}>{PANEL_LABELS[p]||p}</button>
            <button onClick={()=>closePanel(p)} aria-label={`Close ${PANEL_LABELS[p]||p}`} title="Close"
              style={{background:'none',border:'none',color:'#475569',fontSize:13,cursor:'pointer',padding:'0 2px',lineHeight:1}}>×</button>
          </div>);})}
      </div>
      <div className="right-frame" style={{flex:1,display:'flex',minHeight:0}}>
        <PanelGuard panel={activePanel} onClose={()=>closePanel(activePanel)}>{children}</PanelGuard>
      </div>
    </div>
  );
}
