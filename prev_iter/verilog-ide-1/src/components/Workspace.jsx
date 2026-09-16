import React, { useCallback, useRef } from 'react';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from 'reactflow';
import 'reactflow/dist/style.css';
import BlockNode from './BlockNode.jsx';
import useStore from '../store/graphStore.js';

const nodeTypes = { blockNode: BlockNode };

function WorkspaceInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addBlock, setPDKLocked } = useStore();
  const wrapRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDrop = useCallback(e => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/blockdef');
    if (!raw) return;
    const blockDef = JSON.parse(raw);
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addBlock(blockDef, { x: pos.x - 75, y: pos.y - 40 });
    setPDKLocked(true);
  }, [screenToFlowPosition, addBlock, setPDKLocked]);

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  return (
    <div ref={wrapRef} style={{ flex: 1, height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        nodeTypes={nodeTypes} fitView deleteKeyCode="Delete" multiSelectionKeyCode="Shift"
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 1.5 }}
        defaultEdgeOptions={{ style: { stroke: '#3b82f6', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#3b82f6' } }}
      >
        <Background color="#141e2e" gap={20} size={1} variant="dots" />
        <Controls style={{ background: '#161b27', border: '1px solid #1e2733', borderRadius: 7 }} />
        <MiniMap style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 7 }}
          nodeColor={n => n.data?.color || '#1e2733'} maskColor="#0d111788" />
        {nodes.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            textAlign: 'center', pointerEvents: 'none', fontFamily: "'Space Grotesk',sans-serif" }}>
            <div style={{ fontSize: 52, opacity: 0.06, marginBottom: 12 }}>⬡</div>
            <div style={{ color: '#1e2733', fontSize: 15, fontWeight: 600 }}>Workspace</div>
            <div style={{ color: '#161e2e', fontSize: 11, marginTop: 5 }}>Drag cells from the left panel · connect ports to wire</div>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

export default function Workspace() {
  return <ReactFlowProvider><WorkspaceInner /></ReactFlowProvider>;
}
