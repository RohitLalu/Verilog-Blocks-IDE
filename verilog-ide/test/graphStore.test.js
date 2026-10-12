'use strict';
// Undo/redo and instance naming, exercised against the real zustand store.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/loadModule.js');

const fresh = () => load('src/store/graphStore.js').default;
const { nextInstanceName } = load('src/lib/netNaming.js');
const { generateVerilog } = load('src/codegen/graphToVerilog.js');

const blk = (id, over = {}) => ({ id, module: id, label: id, ports: { inputs: [{ name: 'A', width: 1 }], outputs: [{ name: 'Y', width: 1 }] }, ...over });
const names = s => s.getState().nodes.map(n => n.data.instanceName);
const ids = s => s.getState().nodes.map(n => n.id);
const tick = () => new Promise(r => setImmediate(r));
const add = (s, id, x = 0) => s.getState().addBlock(blk(id), { x, y: 0 });

// ── undo / redo ─────────────────────────────────────────────────────────────────────────
test('the first action can be undone', () => {
  const s = fresh(); add(s, 'inv');
  assert.equal(s.getState().canUndo(), true);
  s.getState().undo();
  assert.deepEqual(names(s), []);
  assert.equal(s.getState().canUndo(), false);
  assert.equal(s.getState().canRedo(), true);
});

test('undo steps back exactly one action and redo returns to the latest state', () => {
  const s = fresh(); add(s, 'a'); add(s, 'b'); add(s, 'c');
  const U = () => s.getState().undo(), R = () => s.getState().redo();
  U(); assert.deepEqual(names(s), ['a_1', 'b_1']);
  U(); assert.deepEqual(names(s), ['a_1']);
  R(); assert.deepEqual(names(s), ['a_1', 'b_1']);
  R(); assert.deepEqual(names(s), ['a_1', 'b_1', 'c_1'], 'redo must be able to bring back the most recent work');
  assert.equal(s.getState().canRedo(), false);
});

test('a new action after undo discards the redo history', () => {
  const s = fresh(); add(s, 'a'); add(s, 'b'); s.getState().undo(); add(s, 'c');
  assert.equal(s.getState().canRedo(), false);
  assert.deepEqual(names(s), ['a_1', 'c_1']);
});

test('undo and redo past the ends are no-ops', () => {
  const s = fresh(); s.getState().undo(); s.getState().redo(); assert.deepEqual(names(s), []);
  add(s, 'a'); s.getState().undo(); s.getState().undo(); s.getState().redo(); s.getState().redo();
  assert.deepEqual(names(s), ['a_1']);
});

test('clear then undo restores the graph and the PDK lock', () => {
  const s = fresh(); add(s, 'a'); add(s, 'b'); s.getState().setPDKLocked(true);
  s.getState().clearGraph();
  assert.equal(s.getState().pdkLocked, false); assert.deepEqual(names(s), []);
  s.getState().undo();
  assert.deepEqual(names(s), ['a_1', 'b_1']); assert.equal(s.getState().pdkLocked, true);
});

test('deleting with the keyboard (React Flow remove changes) is ONE undoable step', async () => {
  const s = fresh(); add(s, 'a'); add(s, 'b', 200);
  const [n0, n1] = ids(s);
  s.getState().onConnect({ source: n0, sourceHandle: 'Y', target: n1, targetHandle: 'A' });
  const eid = s.getState().edges[0].id;
  // React Flow reports a node deletion as a node change AND a change for each attached edge, back to back
  s.getState().onNodesChange([{ type: 'remove', id: n0 }]);
  s.getState().onEdgesChange([{ type: 'remove', id: eid }]);
  assert.equal(s.getState().nodes.length, 1); assert.equal(s.getState().edges.length, 0);
  await tick();
  s.getState().undo();
  assert.equal(s.getState().nodes.length, 2, 'node should come back');
  assert.equal(s.getState().edges.length, 1, 'and so should its wire — in a single undo');
});

test('one drag gesture is one undo step, however many pointer moves it contains', () => {
  const s = fresh(); add(s, 'a'); const id = ids(s)[0];
  const C = c => s.getState().onNodesChange([{ type: 'position', id, ...c }]);
  C({ position: { x: 5, y: 5 }, dragging: true }); C({ position: { x: 9, y: 9 }, dragging: true }); C({ position: { x: 20, y: 20 }, dragging: true }); C({ dragging: false });
  assert.deepEqual(s.getState().nodes[0].position, { x: 20, y: 20 });
  s.getState().undo();
  assert.deepEqual(s.getState().nodes[0].position, { x: 0, y: 0 });
  assert.equal(s.getState().nodes.length, 1, 'undo reverted the drag, not the add');
});

test('arrow-key nudges are undoable, and holding a key down is a single step', () => {
  const s = fresh(); add(s, 'a'); const id = ids(s)[0], realNow = Date.now;
  try {
    let t = 2_000_000; Date.now = () => t;
    const nudge = x => s.getState().onNodesChange([{ type: 'position', id, position: { x, y: 0 }, dragging: false }]);
    nudge(10); t += 50; nudge(20); t += 50; nudge(30);          // key held down
    t += 2000; nudge(40);                                      // separate press
    s.getState().undo(); assert.equal(s.getState().nodes[0].position.x, 30);
    s.getState().undo(); assert.equal(s.getState().nodes[0].position.x, 0);
  } finally { Date.now = realNow; }
});

test('selecting nodes does not create undo steps', () => {
  const s = fresh(); add(s, 'a'); const before = s.getState()._past.length;
  s.getState().onNodesChange([{ type: 'select', id: ids(s)[0], selected: true }]);
  assert.equal(s.getState()._past.length, before);
});

test('typing in a parameter field is one undo step per burst of edits', () => {
  const s = fresh(); add(s, 'a'); const id = ids(s)[0], realNow = Date.now;
  try {
    let t = 1_000_000; Date.now = () => t;
    for (const v of ['1', '12', '123']) { s.getState().updateNodeParam(id, 'W', v); t += 100; }
    t += 5000; s.getState().updateNodeParam(id, 'W', '8');
    s.getState().undo(); assert.equal(s.getState().nodes[0].data.paramValues.W, '123');
    s.getState().undo(); assert.equal(s.getState().nodes[0].data.paramValues.W, undefined);
  } finally { Date.now = realNow; }
});

test('history is capped', () => {
  const s = fresh(); for (let i = 0; i < 75; i++) add(s, 'a');
  assert.ok(s.getState()._past.length <= 60);
});

// ── instance naming ─────────────────────────────────────────────────────────────────────
test('nextInstanceName picks the next free index and honours a floor', () => {
  assert.deepEqual(nextInstanceName([], 'and2'), { name: 'and2_1', index: 1 });
  assert.equal(nextInstanceName(['and2_1', 'and2_3'], 'and2').name, 'and2_4');
  assert.equal(nextInstanceName(['and2_1'], 'and2', 5).name, 'and2_6');
  assert.equal(nextInstanceName(['and2_1', 'and2x_9', 'nand2_7'], 'and2').name, 'and2_2', 'other cells must not interfere');
  assert.equal(nextInstanceName(['a.b_1'], 'a.b').name, 'a.b_2', 'regex metacharacters in the base are literal');
});

test('save → reopen → add never reuses an existing name', () => {
  const a = fresh(); add(a, 'and2'); add(a, 'and2');
  const saved = JSON.parse(JSON.stringify({ nodes: a.getState().nodes, edges: a.getState().edges })); // what Save persists
  const b = fresh(); b.getState().loadGraph(saved); add(b, 'and2');
  assert.deepEqual(names(b), ['and2_1', 'and2_2', 'and2_3']);
});

test('clear → undo → add never duplicates', () => {
  const s = fresh(); add(s, 'and2'); s.getState().clearGraph(); s.getState().undo(); add(s, 'and2');
  assert.deepEqual(names(s), ['and2_1', 'and2_2']);
});

test("a deleted instance's name is not recycled within a session", () => {
  const s = fresh(); add(s, 'and2'); add(s, 'and2'); s.getState().removeNode(ids(s)[1]); add(s, 'and2');
  assert.deepEqual(names(s), ['and2_1', 'and2_3']);
});

test('pasting gives every copy its own name, also right after reopening a project', () => {
  const a = fresh(); add(a, 'and2'); add(a, 'and2');
  const saved = JSON.parse(JSON.stringify({ nodes: a.getState().nodes, edges: [] }));
  const b = fresh(); b.getState().loadGraph(saved);
  b.getState().onNodesChange(ids(b).map(id => ({ type: 'select', id, selected: true })));
  b.getState().copySelection(); b.getState().pasteClipboard(); b.getState().pasteClipboard();
  const n = names(b); assert.equal(new Set(n).size, n.length, n.join(','));
  assert.equal(n.length, 6);
});

test('opening a project saved by an older version repairs duplicate instance names', () => {
  const dup = (id, x) => ({ id, type: 'blockNode', position: { x, y: 0 }, data: { ...blk('and2'), instanceName: 'and2_1', paramValues: {} } });
  const nodes = [dup('n0', 0), dup('n1', 200)];
  const edges = [{ id: 'legacy', source: 'n1', target: 'n0', sourceHandle: 'Y', targetHandle: 'A', data: { wireName: 'and2_1_and2_1_Y_0' } }];
  const s = fresh(); const { renamed } = s.getState().loadGraph({ nodes, edges });
  assert.equal(renamed.length, 1); assert.equal(renamed[0].from, 'and2_1');
  const n = names(s); assert.equal(new Set(n).size, 2);
  assert.equal(s.getState().edges[0].data.wireName, `${s.getState().nodes[1].data.instanceName}_Y`, 'net name follows the renamed driver');
  const v = generateVerilog(s.getState().nodes, s.getState().edges, 't').verilog;
  const ports = [...v.matchAll(/^\s*(?:input|output)\s+(?:wire|reg)\s*(?:\[[^\]]*\]\s*)?(\w+)/gm)].map(m => m[1]);
  assert.equal(new Set(ports).size, ports.length, 'generated ports must be distinct: ' + ports.join(','));
});

test('loadGraph is undoable and sets the PDK lock from the graph', () => {
  const a = fresh(); add(a, 'and2');
  const saved = JSON.parse(JSON.stringify({ nodes: a.getState().nodes, edges: [] }));
  const b = fresh(); add(b, 'inv'); b.getState().loadGraph(saved);
  assert.deepEqual(names(b), ['and2_1']); assert.equal(b.getState().pdkLocked, true);
  b.getState().undo(); assert.deepEqual(names(b), ['inv_1']);
});
