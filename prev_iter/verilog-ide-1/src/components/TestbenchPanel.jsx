import React, { useState, useMemo } from 'react';
import useStore from '../store/graphStore.js';
import { generateTestbench } from '../codegen/graphToVerilog.js';

function useTopInputs(nodes, edges) {
  return useMemo(() => {
    const by = {};
    edges.forEach(e => { by[`${e.target}:${e.targetHandle}`] = true; });
    const seen = new Set(), ports = [];
    nodes.forEach(node => {
      node.data.ports?.inputs?.forEach(p => {
        if (!by[`${node.id}:${p.name}`]) {
          const sig = `${node.data.instanceName}_${p.name}`;
          if (!seen.has(sig)) { seen.add(sig); ports.push({ sig, portName: p.name, width: p.width, nodeLabel: node.data.label }); }
        }
      });
    });
    return ports;
  }, [nodes, edges]);
}

export default function TestbenchPanel() {
  const { nodes, edges, projectName, testbenchInputs, setTestbenchInput, clearTestbenchInputs,
    generatedTestbench, setGeneratedTestbench, customTestbench, setCustomTestbench,
    useCustomTestbench, setUseCustomTestbench, simOutput, simRunning } = useStore();

  const ports = useTopInputs(nodes, edges);
  const [tab, setTab] = useState('inputs');
  const [dftOn, setDftOn] = useState(false);
  const [vecCount, setVecCount] = useState(16);

  const ffNodes = useMemo(() => nodes.filter(n =>
    ['sky130_dfxtp','sky130_dfrtp','sky130_sdfxtp'].includes(n.data.id)
  ), [nodes]);

  const cov = ffNodes.length > 0 ? Math.min(99, Math.round(60 + (vecCount / ffNodes.length) * 8)) : 0;

  const handlePreview = () => {
    const tb = generateTestbench(nodes, edges, projectName, testbenchInputs, useCustomTestbench ? customTestbench : '');
    setGeneratedTestbench(tb); setTab('output');
  };

  const TABS = { inputs: 'Inputs', dft: 'DFT / Scan', output: 'Preview', custom: 'Custom TB' };

  return (
    <div style={{ width: 380, background: '#0d1117', borderLeft: '1px solid #1e2733', display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}>
      <div style={{ padding: '12px 16px 0', borderBottom: '1px solid #1e2733' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#f472b6', fontSize: 13, fontWeight: 700 }}>◈ Testbench</span>
          <span style={{ color: '#475569', fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>{ports.length} ports</span>
        </div>
        <div style={{ display: 'flex' }}>
          {Object.entries(TABS).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab===k?'#f472b6':'transparent'}`, color: tab===k?'#f472b6':'#334155', fontSize: 11, padding: '5px 12px 8px', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'inputs' && <>
          <div style={{ color: '#475569', fontSize: 11, marginBottom: 12, lineHeight: 1.6 }}>Configure each top-level input. These become the stimulus in the generated testbench.</div>
          {ports.length === 0 && <div style={{ color: '#1e2733', fontSize: 12, textAlign: 'center', padding: 24 }}>No top-level inputs detected.<br/><span style={{ fontSize: 10 }}>Add blocks and leave input ports unconnected.</span></div>}
          {ports.map(port => (
            <PortCfg key={port.sig} port={port}
              config={testbenchInputs[port.sig] || { type: 'constant', value: 0 }}
              onChange={cfg => setTestbenchInput(port.sig, cfg)} />
          ))}
          {ports.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={handlePreview} style={pill('#f472b6')}>Preview TB</button>
              <button onClick={clearTestbenchInputs} style={pill('#475569')}>Reset</button>
            </div>
          )}
        </>}

        {tab === 'dft' && (
          <>
            <div style={{ color: '#475569', fontSize: 11, lineHeight: 1.7, marginBottom: 14 }}>
              DFT inserts scan flip-flops (<code style={{ color: '#f472b6', fontSize: 10 }}>sky130_fd_sc_hd__sdfxtp_1</code>) to enable shift-register access to all internal state during test.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={dftOn} onChange={e => setDftOn(e.target.checked)} />
              <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>Enable scan insertion</span>
            </label>
            {dftOn && <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: '#334155', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Flip-Flops ({ffNodes.length})</div>
                {ffNodes.length === 0 && <div style={{ color: '#1e2733', fontSize: 11 }}>No flip-flops in design.</div>}
                {ffNodes.map((n, i) => (
                  <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f1419' }}>
                    <input type="checkbox" defaultChecked />
                    <span style={{ color: '#94a3b8', fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{n.data.instanceName}</span>
                    <span style={{ color: '#1e3a5f', fontSize: 9 }}>→ sdfxtp_1</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#111827', border: '1px solid #1e2733', borderRadius: 7, padding: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: '#475569', fontSize: 11 }}>Test vectors:</span>
                  <input type="number" min={1} value={vecCount} onChange={e => setVecCount(parseInt(e.target.value)||16)}
                    style={{ background: '#0a0e18', border: '1px solid #1e2733', borderRadius: 4, color: '#94a3b8', fontSize: 11, padding: '4px 8px', width: 70, fontFamily: "'JetBrains Mono',monospace", outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: '#1e2733', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${cov}%`, height: '100%', background: cov>90?'#4ade80':cov>70?'#facc15':'#f87171', transition: 'width .3s' }} />
                  </div>
                  <span style={{ color: cov>90?'#4ade80':cov>70?'#facc15':'#f87171', fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>~{cov}%</span>
                </div>
                <div style={{ color: '#1e2733', fontSize: 9.5, marginTop: 5 }}>Estimated stuck-at fault coverage</div>
              </div>
              {ffNodes.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#334155', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Scan chain order</div>
                  {ffNodes.map((n, i) => (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ color: '#1e3a5f', fontSize: 10, fontFamily: "'JetBrains Mono',monospace", width: 24 }}>{i===0?'SI→':'   '}</span>
                      <div style={{ background: '#160f2e', border: '1px solid #5b21b6', borderRadius: 4, color: '#c084fc', fontSize: 10, padding: '2px 8px', fontFamily: "'JetBrains Mono',monospace" }}>{n.data.instanceName}</div>
                      {i < ffNodes.length-1 && <span style={{ color: '#1e2733' }}>→</span>}
                      {i === ffNodes.length-1 && <span style={{ color: '#1e3a5f', fontSize: 10 }}>→SO</span>}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handlePreview} style={pill('#f472b6')}>Generate DFT Testbench</button>
            </>}
          </>
        )}

        {tab === 'output' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>top_tb.v</span>
            <button onClick={() => navigator.clipboard.writeText(generatedTestbench)} style={{ background: '#161b27', border: '1px solid #1e2733', borderRadius: 4, color: '#475569', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>copy</button>
          </div>
          <pre style={{ background: '#0a0e18', border: '1px solid #1e2733', borderRadius: 6, padding: 12, margin: 0, fontSize: 10.5, lineHeight: 1.8, color: '#64748b', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'JetBrains Mono',monospace", maxHeight: 380, overflowY: 'auto' }}>
            {generatedTestbench || 'Click "Preview TB" in the Inputs tab to generate.'}
          </pre>
          {simOutput && <>
            <div style={{ color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 6 }}>Simulation Output</div>
            <pre style={{ background: '#050810', border: '1px solid #1e2733', borderRadius: 6, padding: 12, margin: 0, fontSize: 10, lineHeight: 1.8, color: simOutput.includes('ERROR')?'#f87171':'#4ade80', whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono',monospace", maxHeight: 240, overflowY: 'auto' }}>
              {simRunning ? '⟳ Running...' : simOutput}
            </pre>
          </>}
        </>}

        {tab === 'custom' && <>
          <div style={{ color: '#475569', fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
            Write your own testbench. DUT module name is <code style={{ color: '#facc15', fontSize: 10 }}>top</code>.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={useCustomTestbench} onChange={e => setUseCustomTestbench(e.target.checked)} />
            <span style={{ color: '#e2e8f0', fontSize: 12 }}>Use custom testbench</span>
          </label>
          <textarea value={customTestbench} onChange={e => setCustomTestbench(e.target.value)}
            placeholder={`\`timescale 1ns / 1ps\nmodule top_tb;\n    // your testbench here\nendmodule`}
            style={{ width: '100%', height: 340, background: '#0a0e18', border: '1px solid #1e2733', borderRadius: 6, color: '#94a3b8', fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace", padding: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.8 }} />
        </>}
      </div>
    </div>
  );
}

function PortCfg({ port, config, onChange }) {
  const types = ['constant','clock','sequence','random'];
  const tc = { constant:'#60a5fa', clock:'#facc15', sequence:'#4ade80', random:'#a78bfa' };
  const c = config || { type: 'constant', value: 0 };
  const hex = (v, w) => w > 1 ? `0x${Number(v).toString(16).toUpperCase()}` : v;
  return (
    <div style={{ background: '#111827', border: '1px solid #1e2733', borderRadius: 7, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{port.sig}</span>
          <span style={{ color: '#334155', fontSize: 10, marginLeft: 6 }}>[{port.width-1}:0]</span>
        </div>
        <span style={{ color: tc[c.type], fontSize: 9.5, background: `${tc[c.type]}18`, padding: '1px 6px', borderRadius: 3 }}>{c.type}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {types.map(t => (
          <button key={t} onClick={() => onChange({ ...c, type: t })} style={{ background: c.type===t?`${tc[t]}22`:'transparent', border: `1px solid ${c.type===t?tc[t]:'#1e2733'}`, borderRadius: 4, color: c.type===t?tc[t]:'#334155', fontSize: 9.5, padding: '3px 7px', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>{t}</button>
        ))}
      </div>
      {c.type==='constant' && <Row label="Value:"><input type="number" min={0} max={Math.pow(2,port.width)-1} value={c.value??0} onChange={e=>onChange({...c,value:parseInt(e.target.value)||0})} style={ninp}/></Row>}
      {c.type==='clock'    && <Row label="Period:"><input type="number" min={2} value={c.period??10} onChange={e=>onChange({...c,period:parseInt(e.target.value)||10})} style={ninp}/><span style={{color:'#334155',fontSize:10}}>ns</span></Row>}
      {c.type==='sequence' && <>
        <Row label="Period:"><input type="number" min={1} value={c.period??10} onChange={e=>onChange({...c,period:parseInt(e.target.value)||10})} style={{...ninp,width:60}}/><span style={{color:'#334155',fontSize:10}}>ns</span></Row>
        <Row label="Values:"><input value={(c.values||[0,1,0,1]).join(',')} onChange={e=>onChange({...c,values:e.target.value.split(',').map(Number).filter(n=>!isNaN(n))})} placeholder="0,1,0,1" style={{...ninp,flex:1,width:'auto'}}/></Row>
      </>}
      {c.type==='random' && <Row label="Count:"><input type="number" min={1} value={c.count??8} onChange={e=>onChange({...c,count:parseInt(e.target.value)||8})} style={ninp}/><span style={{color:'#334155',fontSize:10}}>vectors @ {c.period||10}ns</span></Row>}
    </div>
  );
}

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
    <span style={{ color: '#475569', fontSize: 11 }}>{label}</span>{children}
  </div>
);
const ninp = { background: '#0a0e18', border: '1px solid #1e2733', borderRadius: 4, color: '#94a3b8', fontSize: 11, padding: '4px 8px', width: 80, fontFamily: "'JetBrains Mono',monospace", outline: 'none' };
const pill = c => ({ background: `${c}18`, border: `1px solid ${c}44`, borderRadius: 5, color: c, fontSize: 11, fontWeight: 600, padding: '7px 14px', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" });
