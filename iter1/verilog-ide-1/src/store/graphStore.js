import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';

const tryLS = (key, def) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } };
const setLS = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const useStore = create((set, get) => ({
  // ── Graph ──────────────────────────────────────────────────────────────────
  nodes: [], edges: [], instanceCounter: {},

  onNodesChange: (ch) => set({ nodes: applyNodeChanges(ch, get().nodes) }),
  onEdgesChange: (ch) => set({ edges: applyEdgeChanges(ch, get().edges) }),

  onConnect: (conn) => {
    const { edges, nodes } = get();
    const src = nodes.find(n => n.id === conn.source);
    const tgt = nodes.find(n => n.id === conn.target);
    if (!src || !tgt) return;
    const wireName = `${src.data.instanceName}_${tgt.data.instanceName}_${conn.sourceHandle}_0`;
    set({ edges: addEdge({
      ...conn, id: `e_${wireName}`, data: { wireName }, animated: false,
      style: { stroke: '#3b82f6', strokeWidth: 1.5 },
      markerEnd: { type: 'arrowclosed', color: '#3b82f6' },
      label: wireName,
      labelStyle: { fill: '#475569', fontSize: 8, fontFamily: 'JetBrains Mono' },
      labelBgStyle: { fill: '#0d1117', fillOpacity: 0.85 },
    }, edges) });
  },

  addBlock: (blockDef, position) => {
    const { nodes, instanceCounter } = get();
    const count = (instanceCounter[blockDef.id] || 0) + 1;
    const instanceName = `${blockDef.module || blockDef.id}_${count}`;
    set({
      nodes: [...nodes, {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        type: 'blockNode', position,
        data: { ...blockDef, instanceName },
      }],
      instanceCounter: { ...instanceCounter, [blockDef.id]: count },
    });
  },

  removeNode: (id) => set({
    nodes: get().nodes.filter(n => n.id !== id),
    edges: get().edges.filter(e => e.source !== id && e.target !== id),
  }),
  clearGraph: () => set({ nodes: [], edges: [], instanceCounter: {} }),

  // ── PDK ────────────────────────────────────────────────────────────────────
  selectedPDK: tryLS('vbide_pdk', null),
  pdkContext:  null,
  pdkLocked:   false,
  setSelectedPDK: (pdk) => { setLS('vbide_pdk', pdk); set({ selectedPDK: pdk }); },
  setPDKContext:  (ctx) => set({ pdkContext: ctx }),
  setPDKLocked:   (v)   => set({ pdkLocked: v }),

  // ── Block library ──────────────────────────────────────────────────────────
  cellsManifest: [],
  setCellsManifest: (m) => set({ cellsManifest: m }),

  userBlocks: tryLS('vbide_user_blocks', []),
  saveUserBlock: (block) => {
    const updated = [...get().userBlocks.filter(b => b.id !== block.id), block];
    setLS('vbide_user_blocks', updated);
    set({ userBlocks: updated });
  },
  deleteUserBlock: (id) => {
    const updated = get().userBlocks.filter(b => b.id !== id);
    setLS('vbide_user_blocks', updated);
    set({ userBlocks: updated });
  },

  // ── UI ─────────────────────────────────────────────────────────────────────
  activePanel: 'blocks',
  setActivePanel: (p) => set({ activePanel: p }),

  generatedVerilog: '', setGeneratedVerilog: (c) => set({ generatedVerilog: c }),
  synthesisOutput:  '', setSynthesisOutput:  (o) => set({ synthesisOutput: o }),
  synthesisRunning: false, setSynthesisRunning: (v) => set({ synthesisRunning: v }),
  errors: [], setErrors: (e) => set({ errors: e }),
  projectName: 'my_project', setProjectName: (n) => set({ projectName: n }),
  tutorialBlock: null, setTutorialBlock: (b) => set({ tutorialBlock: b }),
  showTutorial:  false, setShowTutorial:  (v) => set({ showTutorial: v }),

  // ── Testbench ──────────────────────────────────────────────────────────────
  testbenchMode: false, setTestbenchMode: (v) => set({ testbenchMode: v }),
  testbenchInputs: {},
  setTestbenchInput: (port, cfg) =>
    set({ testbenchInputs: { ...get().testbenchInputs, [port]: cfg } }),
  clearTestbenchInputs: () => set({ testbenchInputs: {} }),
  generatedTestbench: '', setGeneratedTestbench: (c) => set({ generatedTestbench: c }),
  customTestbench: '', setCustomTestbench: (c) => set({ customTestbench: c }),
  useCustomTestbench: false, setUseCustomTestbench: (v) => set({ useCustomTestbench: v }),
  simOutput: '', setSimOutput: (o) => set({ simOutput: o }),
  simRunning: false, setSimRunning: (v) => set({ simRunning: v }),

  // ── Hierarchy & custom blocks ──────────────────────────────────────────────
  showHierarchyExporter: false, setShowHierarchyExporter: (v) => set({ showHierarchyExporter: v }),
  showCustomBlockBuilder: false, setShowCustomBlockBuilder: (v) => set({ showCustomBlockBuilder: v }),
  customBlockDraft: {
    id:'', label:'', symbol:'', module:'', color:'#a78bfa',
    category:'custom', description:'', tutorial:'', verilogCode:'',
    ports:{ inputs:[{name:'A',width:1}], outputs:[{name:'X',width:1}] },
  },
  setCustomBlockDraft: (d) => set({ customBlockDraft: { ...get().customBlockDraft, ...d } }),
  resetCustomBlockDraft: () => set({ customBlockDraft: {
    id:'', label:'', symbol:'', module:'', color:'#a78bfa',
    category:'custom', description:'', tutorial:'', verilogCode:'',
    ports:{ inputs:[{name:'A',width:1}], outputs:[{name:'X',width:1}] },
  }}),

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: [],
  pushNotification: (msg, type='info') => {
    const id = Date.now();
    set({ notifications: [...get().notifications, { id, msg, type }] });
    setTimeout(() => set({ notifications: get().notifications.filter(n => n.id !== id) }), 4000);
  },
  dismissNotification: (id) => set({ notifications: get().notifications.filter(n => n.id !== id) }),
}));

export default useStore;
