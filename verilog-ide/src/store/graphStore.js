import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { netName, edgeId } from '../lib/netNaming.js';

const tryLS=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}};
const setLS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const MAX_HIST=60;

const useStore=create((set,get)=>({
  // Graph
  nodes:[],edges:[],instanceCounter:{},
  onNodesChange:(ch)=>set({nodes:applyNodeChanges(ch,get().nodes)}),
  onEdgesChange:(ch)=>set({edges:applyEdgeChanges(ch,get().edges)}),
  onConnect:(conn)=>{
    const{edges,nodes,pushNotification}=get();
    const src=nodes.find(n=>n.id===conn.source),tgt=nodes.find(n=>n.id===conn.target);
    if(!src||!tgt||!conn.sourceHandle||!conn.targetHandle)return;
    // Bit-width validation (a port with no declared width is 1-bit)
    const sp=src.data.ports?.outputs?.find(p=>p.name===conn.sourceHandle);
    const tp=tgt.data.ports?.inputs?.find(p=>p.name===conn.targetHandle);
    const sw=sp?.width||1,tw=tp?.width||1;
    if(sw!==tw){pushNotification(`Width mismatch: ${src.data.instanceName}.${conn.sourceHandle} is ${sw}-bit, ${tgt.data.instanceName}.${conn.targetHandle} is ${tw}-bit`,'error');return;}
    // An input can only have one driver
    if(edges.some(e=>e.target===conn.target&&e.targetHandle===conn.targetHandle)){
      pushNotification(`${tgt.data.instanceName}.${conn.targetHandle} already has a driver`,'warn');return;}
    // One net per driver: fan-out edges from the same output share the same wire name
    const wireName=netName(src,conn.sourceHandle);
    get()._pushHistory();
    set({edges:addEdge({...conn,id:edgeId(conn),data:{wireName},animated:false,
      style:{stroke:'#3b82f6',strokeWidth:1.5},markerEnd:{type:'arrowclosed',color:'#3b82f6'},
      label:wireName,labelStyle:{fill:'#475569',fontSize:8,fontFamily:'JetBrains Mono'},
      labelBgStyle:{fill:'#0d1117',fillOpacity:0.85}},edges)});
  },
  addBlock:(blockDef,position)=>{
    const{nodes,instanceCounter}=get();
    const count=(instanceCounter[blockDef.id]||0)+1;
    const instanceName=`${blockDef.module||blockDef.id}_${count}`;
    get()._pushHistory();
    set({nodes:[...nodes,{id:`node_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      type:'blockNode',position,data:{...blockDef,instanceName,paramValues:{}}}],
      instanceCounter:{...instanceCounter,[blockDef.id]:count}});
  },
  removeNode:(id)=>{get()._pushHistory();set({nodes:get().nodes.filter(n=>n.id!==id),edges:get().edges.filter(e=>e.source!==id&&e.target!==id)});},
  clearGraph:()=>{get()._pushHistory();set({nodes:[],edges:[],instanceCounter:{},pdkLocked:false});},
  // Copy / paste
  clipboard:null,
  copySelection:()=>{
    const{nodes,edges}=get();
    const sel=nodes.filter(n=>n.selected);
    if(!sel.length)return 0;
    const ids=new Set(sel.map(n=>n.id));
    set({clipboard:{nodes:JSON.parse(JSON.stringify(sel)),
      edges:JSON.parse(JSON.stringify(edges.filter(e=>ids.has(e.source)&&ids.has(e.target)))),pasteCount:0}});
    return sel.length;
  },
  pasteClipboard:()=>{
    const{clipboard,nodes,edges,instanceCounter}=get();
    if(!clipboard||!clipboard.nodes.length)return 0;
    const step=clipboard.pasteCount+1,off=30*step;
    const counter={...instanceCounter},idMap={},stamp=Date.now();
    const pasted=clipboard.nodes.map((old,i)=>{
      const{positionAbsolute,dragging,...rest}=old;
      const count=(counter[old.data.id]||0)+1;counter[old.data.id]=count;
      const id=`node_${stamp}_${i}_${Math.random().toString(36).slice(2,5)}`;
      idMap[old.id]=id;
      return{...rest,id,selected:true,position:{x:old.position.x+off,y:old.position.y+off},
        data:{...old.data,instanceName:`${old.data.module||old.data.id}_${count}`,paramValues:{...old.data.paramValues}}};
    });
    const byId=new Map(pasted.map(n=>[n.id,n]));
    const pastedEdges=clipboard.edges.map(e=>{
      const c={source:idMap[e.source],target:idMap[e.target],sourceHandle:e.sourceHandle,targetHandle:e.targetHandle};
      const wireName=netName(byId.get(c.source),c.sourceHandle);
      return{...e,...c,id:edgeId(c),selected:false,label:wireName,data:{...e.data,wireName}};
    });
    get()._pushHistory();
    set({nodes:[...nodes.map(n=>n.selected?{...n,selected:false}:n),...pasted],edges:[...edges,...pastedEdges],
      instanceCounter:counter,pdkLocked:true,clipboard:{...clipboard,pasteCount:step}});
    return pasted.length;
  },
  updateNodeParam:(nodeId,paramName,value)=>set({nodes:get().nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,paramValues:{...n.data.paramValues,[paramName]:value}}}:n)}),

  // Undo/Redo
  _history:[],_histIdx:-1,
  _pushHistory:()=>{
    const{nodes,edges,_history,_histIdx}=get();
    const snap={nodes:JSON.parse(JSON.stringify(nodes)),edges:JSON.parse(JSON.stringify(edges))};
    const h=[..._history.slice(0,_histIdx+1),snap].slice(-MAX_HIST);
    set({_history:h,_histIdx:h.length-1});
  },
  undo:()=>{const{_history,_histIdx}=get();if(_histIdx<=0)return;const s=_history[_histIdx-1];set({nodes:s.nodes,edges:s.edges,_histIdx:_histIdx-1});},
  redo:()=>{const{_history,_histIdx}=get();if(_histIdx>=_history.length-1)return;const s=_history[_histIdx+1];set({nodes:s.nodes,edges:s.edges,_histIdx:_histIdx+1});},
  canUndo:()=>get()._histIdx>0,
  canRedo:()=>get()._histIdx<get()._history.length-1,

  // PDK
  selectedPDK:tryLS('vbide_pdk',null),pdkContext:null,pdkLocked:false,
  setSelectedPDK:(p)=>{setLS('vbide_pdk',p);set({selectedPDK:p});},
  setPDKContext:(c)=>set({pdkContext:c}),
  setPDKLocked:(v)=>set({pdkLocked:v}),

  // Library
  cellsManifest:[],setCellsManifest:(m)=>set({cellsManifest:m}),
  userBlocks:tryLS('vbide_user_blocks',[]),
  saveUserBlock:(b)=>{const u=[...get().userBlocks.filter(x=>x.id!==b.id),b];setLS('vbide_user_blocks',u);set({userBlocks:u});},
  deleteUserBlock:(id)=>{const u=get().userBlocks.filter(b=>b.id!==id);setLS('vbide_user_blocks',u);set({userBlocks:u});},

  // STA slack for canvas colouring
  staSlack:{},setStaSlack:(m)=>set({staSlack:m}),clearStaSlack:()=>set({staSlack:{}}),

  // UI
  activePanel:'blocks',setActivePanel:(p)=>set({activePanel:p}),
  generatedVerilog:'',setGeneratedVerilog:(c)=>set({generatedVerilog:c}),
  synthesisOutput:'',setSynthesisOutput:(o)=>set({synthesisOutput:o}),
  synthesisRunning:false,setSynthesisRunning:(v)=>set({synthesisRunning:v}),
  errors:[],setErrors:(e)=>set({errors:e}),
  projectName:'my_project',setProjectName:(n)=>set({projectName:n}),
  tutorialBlock:null,setTutorialBlock:(b)=>set({tutorialBlock:b}),
  showTutorial:false,setShowTutorial:(v)=>set({showTutorial:v}),

  // Testbench + simulation
  testbenchMode:false,setTestbenchMode:(v)=>set({testbenchMode:v}),
  testbenchInputs:{},
  setTestbenchInput:(p,cfg)=>set({testbenchInputs:{...get().testbenchInputs,[p]:cfg}}),
  clearTestbenchInputs:()=>set({testbenchInputs:{}}),
  generatedTestbench:'',setGeneratedTestbench:(c)=>set({generatedTestbench:c}),
  customTestbench:'',setCustomTestbench:(c)=>set({customTestbench:c}),
  useCustomTestbench:false,setUseCustomTestbench:(v)=>set({useCustomTestbench:v}),

  // iverilog results — single source of truth for simulation output
  simOutput:'',setSimOutput:(o)=>set({simOutput:o}),
  simRunning:false,setSimRunning:(v)=>set({simRunning:v}),
  lastVCD:null,setLastVCD:(v)=>set({lastVCD:v}),   // VCD string from last iverilog run

  // ATPG
  atpgResult:null,setAtpgResult:(r)=>set({atpgResult:r}),
  atpgRunning:false,setAtpgRunning:(v)=>set({atpgRunning:v}),

  // Modals / panels
  showHierarchyExporter:false,setShowHierarchyExporter:(v)=>set({showHierarchyExporter:v}),
  showCustomBlockBuilder:false,setShowCustomBlockBuilder:(v)=>set({showCustomBlockBuilder:v}),
  showProjectBrowser:false,setShowProjectBrowser:(v)=>set({showProjectBrowser:v}),

  customBlockDraft:{id:'',label:'',symbol:'',module:'',color:'#a78bfa',category:'custom',description:'',tutorial:'',verilogCode:'',ports:{inputs:[{name:'A',width:1}],outputs:[{name:'X',width:1}]}},
  setCustomBlockDraft:(d)=>set({customBlockDraft:{...get().customBlockDraft,...d}}),
  resetCustomBlockDraft:()=>set({customBlockDraft:{id:'',label:'',symbol:'',module:'',color:'#a78bfa',category:'custom',description:'',tutorial:'',verilogCode:'',ports:{inputs:[{name:'A',width:1}],outputs:[{name:'X',width:1}]}}}),

  // Notifications
  notifications:[],
  pushNotification:(msg,type='info')=>{const id=Date.now();set({notifications:[...get().notifications,{id,msg,type}]});setTimeout(()=>set({notifications:get().notifications.filter(n=>n.id!==id)}),4000);},
  dismissNotification:(id)=>set({notifications:get().notifications.filter(n=>n.id!==id)}),
}));

export default useStore;
