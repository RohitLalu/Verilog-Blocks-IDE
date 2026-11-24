'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { dataDirs, assertWritableLocations } = require('../server/appPaths.js');
const { toolPath } = require('../server/toolEnv.js');

const base = { appDir: '/Apps/VBiDE/Contents/Resources/app.asar', userData: '/Users/me/Library/Application Support/VerilogBlocks IDE' };

test('a packaged app writes under the per-user data folder, never inside its own bundle', () => {
  const d = dataDirs({ ...base, isPackaged: true, env: {} });
  assert.equal(d.legacy, false); assert.equal(d.root, base.userData);
  for (const k of ['projects', 'synthesis', 'atpg', 'userBlocks', 'prefs']) assert.ok(d[k].startsWith(path.join(base.userData)), k + ' -> ' + d[k]);
  assert.doesNotThrow(() => assertWritableLocations(d));
});

test('in development the legacy layout is kept, so existing local projects stay visible', () => {
  const d = dataDirs({ appDir: '/src/verilog-ide', userData: '/home/me/.config/vbide', isPackaged: false, env: {} });
  assert.equal(d.legacy, true);
  assert.equal(d.projects, path.join('/src/verilog-ide', 'projects'));
  assert.equal(d.synthesis, path.join('/src/verilog-ide', 'synthesis', 'output'));
  assert.equal(d.userBlocks, path.join('/src/verilog-ide', 'pdk', 'user-blocks'));
  assert.equal(d.prefs, path.join('/home/me/.config/vbide', 'vbide-prefs.json'));
});

test('VBIDE_DATA_DIR overrides both (portable installs, tests, the smoke test)', () => {
  for (const isPackaged of [true, false]) {
    const d = dataDirs({ ...base, isPackaged, env: { VBIDE_DATA_DIR: '/tmp/vb' } });
    assert.equal(d.root, path.resolve('/tmp/vb')); assert.equal(d.projects, path.join(path.resolve('/tmp/vb'), 'projects')); assert.equal(d.legacy, false);
  }
});

test('a data location inside an .asar archive is refused up front', () => {
  const bad = dataDirs({ ...base, isPackaged: false, env: {} });                      // legacy layout under app.asar
  assert.throws(() => assertWritableLocations(bad), /inside the app archive/);
  assert.doesNotThrow(() => assertWritableLocations({ projects: '/a/b.asarx/c', prefs: '/p' }));   // only a real .asar segment counts
});

test('tool PATH: bundled tools first, the user\'s PATH next, Homebrew prefixes appended', () => {
  const p = toolPath({ platform: 'darwin', envPath: '/usr/bin:/bin:/usr/sbin:/sbin', resourcesPath: '/Apps/V.app/Contents/Resources', packaged: true });
  assert.deepEqual(p.split(':'), [path.join('/Apps/V.app/Contents/Resources', 'tools', 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/opt/local/bin']);
});

test('tool PATH: unpackaged runs add no bundled directory; existing entries keep their order and are not duplicated', () => {
  const p = toolPath({ platform: 'darwin', envPath: '/usr/local/bin:/usr/bin', resourcesPath: '/x', packaged: false }).split(':');
  assert.ok(!p.some(d => d.includes('tools')));
  assert.deepEqual(p.slice(0, 2), ['/usr/local/bin', '/usr/bin']); assert.equal(p.filter(d => d === '/usr/local/bin').length, 1);
  assert.deepEqual(toolPath({ platform: 'linux', envPath: '/usr/bin' }).split(':'), ['/usr/bin', '/usr/local/bin']);
});

test('tool PATH on Windows uses ; and adds nothing', () => {
  assert.equal(toolPath({ platform: 'win32', envPath: 'C:\\a;C:\\b' }), 'C:\\a;C:\\b');
});

test('tool PATH in a packaged Windows app has the bundled bin and lib (the DLLs are found through PATH)', () => {
  const r = 'C:\\V\\resources';
  assert.deepEqual(toolPath({ platform: 'win32', envPath: 'C:\\a', resourcesPath: r, packaged: true }).split(';'),
    [path.join(r, 'tools', 'bin'), path.join(r, 'tools', 'lib'), 'C:\\a']);
});
