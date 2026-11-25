// Structural checks on the block graph.

// A cell holds state (breaks a feedback loop) if it is a flip-flop or latch, or a block whose Verilog is clocked.
export const isSequential = node => (node.data.category || '').startsWith('sequential') ||
  /\b(posedge|negedge)\b/.test(node.data.verilogCode || '');

// Would a new wire source -> target close a loop through combinational cells only? (An output fed back to its own
// gate, or A -> B -> A.) Feedback through a flip-flop or latch is fine. Returns the loop's instance names, or null.
export function combinationalLoop(nodes, edges, sourceId, targetId) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const src = byId.get(sourceId), tgt = byId.get(targetId);
  if (!src || !tgt || isSequential(src) || isSequential(tgt)) return null;
  if (sourceId === targetId) return [src.data.instanceName, src.data.instanceName];
  const prev = new Map([[targetId, null]]), queue = [targetId];        // breadth-first from the target, forwards
  while (queue.length) {
    const id = queue.shift();
    for (const e of edges) {
      if (e.source !== id || prev.has(e.target)) continue;
      const next = byId.get(e.target);
      if (!next || isSequential(next)) continue;
      prev.set(e.target, id);
      if (e.target === sourceId) {                                       // target ... -> source, then the new wire back
        const path = []; for (let c = sourceId; c !== null; c = prev.get(c)) path.unshift(byId.get(c).data.instanceName);
        return [src.data.instanceName, ...path];
      }
      queue.push(e.target);
    }
  }
  return null;
}
