import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { netName, edgeId, normalizeEdges, nextInstanceName, dedupeInstanceNames } from '../lib/netNaming.js';

const tryLS=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}};
const setLS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const MAX_HIST=60;
// React Flow reports one user deletion as several back-to-back change batches (node + attached
// edges). Only the first of them may open an undo step.
let removalPushed=false;
const pushHistoryOnce=get=>{if(removalPushed)return;removalPushed=true;queueMicrotask(()=>{removalPushed=false;});get()._pushHistory();};

const useStore=create((set,get)=>({
  // Graph
  nodes:[],edges:[],instanceCounter:{},_dragging:false,_nudgeAt:0,
  onNodesChange:(ch)=>{
    if(ch.some(c=>c.type==='remove'))pushHistoryOnce(get);
    // One undo step per drag gesture: snapshot when the drag starts, not on every pointer move
    const starting=ch.some(c=>c.type==='position'&&c.dragging===true);
    const ended=ch.some(c=>c.type==='position'&&c.dragging===false);
    if(starting&&!get()._dragging){get()._pushHistory();set({_dragging:true});}
    else if(ended&&get()._dragging)set({_dragging:false});
    // Arrow-key nudges arrive as position changes with dragging:false (a pointer drag ends without a position)
    else if(!get()._dragging&&ch.some(c=>c.type==='position'&&c.dragging===false&&c.position)){
      const now=Date.now();if(now-get()._nudgeAt>500)get()._pushHistory();set({_nudgeAt:now});}
    set({nodes:applyNodeChanges(ch,get().nodes)});
  },
  onEdgesChange:(ch)=>{
    if(ch.some(c=>c.type==='remove'))pushHistoryOnce(get);
    set({edges:applyEdgeChanges(ch,get().edges)});
  },
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
    const base=blockDef.module||blockDef.id;
    const{name:instanceName,index}=nextInstanceName(nodes.map(n=>n.data.instanceName),base,instanceCounter[base]||0);
    get()._pushHistory();
    set({nodes:[...nodes,{id:`node_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      type:'blockNode',position,data:{...blockDef,instanceName,paramValues:{}}}],
      instanceCounter:{...instanceCounter,[base]:index}});
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
    const used=nodes.map(n=>n.data.instanceName);
    const pasted=clipboard.nodes.map((old,i)=>{
      const{positionAbsolute,dragging,...rest}=old;
      const base=old.data.module||old.data.id;
      const{name,index}=nextInstanceName(used,base,counter[base]||0);
      counter[base]=index;used.push(name);
      const id=`node_${stamp}_${i}_${Math.random().toString(36).slice(2,5)}`;
      idMap[old.id]=id;
      return{...rest,id,selected:true,position:{x:old.position.x+off,y:old.position.y+off},
        data:{...old.data,instanceName:name,paramValues:{...old.data.paramValues}}};
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
  _paramEdit:{key:'',at:0},
  updateNodeParam:(nodeId,paramName,value)=>{
    // Typing fires per keystroke: open a new undo step only for a different field or after a pause
    const key=`${nodeId}:${paramName}`,now=Date.now(),last=get()._paramEdit;
    if(last.key!==key||now-last.at>1000)get()._pushHistory();
    set({_paramEdit:{key,at:now},nodes:get().nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,paramValues:{...n.data.paramValues,[paramName]:value}}}:n)});
  },
  // Replace the whole graph (open project). Repairs names/nets written by older versions.
  loadGraph:(graph)=>{
    get()._pushHistory();
    const{nodes,renamed}=dedupeInstanceNames(graph.nodes||[]);
    set({nodes,edges:normalizeEdges(nodes,graph.edges||[]),instanceCounter:{},pdkLocked:nodes.length>0});
    return{renamed};
  },

  // Undo/Redo — two stacks of {nodes,edges} snapshots. The state being left is always pushed
  // onto the opposite stack, so undo can never lose the latest work and redo can get back to it.
  _past:[],_future:[],
  _snap:()=>{const{nodes,edges}=get();return{nodes:JSON.parse(JSON.stringify(nodes)),edges:JSON.parse(JSON.stringify(edges))};},
  _pushHistory:()=>set({_past:[...get()._past,get()._snap()].slice(-MAX_HIST),_future:[]}),
  undo:()=>{
    const{_past,_future}=get();if(!_past.length)return;
    const prev=_past[_past.length-1];
    set({_future:[..._future,get()._snap()].slice(-MAX_HIST),_past:_past.slice(0,-1),
      nodes:prev.nodes,edges:prev.edges,pdkLocked:prev.nodes.length>0,_dragging:false});
  },
  redo:()=>{
    const{_past,_future}=get();if(!_future.length)return;
    const next=_future[_future.length-1];
    set({_past:[..._past,get()._snap()].slice(-MAX_HIST),_future:_future.slice(0,-1),
      nodes:next.nodes,edges:next.edges,pdkLocked:next.nodes.length>0,_dragging:false});
  },
  canUndo:()=>get()._past.length>0,
  canRedo:()=>get()._future.length>0,

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
