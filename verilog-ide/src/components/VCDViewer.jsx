/**
 * VCDViewer.jsx — GTKWave-style waveform viewer in the browser.
 *
 * Features:
 *  • Hierarchical signal tree (left panel, drag to add to view)
 *  • Canvas waveform rendering (right panel)
 *  • 1-bit: step waveform  |  Multi-bit: trapezoid + hex value
 *  • Unknown (x): hatched fill  |  High-Z (z): dashed midline
 *  • Time cursor with per-signal value readout
 *  • Zoom (scroll wheel / + - buttons)  |  Pan (drag)
 *  • Display format toggle: hex / bin / dec per signal
 *  • Color picker per signal
 *  • Signal reordering (drag rows)
 *  • VCD file upload or receive from simulation
 */
import React, {
  useRef, useEffect, useState, useCallback, useMemo,
} from 'react';
import { parseVCD, getValueAt, formatValue, timescaleToNs } from '../lib/vcdParser.js';

// ── Layout constants ──────────────────────────────────────────────────────────
const SIG_COL_W  = 220;   // left signal list width
const VAL_COL_W  = 72;    // value-at-cursor column
const HDR_H      = 32;    // time ruler height
const ROW_H      = 28;    // height per signal row
const MIN_PX_NS  = 0.5;   // min pixels per ns at zoom=1
const TRANSITION_PX = 4;  // pixels for trapezoid transition

const HATCH_SIZE = 6;     // 'x' hatch density

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg:        '#0a0e18',
  bg2:       '#0d1117',
  border:    '#1e2733',
  ruler:     '#111827',
  rulerTxt:  '#475569',
  grid:      '#141c28',
  sigBg0:    '#0a0e18',
  sigBg1:    '#0d1117',
  sigLabel:  '#94a3b8',
  sigVal:    '#60a5fa',
  cursor:    '#facc15',
  cursorTxt: '#facc15',
  unknown:   '#334155',
  hiZ:       '#475569',
  selection: '#1e3a5f',
};

// ── Helper: clamp ─────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function VCDViewer({ vcdText, onClose }) {
  // ── Parse VCD ──────────────────────────────────────────────────────────────
  const parsed = useMemo(() => {
    if (!vcdText) return null;
    try { return parseVCD(vcdText); } catch (e) { console.error('VCD parse error', e); return null; }
  }, [vcdText]);

  // ── State ──────────────────────────────────────────────────────────────────
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const rafRef       = useRef(null);

  const [zoom,      setZoom]      = useState(1);
  const [scrollX,   setScrollX]   = useState(0);    // px offset from left
  const [cursor,    setCursor]    = useState(null);  // time in ns
  const [viewSigs,  setViewSigs]  = useState([]);    // signals in waveform view
  const [formats,   setFormats]   = useState({});    // id → 'hex'|'bin'|'dec'
  const [colors,    setColors]    = useState({});    // id → color override
  const [selected,  setSelected]  = useState(null);  // selected signal id
  const [search,    setSearch]    = useState('');
  const [fileError, setFileError] = useState('');
  const [dragging,  setDragging]  = useState(false);
  const [dragX0,    setDragX0]    = useState(0);
  const [scrollX0,  setScrollX0]  = useState(0);
  const [canvasW,   setCanvasW]   = useState(900);

  // Populate view signals from parsed data
  useEffect(() => {
    if (!parsed) return;
    setViewSigs(parsed.signals.slice(0, 20).map(s => s.id));
    setScrollX(0); setZoom(1); setCursor(null);
  }, [parsed]);

  // Canvas width observer
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (canvasRef.current) canvasRef.current.width = w;
      setCanvasW(w);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const pxPerNs  = MIN_PX_NS * zoom;
  const endTime  = parsed?.endTime ?? 200;
  const totalPx  = endTime * pxPerNs;
  const waveW    = canvasW - SIG_COL_W - VAL_COL_W;

  const sigObjs = useMemo(() => {
    if (!parsed) return [];
    return viewSigs.map(id => parsed.signalMap.get(id)).filter(Boolean);
  }, [viewSigs, parsed]);

  // ── Canvas render ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsed) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const waveLeft = SIG_COL_W + VAL_COL_W;
    const waveRight = W;
    const waveWidth = waveRight - waveLeft;

    // ── Grid ────────────────────────────────────────────────────────────────
    const gridNs = computeGridNs(pxPerNs);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let t = 0; t <= endTime + gridNs; t += gridNs) {
      const x = waveLeft + t * pxPerNs - scrollX;
      if (x < waveLeft || x > waveRight) continue;
      ctx.beginPath(); ctx.moveTo(x, HDR_H); ctx.lineTo(x, H); ctx.stroke();
    }

    // ── Time ruler ──────────────────────────────────────────────────────────
    ctx.fillStyle = C.ruler;
    ctx.fillRect(waveLeft, 0, waveWidth, HDR_H);
    ctx.fillStyle = C.rulerTxt;
    ctx.font = '9px JetBrains Mono, monospace';
    for (let t = 0; t <= endTime + gridNs; t += gridNs) {
      const x = waveLeft + t * pxPerNs - scrollX;
      if (x < waveLeft || x > waveRight) continue;
      ctx.fillText(fmtTime(t, parsed.timescale), x + 3, 18);
      ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, HDR_H); ctx.stroke();
    }

    // ── Signal rows ──────────────────────────────────────────────────────────
    sigObjs.forEach((sig, rowIdx) => {
      const y0   = HDR_H + rowIdx * ROW_H;
      const mid  = y0 + ROW_H / 2;
      const hi   = y0 + 5;
      const lo   = y0 + ROW_H - 5;
      const isSelected = selected === sig.id;

      // Row background
      ctx.fillStyle = isSelected ? C.selection : (rowIdx % 2 === 0 ? C.sigBg0 : C.sigBg1);
      ctx.fillRect(0, y0, W, ROW_H);

      // Row separator
      ctx.strokeStyle = C.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y0 + ROW_H); ctx.lineTo(W, y0 + ROW_H); ctx.stroke();

      // Signal name (left column)
      ctx.fillStyle = isSelected ? '#e2e8f0' : C.sigLabel;
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(truncate(sig.name, 18), 8, mid + 4);

      // Format badge
      const fmt = formats[sig.id] || 'hex';
      if (sig.width > 1) {
        ctx.fillStyle = '#1e3a5f';
        ctx.fillRect(SIG_COL_W - 32, y0 + 7, 28, 14);
        ctx.fillStyle = '#60a5fa';
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillText(fmt.toUpperCase(), SIG_COL_W - 29, y0 + 18);
      }

      // Value at cursor (middle column)
      const curVal = cursor !== null ? getValueAt(sig, cursor) : '—';
      const dispVal = cursor !== null ? formatValue(curVal, sig.width, formats[sig.id] || 'hex') : '—';
      ctx.fillStyle = C.sigVal;
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(truncate(dispVal, 6), SIG_COL_W + 4, mid + 4);

      // ── Waveform ──────────────────────────────────────────────────────────
      const sigColor = colors[sig.id] || sig.color || '#4ade80';
      ctx.strokeStyle = sigColor; ctx.lineWidth = 1.5; ctx.setLineDash([]);

      if (!sig.transitions.length) {
        // Unknown — draw midline
        ctx.strokeStyle = C.unknown; ctx.setLineDash([4,3]);
        ctx.beginPath(); ctx.moveTo(waveLeft, mid); ctx.lineTo(waveRight, mid); ctx.stroke();
        ctx.setLineDash([]);
        return;
      }

      if (sig.width === 1) {
        drawBinaryWave(ctx, sig, y0, hi, lo, mid, waveLeft, waveRight, pxPerNs, scrollX, sigColor);
      } else {
        drawBusWave(ctx, sig, y0, hi, lo, mid, waveLeft, waveRight, pxPerNs, scrollX, sigColor, fmt, W);
      }
    });

    // ── Column separators ────────────────────────────────────────────────────
    ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1; ctx.setLineDash([]);
    [SIG_COL_W, SIG_COL_W + VAL_COL_W].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    });

    // ── Cursor ───────────────────────────────────────────────────────────────
    if (cursor !== null) {
      const cx = waveLeft + cursor * pxPerNs - scrollX;
      if (cx >= waveLeft && cx <= waveRight) {
        ctx.strokeStyle = C.cursor; ctx.lineWidth = 1.5; ctx.setLineDash([3,2]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.cursor;
        ctx.font = '9px JetBrains Mono, monospace';
        const label = fmtTime(cursor, parsed.timescale);
        const lw    = ctx.measureText(label).width + 6;
        const lx    = cx + 4 < waveRight - lw ? cx + 4 : cx - lw - 2;
        ctx.fillRect(lx, 2, lw, 16);
        ctx.fillStyle = '#000';
        ctx.fillText(label, lx + 3, 13);
      }
    }

    // ── Header labels ─────────────────────────────────────────────────────────
    ctx.fillStyle = '#1e2733';
    ctx.fillRect(0, 0, SIG_COL_W + VAL_COL_W, HDR_H);
    ctx.fillStyle = '#334155';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText('Signal', 8, 18);
    ctx.fillText('Value', SIG_COL_W + 4, 18);

  }, [parsed, sigObjs, zoom, scrollX, cursor, pxPerNs, endTime, formats, colors, selected, canvasW, waveW]);

  // Draw on every state change
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const xToTime = useCallback((clientX) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    return Math.max(0, (x - SIG_COL_W - VAL_COL_W + scrollX) / pxPerNs);
  }, [scrollX, pxPerNs]);

  const onMouseMove = useCallback(e => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x > SIG_COL_W + VAL_COL_W) {
      setCursor(parseFloat(xToTime(e.clientX).toFixed(3)));
    }
    if (dragging) {
      const dx = e.clientX - dragX0;
      setScrollX(clamp(scrollX0 - dx, 0, Math.max(0, totalPx - waveW)));
    }
  }, [dragging, dragX0, scrollX0, xToTime, totalPx, waveW]);

  const onMouseDown = useCallback(e => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x > SIG_COL_W + VAL_COL_W) {
      setDragging(true); setDragX0(e.clientX); setScrollX0(scrollX);
    }
    // Click in signal list
    const y = e.clientY - rect.top - HDR_H;
    if (x < SIG_COL_W && y >= 0) {
      const idx = Math.floor(y / ROW_H);
      if (idx < sigObjs.length) setSelected(sigObjs[idx]?.id || null);
    }
  }, [scrollX, sigObjs]);

  const onMouseUp   = useCallback(() => setDragging(false), []);

  const onWheel = useCallback(e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom centred on cursor
      const ratio = e.deltaY < 0 ? 1.25 : 0.8;
      const newZoom = clamp(zoom * ratio, 0.1, 500);
      const timeAtCursor = cursor ?? (scrollX + waveW / 2) / pxPerNs;
      const newPxNs = MIN_PX_NS * newZoom;
      const newScrollX = clamp(timeAtCursor * newPxNs - waveW / 2, 0, timeAtCursor * newPxNs);
      setZoom(newZoom);
      setScrollX(Math.max(0, newScrollX));
    } else {
      setScrollX(s => clamp(s + e.deltaY * 2, 0, Math.max(0, totalPx - waveW)));
    }
  }, [zoom, cursor, scrollX, pxPerNs, waveW, totalPx]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === '+' || e.key === '=') setZoom(z => clamp(z * 1.25, 0.1, 500));
      if (e.key === '-')                  setZoom(z => clamp(z * 0.8,  0.1, 500));
      if (e.key === 'f' || e.key === 'F') { setZoom(1); setScrollX(0); }
      if (e.key === 'ArrowRight')         setScrollX(s => clamp(s + 50,  0, Math.max(0, totalPx - waveW)));
      if (e.key === 'ArrowLeft')          setScrollX(s => clamp(s - 50,  0, Math.max(0, totalPx - waveW)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPx, waveW]);

  // ── File upload ───────────────────────────────────────────────────────────
  const onFileUpload = useCallback(e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try { parseVCD(ev.target.result); setFileError(''); }
      catch { setFileError('Invalid VCD file'); }
    };
    reader.readAsText(file);
  }, []);

  // ── Signal tree helpers ───────────────────────────────────────────────────
  const addSignal   = (id) => { if (!viewSigs.includes(id)) setViewSigs(s => [...s, id]); };
  const removeSignal = (id) => setViewSigs(s => s.filter(x => x !== id));
  const moveUp   = (id) => { const i = viewSigs.indexOf(id); if (i > 0)                      setViewSigs(s => { const a=[...s]; [a[i-1],a[i]]=[a[i],a[i-1]]; return a; }); };
  const moveDown = (id) => { const i = viewSigs.indexOf(id); if (i < viewSigs.length - 1)    setViewSigs(s => { const a=[...s]; [a[i],a[i+1]]=[a[i+1],a[i]]; return a; }); };

  const filteredSigs = useMemo(() => {
    if (!parsed) return [];
    const q = search.toLowerCase();
    return parsed.signals.filter(s => !q || s.fullName.toLowerCase().includes(q));
  }, [parsed, search]);

  const canvasH = HDR_H + Math.max(sigObjs.length, 1) * ROW_H;

  if (!vcdText && !parsed) {
    return (
      <EmptyState onFile={onFileUpload} error={fileError} />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, fontFamily: "'JetBrains Mono',monospace" }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700, marginRight: 4 }}>⬡ VCD Viewer</span>

        {/* Zoom */}
        <ZBtn onClick={() => setZoom(z => clamp(z*1.4, 0.1, 500))}>+</ZBtn>
        <span style={{ color: '#334155', fontSize: 10, minWidth: 44, textAlign: 'center' }}>{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×</span>
        <ZBtn onClick={() => setZoom(z => clamp(z*0.71, 0.1, 500))}>−</ZBtn>
        <ZBtn onClick={() => { setZoom(1); setScrollX(0); }} title="Fit all (F)">fit</ZBtn>
        <ZBtn onClick={() => { setZoom(z => clamp(z * (endTime * MIN_PX_NS) / Math.max(waveW, 1), 0.1, 500)); }} title="Zoom to fit">⤢</ZBtn>

        <div style={{ width: 1, height: 18, background: C.border }} />

        {/* Cursor time */}
        {cursor !== null && (
          <span style={{ color: C.cursor, fontSize: 10, minWidth: 80 }}>
            t = {fmtTime(cursor, parsed?.timescale)}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Timescale */}
        <span style={{ color: '#334155', fontSize: 9 }}>
          ts: {parsed?.timescale || '1ns'}  end: {fmtTime(endTime, parsed?.timescale)}
        </span>

        {/* Upload VCD */}
        <label style={{ background: '#161b27', border: `1px solid ${C.border}`, borderRadius: 4, color: '#475569', fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}>
          ↑ Load VCD
          <input type="file" accept=".vcd" onChange={onFileUpload} style={{ display: 'none' }} />
        </label>

        {onClose && <ZBtn onClick={onClose} title="Close">×</ZBtn>}
      </div>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: signal tree */}
        <div style={{ width: 180, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="filter signals…"
              style={{ width: '100%', background: '#161b27', border: `1px solid ${C.border}`, borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '3px 6px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredSigs.map(sig => {
              const inView = viewSigs.includes(sig.id);
              return (
                <div key={sig.id}
                  style={{ padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, borderBottom: '1px solid #0a0e18', background: inView ? '#0f1a2e' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = inView ? '#0f1a2e' : '#111827'}
                  onMouseLeave={e => e.currentTarget.style.background = inView ? '#0f1a2e' : 'transparent'}
                  onClick={() => inView ? removeSignal(sig.id) : addSignal(sig.id)}
                  title={sig.fullName}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors[sig.id] || sig.color || '#4ade80', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: inView ? '#e2e8f0' : '#475569', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.name}</div>
                    {sig.scope.length > 0 && <div style={{ color: '#1e2733', fontSize: 8 }}>{sig.scope.join('.')}</div>}
                  </div>
                  {sig.width > 1 && <span style={{ color: '#1e3a5f', fontSize: 8 }}>[{sig.width-1}:0]</span>}
                  {inView && <span style={{ color: '#334155', fontSize: 9 }}>✓</span>}
                </div>
              );
            })}
            {!filteredSigs.length && <div style={{ color: '#1e2733', fontSize: 10, padding: 10 }}>No signals</div>}
          </div>
          {/* Signal controls */}
          {selected && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ color: '#334155', fontSize: 9, marginBottom: 2 }}>Selected: {parsed?.signalMap.get(selected)?.name}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <ZBtn onClick={() => moveUp(selected)}>↑</ZBtn>
                <ZBtn onClick={() => moveDown(selected)}>↓</ZBtn>
                <ZBtn onClick={() => removeSignal(selected)} style={{ color: '#f87171' }}>✕</ZBtn>
              </div>
              {/* Format selector */}
              {(parsed?.signalMap.get(selected)?.width ?? 1) > 1 && (
                <div style={{ display: 'flex', gap: 3 }}>
                  {['hex','bin','dec'].map(f => (
                    <button key={f} onClick={() => setFormats(fm => ({ ...fm, [selected]: f }))}
                      style={{ background: (formats[selected]||'hex')===f?'#1e3a5f':'transparent', border:`1px solid ${(formats[selected]||'hex')===f?'#3b82f6':'#1e2733'}`, borderRadius:3, color:(formats[selected]||'hex')===f?'#60a5fa':'#334155', fontSize:9, padding:'2px 5px', cursor:'pointer' }}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
              {/* Colour picker */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {['#4ade80','#60a5fa','#f59e0b','#f472b6','#a78bfa','#38bdf8','#fb923c','#facc15'].map(c => (
                  <div key={c} onClick={() => setColors(cs => ({ ...cs, [selected]: c }))}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: `2px solid ${(colors[selected]||parsed?.signalMap.get(selected)?.color)===c?'#fff':'transparent'}` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: waveform canvas */}
        <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'crosshair', position: 'relative' }}
          onMouseMove={onMouseMove} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
          <canvas ref={canvasRef} width={canvasW} height={Math.max(canvasH, 200)}
            style={{ display: 'block', width: '100%', height: `${Math.max(canvasH, 200)}px` }} />

          {sigObjs.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ color: '#1e2733', fontSize: 13 }}>Click signals in the left panel to add them to the view</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Keyboard hint ────────────────────────────────────────────────── */}
      <div style={{ padding: '3px 10px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 12, flexShrink: 0 }}>
        {[['Scroll','wheel'],['Zoom','ctrl+wheel | +/-'],['Pan','drag'],['Fit','F'],['Select signal','click left']].map(([k,v])=>(
          <span key={k} style={{ fontSize: 9, color: '#1e2733' }}><span style={{ color: '#2d3748' }}>{k}</span> {v}</span>
        ))}
      </div>
    </div>
  );
}

// ── Binary waveform renderer ──────────────────────────────────────────────────
function drawBinaryWave(ctx, sig, y0, hi, lo, mid, wLeft, wRight, pxNs, scrollX, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  const xAt = t => wLeft + t * pxNs - scrollX;

  // Compute visible transitions
  const transitions = sig.transitions;
  if (!transitions.length) return;

  ctx.beginPath();
  let prevV   = transitions[0].value;
  let prevX   = Math.max(wLeft, xAt(0));
  let prevY   = yOfVal(prevV, hi, lo, mid);
  ctx.moveTo(prevX, prevY);

  for (let i = 0; i < transitions.length; i++) {
    const t  = transitions[i];
    const nx = xAt(t.time);
    if (nx < wLeft) { prevV = t.value; prevX = nx; prevY = yOfVal(t.value, hi, lo, mid); continue; }
    if (nx > wRight) break;

    // Extend previous level to this transition
    ctx.lineTo(nx, prevY);
    // Drop/rise
    const ny = yOfVal(t.value, hi, lo, mid);
    ctx.lineTo(nx, ny);
    prevV = t.value; prevX = nx; prevY = ny;

    // Hatch for 'x'
    if (t.value === 'x' || t.value === 'z') {
      const nextT = transitions[i + 1]?.time ?? sig.transitions[sig.transitions.length-1].time + 10;
      const x1 = nx, x2 = Math.min(wRight, xAt(nextT));
      if (t.value === 'x') drawHatch(ctx, x1, y0 + 4, x2, y0 + ROW_H - 4, color);
      else { ctx.save(); ctx.strokeStyle = color; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(x1,mid); ctx.lineTo(x2,mid); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
    }
  }
  // Extend to wRight
  ctx.lineTo(wRight, prevY);
  ctx.stroke();
}

// ── Bus waveform renderer ─────────────────────────────────────────────────────
function drawBusWave(ctx, sig, y0, hi, lo, mid, wLeft, wRight, pxNs, scrollX, color, fmt) {
  const xAt = t => wLeft + t * pxNs - scrollX;
  const transitions = sig.transitions;
  if (!transitions.length) return;

  ctx.font = '9px JetBrains Mono, monospace';

  for (let i = 0; i < transitions.length; i++) {
    const t0  = transitions[i].time;
    const t1  = transitions[i + 1]?.time ?? (sig.transitions[sig.transitions.length-1].time + 20 / pxNs);
    const x0  = Math.max(wLeft, xAt(t0));
    const x1  = Math.min(wRight, xAt(t1));
    const val = transitions[i].value;
    if (x1 < wLeft || x0 > wRight) continue;

    const trapW = Math.min(TRANSITION_PX, (x1 - x0) / 3);
    const isUnknown = val === 'x' || val === 'z';

    if (isUnknown) {
      ctx.strokeStyle = C.unknown; ctx.lineWidth = 1.5;
      ctx.fillStyle = `${C.unknown}44`;
    } else {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.fillStyle = `${color}1a`;
    }

    // Trapezoid shape
    ctx.beginPath();
    ctx.moveTo(x0, mid);
    ctx.lineTo(x0 + trapW, hi);
    ctx.lineTo(x1 - trapW, hi);
    ctx.lineTo(x1, mid);
    ctx.lineTo(x1 - trapW, lo);
    ctx.lineTo(x0 + trapW, lo);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Value text
    const segW = x1 - x0 - trapW * 2 - 4;
    if (segW > 20) {
      const label = isUnknown ? (val === 'z' ? 'Z' : 'X') : formatValue(val, sig.width, fmt);
      ctx.fillStyle = isUnknown ? C.unknown : color;
      ctx.font = '9px JetBrains Mono, monospace';
      const tw = ctx.measureText(label).width;
      if (tw < segW) ctx.fillText(label, x0 + trapW + 2 + (segW - tw) / 2, mid + 4);
    }
  }
}

// ── Hatch fill for unknown ───────────────────────────────────────────────────
function drawHatch(ctx, x1, y1, x2, y2, color) {
  ctx.save();
  ctx.strokeStyle = color + '55'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x1; x < x2; x += HATCH_SIZE) {
    ctx.moveTo(x, y1); ctx.lineTo(x + (y2 - y1), y2);
  }
  ctx.stroke();
  ctx.restore();
}

function yOfVal(v, hi, lo, mid) {
  if (v === 1) return hi;
  if (v === 0) return lo;
  return mid;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function computeGridNs(pxPerNs) {
  // Pick a grid step that gives ~60–120px spacing
  const candidates = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000];
  for (const c of candidates) if (c * pxPerNs >= 60) return c;
  return 10000;
}

function fmtTime(t, timescale) {
  const unit = (timescale || '1ns').match(/(fs|ps|ns|us|ms|s)/i)?.[0]?.toLowerCase() || 'ns';
  return `${Number.isInteger(t) ? t : t.toFixed(2)}${unit}`;
}

const ZBtn = ({ onClick, children, title, style: s }) => (
  <button onClick={onClick} title={title} style={{ background: '#161b27', border: '1px solid #1e2733', borderRadius: 4, color: '#475569', fontSize: 12, width: 24, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', ...s }}>
    {children}
  </button>
);

function EmptyState({ onFile, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#0a0e18', fontFamily: "'Space Grotesk',sans-serif", gap: 16 }}>
      <div style={{ fontSize: 40, opacity: 0.15 }}>⬡</div>
      <div style={{ color: '#1e2733', fontSize: 14 }}>No VCD loaded</div>
      <div style={{ color: '#334155', fontSize: 11 }}>Run simulation to auto-load, or upload a .vcd file</div>
      <label style={{ background: '#0f2040', border: '1px solid #1e40af', borderRadius: 6, color: '#60a5fa', fontSize: 12, padding: '8px 20px', cursor: 'pointer' }}>
        ↑ Upload .vcd file
        <input type="file" accept=".vcd" onChange={onFile} style={{ display: 'none' }} />
      </label>
      {error && <div style={{ color: '#f87171', fontSize: 11 }}>{error}</div>}
    </div>
  );
}
