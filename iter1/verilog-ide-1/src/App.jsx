import React, { useEffect, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import BlockPanel from './components/BlockPanel.jsx';
import Workspace from './components/Workspace.jsx';
import VerilogPanel from './components/VerilogPanel.jsx';
import SynthesisPanel from './components/SynthesisPanel.jsx';
import TestbenchPanel from './components/TestbenchPanel.jsx';
import SimulatorPanel from './components/SimulatorPanel.jsx';
import STAPanel from './components/STAPanel.jsx';
import TutorialPanel from './components/TutorialPanel.jsx';
import Notifications from './components/Notifications.jsx';
import { CustomBlockBuilder, HierarchyExporter, PDKSelector } from './components/Modals.jsx';
import useStore from './store/graphStore.js';
import { loadPDK } from './pdk/pdkLoader.js';
import './App.css';

export default function App() {
  const {
    activePanel, showTutorial, showCustomBlockBuilder, showHierarchyExporter,
    selectedPDK, setCellsManifest, setPDKContext, userBlocks, testbenchMode,
  } = useStore();

  const [showPDKSelector, setShowPDKSelector] = useState(false);
  const [pdkReady, setPdkReady] = useState(false);

  useEffect(() => {
    async function init() {
      if (!selectedPDK) { setShowPDKSelector(true); return; }
      try {
        const ctx = await loadPDK(selectedPDK.id, selectedPDK.rootPath);
        setPDKContext(ctx);
        setCellsManifest([...ctx.cells, ...userBlocks]);
      } catch (e) {
        console.warn('PDK init:', e);
        setShowPDKSelector(true);
      }
      setPdkReady(true);
    }
    init();
  }, []); // eslint-disable-line

  const handlePDKComplete = async () => {
    setShowPDKSelector(false);
    const { selectedPDK: pdk, userBlocks: ub } = useStore.getState();
    if (pdk) {
      try {
        const ctx = await loadPDK(pdk.id, pdk.rootPath);
        setPDKContext(ctx);
        setCellsManifest([...ctx.cells, ...ub]);
      } catch { setCellsManifest([...ub]); }
    }
    setPdkReady(true);
  };

  const rightPanel = () => {
    if (showTutorial)                    return <TutorialPanel />;
    if (testbenchMode) {
      if (activePanel === 'simulator')   return <SimulatorPanel />;
      if (activePanel === 'sta')         return <STAPanel />;
      return <TestbenchPanel />;
    }
    if (activePanel === 'verilog')       return <VerilogPanel />;
    if (activePanel === 'synthesis')     return <SynthesisPanel />;
    if (activePanel === 'sta')           return <STAPanel />;
    if (activePanel === 'simulator')     return <SimulatorPanel />;
    return null;
  };

  return (
    <div className="app-root">
      <Toolbar onOpenPDKSelector={() => setShowPDKSelector(true)} />
      <div className="app-body">
        <BlockPanel />
        <Workspace />
        {rightPanel()}
      </div>
      {showPDKSelector      && <PDKSelector onComplete={handlePDKComplete} />}
      {showCustomBlockBuilder && <CustomBlockBuilder />}
      {showHierarchyExporter  && <HierarchyExporter />}
      <Notifications />
    </div>
  );
}
