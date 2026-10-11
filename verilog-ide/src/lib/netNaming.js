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
