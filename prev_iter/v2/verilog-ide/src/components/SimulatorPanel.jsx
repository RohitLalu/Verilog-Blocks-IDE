/**
 * SimulatorPanel.jsx
 *
 * Unified simulation results panel — Docker/localhost mode.
 * iverilog is always available, so this is purely a VCD viewer
 * fed from the iverilog run triggered by TestbenchPanel.
 *
 * No JS simulator display here.  The JS event simulator code still
 * exists in src/simulator/ and is used by STAPanel for timing data,
 * but its waveform output is not surfaced as a separate UI anymore.
 */
import React from 'react';
import useStore from '../store/graphStore.js';
import VCDViewer from './VCDViewer.jsx';

export default function SimulatorPanel() {
  const { lastVCD, simOutput, simRunning, setActivePanel } = useStore();

  // ── No VCD yet ────────────────────────────────────────────────────────────
  if (!lastVCD) {
    return (
      <div style={wrap}>
        <Hdr />
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
          <div style={{ fontSize:40, opacity:.1 }}>⬡</div>
          <div style={{ color:'#334155', fontSize:14, fontWeight:600, textAlign:'center' }}>
            No simulation results yet
          </div>
          <div style={{ color:'#1e2733', fontSize:12, textAlign:'center', lineHeight:1.8 }}>
            Configure stimulus in <strong style={{color:'#f472b6'}}>◈ Testbench</strong>,<br/>
            then click <strong style={{color:'#4ade80'}}>▶ iverilog</strong> to run.
          </div>
          <button
            onClick={() => setActivePanel('testbench')}
            style={{ background:'#0a2218', border:'1px solid #166534', borderRadius:6,
              color:'#4ade80', fontSize:12, fontWeight:600, padding:'8px 20px', cursor:'pointer' }}>
            ← Go to Testbench
          </button>
          {simOutput && (
            <div style={{ width:'100%', marginTop:16 }}>
              <div style={{ color:'#334155', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                Last run output
              </div>
              <pre style={preStyle}>{simRunning ? '⟳ Running…' : simOutput}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── VCD available — show full viewer ──────────────────────────────────────
  return (
    <div style={wrap}>
      <Hdr />
      {/* Console output collapsible strip above waveform */}
      {simOutput && (
        <details style={{ background:'#0a0e18', borderBottom:'1px solid #1e2733', flexShrink:0 }}>
          <summary style={{ padding:'5px 14px', color:'#334155', fontSize:10, cursor:'pointer',
            letterSpacing:1, textTransform:'uppercase', listStyle:'none', userSelect:'none' }}>
            ▸ Console output
          </summary>
          <pre style={{ ...preStyle, maxHeight:120, margin:0, borderRadius:0, border:'none',
            borderTop:'1px solid #1e2733' }}>
            {simOutput}
          </pre>
        </details>
      )}
      {/* Full VCD viewer takes remaining space */}
      <div style={{ flex:1, overflow:'hidden' }}>
        <VCDViewer vcdText={lastVCD} />
      </div>
    </div>
  );
}

function Hdr() {
  const { lastVCD, setLastVCD, simOutput } = useStore();
  const downloadVCD = () => {
    if (!lastVCD) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lastVCD], { type: 'text/plain' }));
    a.download = 'wave.vcd'; a.click();
  };
  return (
    <div style={{ padding:'8px 14px', borderBottom:'1px solid #1e2733', display:'flex',
      alignItems:'center', gap:10, flexShrink:0 }}>
      <span style={{ color:'#4ade80', fontSize:12, fontWeight:700 }}>📊 Simulation Results</span>
      <span style={{ color:'#334155', fontSize:10, fontFamily:"'JetBrains Mono',monospace" }}>
        iverilog → VCD
      </span>
      <div style={{ flex:1 }} />
      {lastVCD && <>
        <button onClick={downloadVCD} style={smallBtn}>↓ wave.vcd</button>
        <button onClick={() => setLastVCD(null)}
          style={{ ...smallBtn, color:'#475569' }}>✕ Clear</button>
      </>}
    </div>
  );
}

const wrap = {
  width: 680, background: '#0d1117', borderLeft: '1px solid #1e2733',
  display: 'flex', flexDirection: 'column', flexShrink: 0, fontFamily: "'Space Grotesk',sans-serif",
};
const preStyle = {
  background: '#050810', border: '1px solid #1e2733', borderRadius: 6,
  padding: 10, margin: 0, fontSize: 10, lineHeight: 1.75, color: '#334155',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  fontFamily: "'JetBrains Mono',monospace", overflowY: 'auto',
};
const smallBtn = {
  background: '#161b27', border: '1px solid #1e2733', borderRadius: 4,
  color: '#60a5fa', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
  fontFamily: "'JetBrains Mono',monospace",
};
