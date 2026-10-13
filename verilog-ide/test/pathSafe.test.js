'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeName, safeId, resolveInside, insideAnyRoot, sanitizePrefs, HttpError } = require('../server/pathSafe.js');
const { findFiles, findFile } = require('../server/pdkFiles.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-ps-'));

test('safeName accepts ordinary names and rejects anything that is not a single path segment', () => {
  for (const ok of ['my_project', 'Adder 8-bit (v2)', 'a.b', 'Prüfung 1', '設計1', 'x'.repeat(100)]) assert.equal(safeName(ok), ok);
  for (const bad of ['../x', '..', 'a/b', 'a\\b', '.git', 'x.', 'x ', ' x', '', 'x'.repeat(101), 'a..b', 'a\nb', 'a\0b', 5, null, undefined, {}]) {
    assert.throws(() => safeName(bad), e => e instanceof HttpError && e.status === 400, JSON.stringify(bad));
  }
});

test('resolveInside refuses anything that lands outside its base', () => {
  const b = tmp();
  assert.equal(resolveInside(b, 'a', 'b.txt'), path.join(b, 'a', 'b.txt'));
  for (const bad of [['..'], ['../x'], ['a', '../../x'], ['/etc/passwd']]) assert.throws(() => resolveInside(b, ...bad), HttpError, JSON.stringify(bad));
  assert.throws(() => resolveInside(b, '../' + path.basename(b) + '-sibling'), HttpError, 'a sibling sharing the prefix is outside too');
});

test('insideAnyRoot resolves symlinks before deciding', () => {
  const root = tmp(), out = tmp(); const real = path.join(root, 'a.lib'), esc = path.join(out, 'x.lib');
  fs.writeFileSync(real, ''); fs.writeFileSync(esc, ''); fs.symlinkSync(esc, path.join(root, 'link.lib'));
  assert.equal(insideAnyRoot(real, [root]), true);
  assert.equal(insideAnyRoot(path.join(root, 'link.lib'), [root]), false);
  assert.equal(insideAnyRoot(real, [out, '', undefined]), false);
  assert.equal(insideAnyRoot(path.join(root, 'missing.lib'), [root]), false);
});

test('safeId and sanitizePrefs', () => {
  assert.equal(safeId('sky130'), 'sky130');
  for (const bad of ['../x', 'a/b', '', 'x'.repeat(40), 3]) assert.throws(() => safeId(bad), HttpError);
  assert.deepEqual(sanitizePrefs({ pdkPaths: { sky130: '/p', 'bad/id': '/x' }, lastPDK: 'gf180', junk: 1 }), { pdkPaths: { sky130: '/p' }, lastPDK: 'gf180' });
  for (const bad of [null, [], 'x', { pdkPaths: [] }, { pdkPaths: { sky130: 1 } }, { pdkPaths: { sky130: 'a\0b' } }]) assert.throws(() => sanitizePrefs(bad), HttpError);
});

test('findFiles stops at its entry budget instead of scanning an entire disk', () => {
  const root = tmp();
  for (let i = 0; i < 300; i++) fs.writeFileSync(path.join(root, `f${String(i).padStart(3, '0')}.txt`), '');
  fs.mkdirSync(path.join(root, 'zz')); fs.writeFileSync(path.join(root, 'zz', 'target.lib'), '');
  assert.deepEqual(findFiles(root, n => n === 'target.lib', 6, [], { left: 50 }), [], 'budget exhausted before reaching it');
  assert.equal(findFile(root, 'target.lib', 4), path.join(root, 'zz', 'target.lib'), 'found with the default budget');
  assert.equal(findFile(root, 'target.lib', 0), null, 'depth limit respected');
});
