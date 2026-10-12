// Net / edge naming for the graph.
//
// A net is named after its DRIVER (source instance + output port), so every edge
// that fans out from one output shares a single Verilog net. Naming per edge
// (the old scheme) left all but one fan-out branch undriven.
export const netName = (srcNode, handle) => `${srcNode.data.instanceName}_${handle}`;

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
