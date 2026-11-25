'use strict';
// Wiring rules: no combinational loops (src/lib/graphChecks.js, enforced in the store's onConnect).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./helpers/loadModule.js');
const fresh = () => load('src/store/graphStore.js').default;
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pdk', 'sky130', 'cells-manifest.json'), 'utf8')).cells;
const cell = id => cells.find(c => c.id === id);
const ff = cells.find(c => c.category.startsWith('sequential/flip_flops') && c.ports.inputs.some(p => p.name === 'D'));

function canvas(...ids) {
  const s = fresh(), st = () => s.getState();
  ids.forEach((id, i) => st().addBlock(cell(id) || ff, { x: i * 300, y: 0 }));
  const n = st().nodes.map(x => x.id);
  const wire = (a, outPin, b, inPin) => { const before = st().edges.length; st().onConnect({ source: n[a], sourceHandle: outPin, target: n[b], targetHandle: inPin }); return st().edges.length > before; };
  return { st, wire, last: () => st().notifications.at(-1)?.msg || '' };
}

test('an output wired back to its own gate is refused', () => {
  const c = canvas('sky130_and2');
  assert.equal(c.wire(0, 'X', 0, 'A'), false);
  assert.match(c.last(), /combinational loop \(sky130_and2_1 → sky130_and2_1\)/);
});

test('a loop through several gates is refused and named; a straight chain is fine', () => {
  const c = canvas('sky130_and2', 'sky130_or2', 'sky130_inv');
  assert.equal(c.wire(0, 'X', 1, 'A'), true);
  assert.equal(c.wire(1, 'X', 2, 'A'), true);
  assert.equal(c.wire(2, 'Y', 0, 'A'), false, 'inv -> and closes and -> or -> inv -> and');
  assert.match(c.last(), /sky130_inv_1 → sky130_and2_1 → sky130_or2_1 → sky130_inv_1/);
  assert.equal(c.wire(2, 'Y', 1, 'B'), false, 'inv -> or closes or -> inv -> or');
  assert.equal(c.st().edges.length, 2);
});

test('feedback through a flip-flop is allowed (a register, not a loop)', () => {
  const c = canvas('sky130_inv', 'ff');
  const q = ff.ports.outputs[0].name;
  assert.equal(c.wire(1, q, 0, 'A'), true);
  assert.equal(c.wire(0, 'Y', 1, 'D'), true, 'Q -> inv -> D is a toggle, fine');
});
