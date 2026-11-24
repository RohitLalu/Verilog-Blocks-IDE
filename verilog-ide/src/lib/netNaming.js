// Net / edge naming for the graph.
//
// A net is named after its DRIVER (source instance + output port), so every edge
// that fans out from one output shares a single Verilog net. Naming per edge
// (the old scheme) left all but one fan-out branch undriven.
export const netName = (srcNode, handle) => pinSignal(srcNode, handle);

// The Verilog signal for a block's pin: the name the user gave it (data.pinNames), else "<instance>_<pin>".
// An output's name is also the name of the net it drives; an unconnected pin's name is the module port's name.
export const pinSignal = (node, pin) => node.data.pinNames?.[pin] || `${node.data.instanceName}_${pin}`;

const KEYWORDS = new Set(('always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config deassign default defparam ' +
  'design disable edge else end endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable endtask event for ' +
  'force forever fork function generate genvar highz0 highz1 if ifnone incdir include initial inout input instance integer join large ' +
  'liblist library localparam logic macromodule medium module nand negedge nmos nor noshowcancelled not notif0 notif1 or output parameter ' +
  'pmos posedge primitive pull0 pull1 pulldown pullup pulsestyle_ondetect pulsestyle_onevent rcmos real realtime reg release repeat ' +
  'rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify specparam strong0 strong1 supply0 supply1 table task ' +
  'time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use uwire vectored wait wand weak0 weak1 while wire wor xnor xor ' +
  'bit byte int shortint longint string void top top_tb dut').split(' '));

// Why `name` can't be used for pin `pin` (dir 'in'|'out') of node `nodeId`, or null if it can. '' means "back to the default".
// Two unconnected inputs may share a name on purpose: they become one shared input port. Anything else must be unique.
export function checkPinName(nodes, edges, nodeId, pin, dir, name) {
  if (name === '') return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `"${name}" is not a Verilog name: use letters, digits and _, starting with a letter or _.`;
  if (name.length > 64) return 'Keep names to 64 characters or fewer.';
  if (KEYWORDS.has(name)) return `"${name}" is a reserved word in Verilog.`;
  const driven = new Set(edges.map(e => `${e.target}:${e.targetHandle}`));
  for (const n of nodes) {
    if (n.data.instanceName === name) return `"${name}" is already the name of block ${n.data.instanceName}.`;
    for (const p of n.data.ports?.outputs || []) {
      if ((n.id !== nodeId || p.name !== pin) && pinSignal(n, p.name) === name) return `"${name}" is already used by ${n.data.instanceName}.${p.name}.`;
    }
    for (const p of n.data.ports?.inputs || []) {
      if (n.id === nodeId && p.name === pin) continue;
      if (driven.has(`${n.id}:${p.name}`) || pinSignal(n, p.name) !== name) continue;
      if (dir === 'out') return `"${name}" is already used by ${n.data.instanceName}.${p.name}.`;   // an input may share it, an output may not
    }
  }
  return null;
}

// Deterministic and unique per (source port -> target port) pair. No timestamps or
// random ids, so saved projects and generated Verilog stay stable between runs.
export const edgeId = c => `e_${c.source}_${c.sourceHandle}__${c.target}_${c.targetHandle}`;

// Re-derive net names / ids for edges loaded from older saved projects.
export function normalizeEdges(nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out = new Map();
  edges.forEach(e => {
    const src = byId.get(e.source);
    if (!src) { out.set(e.id, e); return; }
    const wireName = netName(src, e.sourceHandle);
    const id = edgeId(e);
    out.set(id, { ...e, id, label: wireName, data: { ...e.data, wireName } });
  });
  return [...out.values()];
}

// ── Instance names ──────────────────────────────────────────────────────────────────────
// Next free "<base>_<n>" given the names already in use. `floor` lets a caller keep a session
// counter so a deleted instance's name isn't immediately recycled. Deriving from the names that
// actually exist (not just a counter) is what keeps names unique after save/open and undo,
// neither of which restore a counter.
export function nextInstanceName(names, base, floor = 0) {
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_(\\d+)$');
  let max = floor;
  for (const nm of names) { const m = re.exec(nm || ''); if (m) max = Math.max(max, +m[1]); }
  return { name: `${base}_${max + 1}`, index: max + 1 };
}

// Repair projects saved while duplicate names were possible: later duplicates get fresh names.
export function dedupeInstanceNames(nodes) {
  const all = new Set(nodes.map(n => n.data?.instanceName).filter(Boolean));
  const seen = new Set(), renamed = [];
  const out = nodes.map(n => {
    const name = n.data?.instanceName;
    if (name && !seen.has(name)) { seen.add(name); return n; }
    const base = (name || n.data?.module || n.data?.id || 'inst').replace(/_\d+$/, '');
    const { name: fresh } = nextInstanceName(all, base);
    all.add(fresh); seen.add(fresh);
    renamed.push({ id: n.id, from: name, to: fresh });
    return { ...n, data: { ...n.data, instanceName: fresh } };
  });
  return { nodes: out, renamed };
}
