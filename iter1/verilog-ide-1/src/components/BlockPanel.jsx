import React, { useState, useMemo } from 'react';
import useStore from '../store/graphStore.js';

const CAT = {
  'combinational/gates':   { label: 'Logic Gates',   icon: '⊕', order: 0 },
  'combinational/adders':  { label: 'Adders',         icon: '∑', order: 1 },
  'combinational/utility': { label: 'Utility',        icon: '◈', order: 2 },
  'sequential/flip_flops': { label: 'Flip-Flops',     icon: '◇', order: 3 },
  'sequential/counters':   { label: 'Counters',        icon: '↑', order: 4 },
  'sequential/fsm':        { label: 'State Machines',  icon: '◎', order: 5 },
  'custom':                { label: 'Custom Blocks',   icon: '✦', order: 6 },
  'hierarchy/user':        { label: 'My Designs',      icon: '⬡', order: 7 },
};

export default function BlockPanel() {
  const cellsManifest = useStore(s => s.cellsManifest);
  const userBlocks    = useStore(s => s.userBlocks);
  const setTB         = useStore(s => s.setTutorialBlock);
  const setShow       = useStore(s => s.setShowTutorial);
  const setCB         = useStore(s => s.setShowCustomBlockBuilder);
  const setHE         = useStore(s => s.setShowHierarchyExporter);
  const selectedPDK   = useStore(s => s.selectedPDK);

  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState({ 'combinational/gates': true, 'sequential/flip_flops': true });

  const allBlocks = useMemo(() => [...cellsManifest, ...userBlocks], [cellsManifest, userBlocks]);

  const grouped = useMemo(() => {
    const g = {};
    allBlocks.forEach(b => {
      if (search && !b.label.toLowerCase().includes(search.toLowerCase()) && !b.abstract?.toLowerCase().includes(search.toLowerCase())) return;
      const cat = b.category || 'custom';
      if (!g[cat]) g[cat] = [];
      g[cat].push(b);
    });
    return g;
  }, [allBlocks, search]);

  const cats = Object.keys(grouped).sort((a, b) => (CAT[a]?.order ?? 99) - (CAT[b]?.order ?? 99));

  return (
    <div style={{ width: 230, background: '#0d1117', borderRight: '1px solid #1e2733', display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}>
      {selectedPDK && (
        <div style={{ padding: '8px 12px', background: `${selectedPDK.color||'#3b82f6'}11`, borderBottom: `1px solid ${selectedPDK.color||'#3b82f6'}33`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedPDK.color || '#3b82f6' }} />
          <div>
            <div style={{ color: selectedPDK.color || '#3b82f6', fontSize: 10, fontWeight: 700 }}>{selectedPDK.name}</div>
            <div style={{ color: '#334155', fontSize: 9 }}>{selectedPDK.process}</div>
          </div>
        </div>
      )}
      <div style={{ padding: '10px 10px 6px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cells..."
          style={{ width: '100%', background: '#161b27', border: '1px solid #1e2733', borderRadius: 5, color: '#94a3b8', fontSize: 11, padding: '5px 9px', outline: 'none', fontFamily: "'JetBrains Mono',monospace", boxSizing: 'border-box' }} />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {cats.map(cat => {
          const meta = CAT[cat] || { label: cat, icon: '□' };
          const open = !!expanded[cat];
          return (
            <div key={cat}>
              <button onClick={() => setExpanded(e => ({ ...e, [cat]: !e[cat] }))}
                style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #1a2030', color: '#334155', fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', padding: '7px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Space Grotesk',sans-serif" }}>
                <span>{meta.icon} {meta.label} <span style={{ color: '#1e2733' }}>({grouped[cat].length})</span></span>
                <span style={{ opacity: 0.4, fontSize: 11 }}>{open ? '▾' : '▸'}</span>
              </button>
              {open && grouped[cat].map(block => (
                <div key={block.id} draggable onDragStart={e => e.dataTransfer.setData('application/blockdef', JSON.stringify(block))}
                  style={{ padding: '6px 12px', cursor: 'grab', borderBottom: '1px solid #0d111a', display: 'flex', alignItems: 'center', gap: 7 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111827'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 5, height: 30, borderRadius: 3, background: block.color || '#334155', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#cbd5e1', fontSize: 11.5, fontWeight: 600 }}>{block.label}</div>
                    <div style={{ color: '#334155', fontSize: 9.5, display: 'flex', gap: 4 }}>
                      <span>{block.ports?.inputs?.length ?? 0}in · {block.ports?.outputs?.length ?? 0}out</span>
                      {block.timingHint?.tpd_typ && <span style={{ color: '#1e3a5f' }}>~{block.timingHint.tpd_typ}ns</span>}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setTB(block); setShow(true); }}
                    style={{ background: '#161b27', border: 'none', borderRadius: '50%', width: 17, height: 17, color: '#475569', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
                </div>
              ))}
            </div>
          );
        })}
        {cats.length === 0 && (
          <div style={{ color: '#334155', fontSize: 11, padding: 14, textAlign: 'center' }}>
            {cellsManifest.length === 0 ? 'No PDK loaded. Select a PDK to see cells.' : `No cells match "${search}"`}
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid #1e2733', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button onClick={() => setCB(true)} style={aBtn('#a78bfa')}>✦ New Custom Block</button>
        <button onClick={() => setHE(true)}  style={aBtn('#818cf8')}>⬡ Export as Hierarchy Block</button>
        <div style={{ color: '#1e2733', fontSize: 9, textAlign: 'center', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>drag → workspace</div>
      </div>
    </div>
  );
}

const aBtn = c => ({ background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 5, color: c, fontSize: 10.5, fontWeight: 500, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'Space Grotesk',sans-serif" });
