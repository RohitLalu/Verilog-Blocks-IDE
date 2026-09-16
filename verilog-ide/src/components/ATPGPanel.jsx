/**
 * ATPGPanel.jsx — Automatic Test Pattern Generation using atalanta.
 *
 * Flow:
 *   1. Yosys synthesises the design to generic gates + writes ISCAS89 .bench file
 *   2. atalanta runs fault simulation on the bench file
 *   3. Results: fault coverage %, test vectors, detected/undetected fault lists
 *
 * atalanta is compiled from source during docker build.
 * Requires: yosys + atalanta in container PATH.
 */
import React, { useState } from 'react';
import useStore from '../store/graphStore.js';

export default function ATPGPanel() {
  const { nodes, generatedVerilog, projectName, atpgResult, setAtpgResult,
          atpgRunning, setAtpgRunning, pushNotification, synthesisOutput } = useStore();

  const [tab,        setTab]        = useState('run');
  const [showFaults, setShowFaults] = useState('undetected'); // 'detected' | 'undetected' | 'redundant'

  const hasSynthesis = synthesisOutput && synthesisOutput.includes('stat');

  // ── Run ATPG ────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!nodes.length) { pushNotification('Add blocks first', 'warn'); return; }
    if (!generatedVerilog || generatedVerilog.includes('Empty design')) {
      pushNotification('Generate Verilog first (</>)', 'warn'); return;
    }
    if (!window.api) { pushNotification('ATPG requires Docker mode', 'warn'); return; }

    setAtpgRunning(true); setAtpgResult(null);

    try {
      const res = await window.api.atpg.run({ projectName, verilog: generatedVerilog });
      setAtpgResult(res);
      if (res.ok) {
        pushNotification(`ATPG done — ${res.coverage?.toFixed(1) ?? '?'}% coverage`, 'success');
        setTab('results');
      } else {
        pushNotification(`ATPG failed at ${res.stage}`, 'error');
        setTab('log');
      }
    } catch (e) {
      pushNotification('ATPG request failed: ' + e.message, 'error');
      setAtpgResult({ ok: false, output: e.message });
    }
    setAtpgRunning(false);
  };

  const downloadBench = () => {
    if (!atpgResult?.bench) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([atpgResult.bench], { type: 'text/plain' }));
    a.download = 'top.bench'; a.click();
  };

  const downloadVectors = () => {
    if (!atpgResult?.output) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([atpgResult.output], { type: 'text/plain' }));
    a.download = 'atpg_vectors.txt'; a.click();
  };

  // ── Coverage colour ──────────────────────────────────────────────────────────
  const covColor = (c) => {
    if (c === null || c === undefined) return '#475569';
    if (c >= 95) return '#4ade80';
    if (c >= 80) return '#facc15';
    return '#f87171';
  };

  const TABS = ['run', 'results', 'faults', 'log'];

  return (
    <div style={{ width: 440, background: '#0d1117', borderLeft: '1px solid #1e2733',
      display: 'flex', flexDirection: 'column', flexShrink: 0, fontFamily: "'Space Grotesk',sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '12px 16px 0', borderBottom: '1px solid #1e2733' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <span style={{ color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>◈ ATPG</span>
            <span style={{ color: '#334155', fontSize: 10, marginLeft: 8 }}>atalanta</span>
          </div>
          <button onClick={handleRun} disabled={atpgRunning || !nodes.length}
            style={{ background: '#1c1508', border: '1px solid #92400e', borderRadius: 6,
              color: '#fbbf24', fontSize: 12, fontWeight: 700, padding: '5px 16px',
              cursor: atpgRunning || !nodes.length ? 'not-allowed' : 'pointer',
              opacity: atpgRunning || !nodes.length ? 0.4 : 1 }}>
            {atpgRunning ? '⟳ Running…' : '▶ Run ATPG'}
          </button>
        </div>

        {/* Info strip */}
        <div style={{ background: '#111827', borderRadius: 6, padding: '8px 12px',
          marginBottom: 10, fontSize: 10.5, color: '#475569', lineHeight: 1.7 }}>
          Yosys converts your design to ISCAS89 format → atalanta generates
          stuck-at-0/1 test vectors and reports fault coverage.<br/>
          {!hasSynthesis && <span style={{ color: '#92400e' }}>
            Tip: run ⚛ Yosys first to verify the design synthesises cleanly.
          </span>}
        </div>

        <div style={{ display: 'flex' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'transparent',
              border: 'none', borderBottom: `2px solid ${tab===t?'#f59e0b':'transparent'}`,
              color: tab===t ? '#f59e0b' : '#334155', fontSize: 11, padding: '5px 12px 8px',
              cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {/* ── Run tab ─────────────────────────────────────────────────────── */}
        {tab === 'run' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Section title="How ATPG works here">
              <ol style={{ color: '#475569', fontSize: 11.5, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
                <li>Your Verilog is synthesised to generic gates (AND/OR/NOT) via Yosys <code style={code}>techmap</code></li>
                <li>Yosys exports an ISCAS89 <code style={code}>.bench</code> file — the standard format atalanta reads</li>
                <li>atalanta generates test patterns targeting every stuck-at-0 and stuck-at-1 fault</li>
                <li>Fault simulation computes actual coverage — not a formula</li>
              </ol>
            </Section>

            <Section title="Stuck-at fault model">
              <p style={{ color: '#475569', fontSize: 11.5, lineHeight: 1.8, margin: 0 }}>
                Every net in the circuit can be permanently stuck at 0 (SA0) or stuck at 1 (SA1).
                A design with 100 nets has 200 possible faults. A test vector <em>detects</em> a fault
                if it makes the circuit produce a different output than the fault-free circuit.
                Target: <span style={{ color: '#4ade80' }}>≥95%</span> for production designs.
              </p>
            </Section>

            <Section title="What atalanta outputs">
              <ul style={{ color: '#475569', fontSize: 11.5, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
                <li><span style={{ color: '#4ade80' }}>DT</span> — Detected fault (test vector exists)</li>
                <li><span style={{ color: '#f87171' }}>UN</span> — Undetected fault (no vector found — may indicate untestable logic)</li>
                <li><span style={{ color: '#60a5fa' }}>RE</span> — Redundant fault (logically impossible — not a real defect)</li>
                <li>Test vectors as binary input patterns</li>
              </ul>
            </Section>

            {atpgResult && !atpgResult.ok && (
              <div style={{ background: '#1c0505', border: '1px solid #991b1b', borderRadius: 7, padding: 12 }}>
                <div style={{ color: '#f87171', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                  Failed at stage: {atpgResult.stage}
                </div>
                <pre style={{ color: '#7f1d1d', fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                  margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {atpgResult.output?.slice(0, 400)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── Results tab ──────────────────────────────────────────────────── */}
        {tab === 'results' && (
          !atpgResult?.ok
            ? <EmptyMsg>Run ATPG first to see results.</EmptyMsg>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Coverage gauge */}
              <div style={{ background: '#111827', border: '1px solid #1e2733', borderRadius: 8, padding: 16 }}>
                <div style={{ color: '#334155', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Fault Coverage
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
                  <div style={{ color: covColor(atpgResult.coverage), fontSize: 48, fontWeight: 800,
                    fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
                    {atpgResult.coverage !== null ? `${atpgResult.coverage.toFixed(1)}%` : '—'}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#475569', fontSize: 11 }}>
                      {atpgResult.detected ?? '?'} / {atpgResult.total ?? '?'} faults detected
                    </div>
                    <div style={{ color: '#334155', fontSize: 10 }}>
                      {atpgResult.faults?.redundant?.length ?? 0} redundant (not real defects)
                    </div>
                  </div>
                </div>
                {/* Bar */}
                <div style={{ height: 8, background: '#1e2733', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${atpgResult.coverage ?? 0}%`, height: '100%',
                    background: covColor(atpgResult.coverage),
                    transition: 'width 0.6s ease', borderRadius: 4,
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: '#1e2733', fontSize: 9 }}>0%</span>
                  <span style={{ color: '#166534', fontSize: 9 }}>95% target</span>
                  <span style={{ color: '#1e2733', fontSize: 9 }}>100%</span>
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['Test Vectors', atpgResult.vectors, '#60a5fa'],
                  ['Detected',    atpgResult.faults?.detected?.length ?? atpgResult.detected ?? 0, '#4ade80'],
                  ['Undetected',  atpgResult.faults?.undetected?.length ?? (atpgResult.total ?? 0) - (atpgResult.detected ?? 0), '#f87171'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background: '#111827', border: '1px solid #1e2733', borderRadius: 6, padding: 10, textAlign: 'center' }}>
                    <div style={{ color: c, fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                    <div style={{ color: '#334155', fontSize: 9.5 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Coverage quality label */}
              <div style={{
                background: atpgResult.coverage >= 95 ? '#0a2218' : atpgResult.coverage >= 80 ? '#1c1508' : '#1c0505',
                border: `1px solid ${atpgResult.coverage >= 95 ? '#166534' : atpgResult.coverage >= 80 ? '#92400e' : '#991b1b'}`,
                borderRadius: 7, padding: '10px 14px', fontSize: 12,
                color: covColor(atpgResult.coverage),
              }}>
                {atpgResult.coverage >= 95
                  ? '✓ Excellent coverage — suitable for production tapeout'
                  : atpgResult.coverage >= 80
                  ? '⚠ Moderate coverage — add more targeted test vectors'
                  : '✗ Low coverage — investigate undetected faults before tapeout'}
              </div>

              {/* Download buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={downloadBench}   style={pill('#60a5fa')}>↓ top.bench</button>
                <button onClick={downloadVectors} style={pill('#f59e0b')}>↓ test vectors</button>
              </div>
            </div>
        )}

        {/* ── Faults tab ───────────────────────────────────────────────────── */}
        {tab === 'faults' && (
          !atpgResult?.ok
            ? <EmptyMsg>Run ATPG first to see fault summary.</EmptyMsg>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* atalanta 2.0 reports fault counts in the summary — not per-fault lists */}
              <div style={{ background: '#111827', border: '1px solid #1e2733', borderRadius: 8, padding: 14 }}>
                <div style={{ color: '#334155', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Fault Summary (atalanta 2.0)
                </div>
                {[
                  ['Collapsed faults (total SA0+SA1)', atpgResult.total,                        '#94a3b8'],
                  ['Detected',                          atpgResult.detected,                     '#4ade80'],
                  ['Redundant (logically untestable)',  atpgResult.faults?.redundantCount ?? 0,  '#60a5fa'],
                  ['Aborted (undetected after backtrack)', atpgResult.faults?.abortedCount ?? 0, '#f87171'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #1e2733' }}>
                    <span style={{ color: '#475569', fontSize: 11 }}>{l}</span>
                    <span style={{ color: c, fontSize: 14, fontWeight: 700,
                      fontFamily: "'JetBrains Mono',monospace" }}>{v ?? '—'}</span>
                  </div>
                ))}
              </div>

              <Section title="What these mean">
                <ul style={{ color: '#475569', fontSize: 11.5, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
                  <li><span style={{ color: '#4ade80' }}>Detected</span> — a test vector exists that distinguishes the faulty circuit from the good circuit</li>
                  <li><span style={{ color: '#60a5fa' }}>Redundant</span> — the fault is logically impossible; any SA0/SA1 on that net cannot change any output. Not a real defect concern.</li>
                  <li><span style={{ color: '#f87171' }}>Aborted</span> — ATPG hit the backtrack limit without finding a test. May indicate untestable logic or a backtrack limit that's too low.</li>
                </ul>
              </Section>

              <div style={{ background: '#0a1628', border: '1px solid #1e2733', borderRadius: 7, padding: 12,
                color: '#334155', fontSize: 10.5, lineHeight: 1.7 }}>
                ℹ atalanta 2.0 reports fault counts in the summary block only — it does not output per-fault DT/UN/RE
                lines in this mode. The raw atalanta output with full details is in the <strong style={{ color: '#94a3b8' }}>Log</strong> tab.
              </div>
            </div>
        )}

        {/* ── Log tab ──────────────────────────────────────────────────────── */}
        {tab === 'log' && (
          !atpgResult
            ? <EmptyMsg>Run ATPG to see raw output.</EmptyMsg>
            : <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#334155', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                  atalanta raw output
                </span>
                <button onClick={() => navigator.clipboard.writeText(atpgResult.output || '')}
                  style={{ background: '#161b27', border: '1px solid #1e2733', borderRadius: 4,
                    color: '#475569', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>copy</button>
              </div>
              <pre style={{ background: '#050810', border: '1px solid #1e2733', borderRadius: 6,
                padding: 12, margin: 0, fontSize: 10, lineHeight: 1.75,
                color: atpgResult.ok ? '#334155' : '#7f1d1d',
                fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', maxHeight: 500, overflowY: 'auto' }}>
                {atpgResult.output || 'No output.'}
              </pre>
            </div>
        )}

      </div>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div>
    <div style={{ color: '#334155', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);
const EmptyMsg = ({ children }) => (
  <div style={{ color: '#1e2733', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>{children}</div>
);
const code = { color: '#f59e0b', fontFamily: "'JetBrains Mono',monospace", fontSize: 10 };
const pill  = c => ({ background: `${c}18`, border: `1px solid ${c}44`, borderRadius: 5, color: c,
  fontSize: 11, fontWeight: 600, padding: '7px 14px', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" });
