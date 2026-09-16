import React,{useState}from'react';
import useStore from'../store/graphStore.js';
import{generateVerilog,generateTestbench}from'../codegen/graphToVerilog.js';

const mk=x=>({border:'1px solid #1e2733',borderRadius:6,fontSize:11,padding:'5px 11px',cursor:'pointer',
  fontFamily:"'Space Grotesk',sans-serif",fontWeight:500,display:'flex',alignItems:'center',gap:5,
  transition:'all .12s',whiteSpace:'nowrap',...x});
const B={
  ghost:  mk({background:'#161b27',color:'#64748b'}),
  green:  mk({background:'#0a2218',border:'1px solid #166534',color:'#4ade80'}),
  yellow: mk({background:'#1c1508',border:'1px solid #92400e',color:'#fbbf24'}),
  purple: mk({background:'#160f2e',border:'1px solid #5b21b6',color:'#c084fc'}),
  red:    mk({background:'#1c0a0a',border:'1px solid #991b1b',color:'#f87171'}),
  cyan:   mk({background:'#041e2e',border:'1px solid #0e7490',color:'#38bdf8'}),
  amber:  mk({background:'#1c1508',border:'1px solid #92400e',color:'#f59e0b'}),
};

export default function Toolbar({ onOpenPDKSelector }) {
  const {
    nodes, edges, activePanel, setActivePanel,
    setGeneratedVerilog, setGeneratedTestbench,
    setSynthesisOutput, setSynthesisRunning, synthesisRunning,
    simRunning, errors, setErrors,
    projectName, setProjectName,
    selectedPDK, pdkContext, pdkLocked, clearGraph,
    pushNotification, undo, redo, canUndo, canRedo,
    setStaSlack, atpgRunning,
  } = useStore();

  const [editing, setEditing] = useState(false);
  const [badge,   setBadge]   = useState('');

  // Generate Verilog and store it (returns the code)
  const doGenV = () => {
    const { verilog, errors: errs } = generateVerilog(nodes, edges, projectName, pdkContext);
    setGeneratedVerilog(verilog); setErrors(errs); return verilog;
  };

  const handleVerilog = () => { doGenV(); setActivePanel('verilog'); };

  const handleSave = async () => {
    const verilog = doGenV();
    if (window.api) {
      await window.api.project.save({ name:projectName, graph:{nodes,edges}, verilog, meta:{pdkId:selectedPDK?.id} });
      setBadge('✓ Saved');
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([verilog],{type:'text/plain'}));
      a.download = 'top.v'; a.click(); setBadge('✓ Downloaded');
    }
    setTimeout(() => setBadge(''), 2200);
  };

  const handleYosys = async () => {
    const verilog = doGenV(); setSynthesisRunning(true); setActivePanel('synthesis');
    if (window.api) {
      const res = await window.api.yosys.synth({ projectName, verilog, pdkRoot:selectedPDK?.rootPath, pdkId:selectedPDK?.id });
      setSynthesisOutput(res.output);
      pushNotification(res.ok ? 'Synthesis complete ✓' : 'Synthesis failed', res.ok ? 'success' : 'error');
    } else {
      setSynthesisOutput('⚠ Yosys requires Docker backend.\ndocker compose up -d');
    }
    setSynthesisRunning(false);
  };

  // ⚡ Run: generate Verilog → navigate to testbench panel where ▶ iverilog lives.
  // The actual iverilog run + VCD auto-navigation happens inside TestbenchPanel.
  const handleSim = () => {
    doGenV();
    setActivePanel('testbench');
    pushNotification('Verilog generated — click ▶ iverilog to simulate', 'info');
  };

  const isLocked  = pdkLocked || nodes.length > 0;
  const errCount  = errors.length;

  return (
    <div style={{ height:50, background:'#090e18', borderBottom:'1px solid #1a2030',
      display:'flex', alignItems:'center', padding:'0 10px', gap:5, flexShrink:0 }}>

      <div style={{ color:'#38bdf8', fontSize:14, fontWeight:800,
        fontFamily:"'JetBrains Mono',monospace", marginRight:4, letterSpacing:-1 }}>⬡ VBiDE</div>

      {/* PDK selector */}
      {selectedPDK ? (
        <button onClick={onOpenPDKSelector} title={isLocked ? 'PDK locked (clear canvas to change)' : 'Change PDK'}
          style={{ background:`${selectedPDK.color}18`, border:`1px solid ${selectedPDK.color}44`,
            borderRadius:5, color:selectedPDK.color, fontSize:10, fontWeight:700,
            padding:'3px 9px', cursor:isLocked ? 'not-allowed' : 'pointer',
            fontFamily:"'JetBrains Mono',monospace", opacity:isLocked ? 0.6 : 1 }}>
          {selectedPDK.id.toUpperCase()} {isLocked ? '🔒' : '▾'}
        </button>
      ) : (
        <button onClick={onOpenPDKSelector} style={{...B.red, fontSize:11}}>⚠ Select PDK</button>
      )}

      <div style={{ width:1, height:22, background:'#1e2733', margin:'0 2px' }} />

      {/* Project name */}
      {editing ? (
        <input autoFocus value={projectName}
          onChange={e => setProjectName(e.target.value.replace(/[^a-zA-Z0-9_]/g,'_'))}
          onBlur={() => setEditing(false)}
          onKeyDown={e => e.key==='Enter' && setEditing(false)}
          style={{ background:'#161b27', border:'1px solid #3b82f6', borderRadius:5,
            color:'#e2e8f0', fontSize:12, padding:'3px 8px', width:150,
            fontFamily:"'JetBrains Mono',monospace", outline:'none' }} />
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ background:'transparent', border:'none', color:'#334155',
            fontSize:12, cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", padding:'2px 4px' }}>
          {projectName}/
        </button>
      )}

      {/* Undo / Redo */}
      <button onClick={undo} title="Undo Ctrl+Z" disabled={!canUndo()}
        style={{ ...B.ghost, padding:'4px 8px', opacity:canUndo()?1:0.3, fontSize:14 }}>↩</button>
      <button onClick={redo} title="Redo Ctrl+Y" disabled={!canRedo()}
        style={{ ...B.ghost, padding:'4px 8px', opacity:canRedo()?1:0.3, fontSize:14 }}>↪</button>

      <div style={{ flex:1 }} />

      {/* Stats */}
      <span style={{ color:'#1e2d3d', fontSize:9.5, fontFamily:"'JetBrains Mono',monospace" }}>
        {nodes.length}b·{edges.length}w
      </span>
      <div style={{ width:1, height:22, background:'#1e2733' }} />

      {/* Panel buttons */}
      <button onClick={handleVerilog}  style={B.ghost}>{'</>'}</button>
      <button onClick={handleYosys}    disabled={synthesisRunning}
        style={{ ...B.purple, opacity:synthesisRunning ? 0.6 : 1 }}>
        {synthesisRunning ? '⟳' : '⚛'} Yosys
      </button>
      <button onClick={() => setActivePanel('sta')} style={B.cyan}>◈ STA</button>

      {/* ⚡ Sim — navigates to testbench, iverilog run is triggered there */}
      <button onClick={handleSim} disabled={simRunning}
        style={{ ...B.green, opacity:simRunning ? 0.6 : 1 }}>
        {simRunning ? '⟳' : '⚡'} Sim
      </button>

      {/* ◈ ATPG — atalanta */}
      <button onClick={() => { doGenV(); setActivePanel('atpg'); }}
        disabled={atpgRunning}
        style={{ ...B.amber, opacity:atpgRunning ? 0.6 : 1 }}>
        {atpgRunning ? '⟳' : '◈'} ATPG
      </button>

      <div style={{ width:1, height:22, background:'#1e2733' }} />

      <button onClick={handleSave} style={B.yellow}>↓ Save</button>

      {errCount > 0 && (
        <button onClick={() => setActivePanel('synthesis')} style={B.red}>⚠ {errCount}</button>
      )}
      <button onClick={clearGraph}
        style={{ ...B.ghost, border:'none', color:'#2d3748', fontSize:14 }}>✕</button>

      {badge && (
        <span style={{ color:'#4ade80', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>
          {badge}
        </span>
      )}
    </div>
  );
}
