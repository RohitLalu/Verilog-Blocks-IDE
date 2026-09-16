import React,{useEffect,useState}from'react';
import Toolbar from'./components/Toolbar.jsx';
import BlockPanel from'./components/BlockPanel.jsx';
import Workspace from'./components/Workspace.jsx';
import{VerilogPanel,SynthesisPanel,Notifications}from'./components/Panels.jsx';
import TestbenchPanel from'./components/TestbenchPanel.jsx';
import SimulatorPanel from'./components/SimulatorPanel.jsx';
import STAPanel from'./components/STAPanel.jsx';
import ATPGPanel from'./components/ATPGPanel.jsx';
import TutorialPanel from'./components/TutorialPanel.jsx';
import{CustomBlockBuilder,HierarchyExporter,PDKSelector}from'./components/Modals.jsx';
import ProjectBrowser from'./components/ProjectBrowser.jsx';
import useStore from'./store/graphStore.js';
import{loadPDK}from'./pdk/pdkLoader.js';
import'./App.css';

export default function App(){
  const{activePanel,showTutorial,showCustomBlockBuilder,showHierarchyExporter,
    showProjectBrowser,selectedPDK,setCellsManifest,setPDKContext,userBlocks}=useStore();

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

  // Right panel — driven by activePanel state
  const rightPanel=()=>{
    if(showTutorial)return<TutorialPanel/>;
    switch(activePanel){
      case'verilog':    return<VerilogPanel/>;
      case'synthesis':  return<SynthesisPanel/>;
      case'sta':        return<STAPanel/>;
      case'testbench':  return<TestbenchPanel/>;
      case'simulator':  return<SimulatorPanel/>;
      case'atpg':       return<ATPGPanel/>;
      default:          return null;
    }
  };

  return(
    <div className="app-root">
      <Toolbar onOpenPDKSelector={()=>setShowPDKSelector(true)}/>
      <div className="app-body">
        <BlockPanel/>
        <Workspace/>
        {rightPanel()}
      </div>
      {showPDKSelector&&<PDKSelector onComplete={handlePDKComplete}/>}
      {showCustomBlockBuilder&&<CustomBlockBuilder/>}
      {showHierarchyExporter&&<HierarchyExporter/>}
      {showProjectBrowser&&<ProjectBrowser/>}
      <Notifications/>
    </div>
  );
}
