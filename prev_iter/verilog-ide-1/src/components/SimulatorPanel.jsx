import React, { useState, useMemo } from 'react';
import useStore from '../store/graphStore.js';
import WaveformViewer from './WaveformViewer.jsx';
import { runSimulation, buildStimulus, waveformToVCD } from '../simulator/EventSimulator.js';

const COLORS = ['#4ade80','#60a5fa','#f59e0b','#f472b6','#a78bfa','#38bdf8','#fb923c','#34d399','#facc15','#e879f9'];

function usePorts(nodes, edges) {
  return useMemo(() => {
    const by={},to={};edges.forEach(e=>{const n=e.data?.wireName||`w_${e.id}`;by[`${e.target}:${e.targetHandle}`]=n;to[`${e.source}:${e.sourceHandle}`]=n;});
    const seen=new Set(),ins=[],outs=[];
    nodes.forEach(node=>{
      node.data.ports?.inputs?.forEach(p=>{if(!by[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);ins.push({netId:sig,portName:p.name,width:p.width});}}});
      node.data.ports?.outputs?.forEach(p=>{if(!to[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);outs.push({netId:sig,portName:p.name,width:p.width});}}});
    });
    return{ins,outs};
  },[nodes,edges]);
}

export default function SimulatorPanel() {
  const { nodes, edges, testbenchInputs, pdkContext } = useStore();
  const { ins, outs } = usePorts(nodes, edges);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [dur, setDur] = useState(200);
  const [tab, setTab] = useState('waveform');
  const [vcd, setVcd] = useState('');

  const handleRun = () => {
    if (!nodes.length) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const stim = buildStimulus(ins, testbenchInputs, dur);
        const res  = runSimulation(nodes, edges, stim, pdkContext);
        setResult(res);
        setVcd(waveformToVCD(res.waveform, ins, outs));
        setTab('waveform');
      } catch (e) { console.error('Sim error:', e); }
      setRunning(false);
    }, 20);
  };

  const signals = useMemo(() => [...ins,...outs].map((p,i) => ({ netId:p.netId, label:p.portName||p.netId, color:COLORS[i%COLORS.length], width:p.width })), [ins,outs]);
  const endTime = result?.endTime ?? dur;

  return (
    <div style={{ width: 560, background: '#0d1117', borderLeft: '1px solid #1e2733', display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}>
      {/* Controls */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e2733', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 700 }}>⚡ JS Simulator</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#334155', fontSize: 11 }}>Duration:</span>
          <input type="number" min={10} max={10000} value={dur} onChange={e=>setDur(parseInt(e.target.value)||200)}
            style={{ background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#94a3b8',fontSize:11,padding:'3px 6px',width:70,fontFamily:"'JetBrains Mono',monospace",outline:'none' }}/>
          <span style={{ color: '#334155', fontSize: 10 }}>ns</span>
        </div>
        <div style={{ flex: 1 }} />
        {result && <span style={{ color:'#334155',fontSize:9.5,fontFamily:"'JetBrains Mono',monospace" }}>{result.eventCount} events · {result.wallTimeMs}ms</span>}
        <button onClick={handleRun} disabled={running||!nodes.length} style={{ background:'#0a2218',border:'1px solid #166534',borderRadius:6,color:'#4ade80',fontSize:12,fontWeight:600,padding:'5px 14px',cursor:!nodes.length?'not-allowed':'pointer',opacity:!nodes.length?.4:1 }}>
          {running ? '⟳ Running…' : '▶ Simulate'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e2733', flexShrink: 0 }}>
        {['waveform','log','vcd'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background:'transparent',border:'none',borderBottom:`2px solid ${tab===t?'#4ade80':'transparent'}`,color:tab===t?'#4ade80':'#334155',fontSize:11,padding:'6px 14px 7px',cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",textTransform:'capitalize' }}>
            {t === 'vcd' ? 'VCD' : t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'waveform' && (
          !result
            ? <div style={{ color:'#1e2733',fontSize:12,textAlign:'center',padding:30 }}>{nodes.length===0?'Add blocks to workspace first.':'Click ▶ Simulate to run the event-driven simulator.'}</div>
            : <WaveformViewer waveform={result.waveform} signals={signals} endTime={endTime} />
        )}

        {tab === 'log' && (
          <div style={{ flex:1,overflow:'auto',padding:12 }}>
            {result ? <SimLog result={result} signals={signals} /> : <div style={{ color:'#1e2733',fontSize:12 }}>Run simulation first.</div>}
          </div>
        )}

        {tab === 'vcd' && (
          <div style={{ flex:1,overflow:'auto',padding:12 }}>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8 }}>
              <span style={{ color:'#334155',fontSize:10,textTransform:'uppercase',letterSpacing:1 }}>wave.vcd</span>
              {vcd && <button onClick={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([vcd],{type:'text/plain'}));a.download='wave.vcd';a.click();}} style={{ background:'#161b27',border:'1px solid #1e2733',borderRadius:4,color:'#475569',fontSize:10,padding:'2px 8px',cursor:'pointer' }}>↓ Download</button>}
            </div>
            <pre style={{ background:'#050810',border:'1px solid #1e2733',borderRadius:6,padding:10,fontSize:9.5,lineHeight:1.7,color:'#334155',fontFamily:"'JetBrains Mono',monospace",whiteSpace:'pre',overflow:'auto',maxHeight:500 }}>
              {vcd || 'No VCD generated yet.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function SimLog({ result, signals }) {
  const transitions = [];
  signals.forEach(sig => {
    result.waveform?.get(sig.netId)?.forEach(pt => transitions.push({ time:pt.time, label:sig.label, value:pt.value, color:sig.color }));
  });
  transitions.sort((a,b) => a.time-b.time || a.label.localeCompare(b.label));
  return (
    <div>
      <div style={{ color:'#334155',fontSize:10,marginBottom:8 }}>{transitions.length} transitions · {result.eventCount} events · {result.wallTimeMs}ms</div>
      <table style={{ width:'100%',borderCollapse:'collapse',fontFamily:"'JetBrains Mono',monospace" }}>
        <thead><tr>{['Time','Signal','→'].map(h=><th key={h} style={{ color:'#1e2733',fontSize:9.5,textAlign:'left',padding:'3px 6px',borderBottom:'1px solid #111827' }}>{h}</th>)}</tr></thead>
        <tbody>
          {transitions.slice(0,300).map((t,i)=>(
            <tr key={i} style={{ borderBottom:'1px solid #0a0e18' }}>
              <td style={{ color:'#334155',fontSize:10,padding:'2px 6px' }}>{t.time}ns</td>
              <td style={{ color:'#475569',fontSize:10,padding:'2px 6px' }}>{t.label}</td>
              <td style={{ padding:'2px 6px' }}><span style={{ color:t.value==='x'?'#334155':t.value?t.color:'#64748b',fontSize:11,fontWeight:700 }}>{t.value==='x'?'X':t.value===1?'1':'0'}</span></td>
            </tr>
          ))}
          {transitions.length>300&&<tr><td colSpan={3} style={{ color:'#334155',fontSize:10,padding:'4px 6px' }}>… {transitions.length-300} more</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
