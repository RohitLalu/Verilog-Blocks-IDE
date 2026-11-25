import React,{useEffect,useState}from'react';
import Toolbar from'./components/Toolbar.jsx';
import BlockPanel from'./components/BlockPanel.jsx';
import Workspace from'./components/Workspace.jsx';
import{VerilogPanel,SynthesisPanel,Notifications}from'./components/Panels.jsx';
import TestbenchPanel from'./components/TestbenchPanel.jsx';
import SimulatorPanel from'./components/SimulatorPanel.jsx';
import STAPanel from'./components/STAPanel.jsx';
import ATPGPanel from'./components/ATPGPanel.jsx';
import AssistantDock from'./components/AssistantDock.jsx';
import TutorialPanel from'./components/TutorialPanel.jsx';
import{CustomBlockBuilder,HierarchyExporter,PDKSelector}from'./components/Modals.jsx';
import ProjectBrowser from'./components/ProjectBrowser.jsx';
import ToolsModal from'./components/ToolsModal.jsx';
import RightFrame from'./components/RightFrame.jsx';
import FormalPanel from'./components/FormalPanel.jsx';
import useStore from'./store/graphStore.js';
import{loadPDK}from'./pdk/pdkLoader.js';
import'./App.css';

export default function App(){
  const{activePanel,showTutorial,showCustomBlockBuilder,showHierarchyExporter,
    showProjectBrowser,showTools,showAssistant,selectedPDK,setCellsManifest,setPDKContext,userBlocks}=useStore();

  const[showPDKSelector,setShowPDKSelector]=useState(false);

  useEffect(()=>{
    async function init(){
      if(!selectedPDK){setShowPDKSelector(true);return;}
      try{
        const ctx=await loadPDK(selectedPDK.id,selectedPDK.rootPath);
        setPDKContext(ctx);
        setCellsManifest([...ctx.cells,...userBlocks]);
      }catch(e){console.warn('PDK init:',e);setShowPDKSelector(true);}
    }
    init();
  },[]);// eslint-disable-line

  const handlePDKComplete=async()=>{
    setShowPDKSelector(false);
    const{selectedPDK:pdk,userBlocks:ub}=useStore.getState();
    if(pdk){
      try{const ctx=await loadPDK(pdk.id,pdk.rootPath);setPDKContext(ctx);setCellsManifest([...ctx.cells,...ub]);}
      catch{setCellsManifest([...ub]);}
    }
  };

  const assistantOpened=React.useRef(false);if(showAssistant)assistantOpened.current=true;

  // Right panel — driven by activePanel state
  const rightPanel=()=>{
    if(showTutorial)return<TutorialPanel/>;
    const panel={verilog:<VerilogPanel/>,synthesis:<SynthesisPanel/>,sta:<STAPanel/>,testbench:<TestbenchPanel/>,
      simulator:<SimulatorPanel/>,atpg:<ATPGPanel/>,formal:<FormalPanel/>}[activePanel];
    return panel?<RightFrame>{panel}</RightFrame>:null;
  };

  return(
    <div className="app-root">
      <Toolbar onOpenPDKSelector={()=>setShowPDKSelector(true)}/>
      <div className="app-body">
        <BlockPanel/>
        {/* the assistant floats over the canvas, beside whatever panel is open; once opened it stays mounted (closing keeps the chat) */}
        <div style={{position:'relative',flex:1,display:'flex',minWidth:0}}>
          <Workspace/>
          {(showAssistant||assistantOpened.current)&&<div style={{display:showAssistant?'contents':'none'}}><AssistantDock/></div>}
        </div>
        {rightPanel()}
      </div>
      {showPDKSelector&&<PDKSelector onComplete={handlePDKComplete}/>}
      {showCustomBlockBuilder&&<CustomBlockBuilder/>}
      {showHierarchyExporter&&<HierarchyExporter/>}
      {showProjectBrowser&&<ProjectBrowser/>}
      {showTools&&<ToolsModal/>}
      <Notifications/>
    </div>
  );
}
