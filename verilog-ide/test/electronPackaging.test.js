'use strict';
// Guards the desktop packaging setup. The full proof is `npm run smoke` against a packaged build; these
// are the cheap checks that catch the usual ways it breaks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = pkg.build.files;

test('the Vite build uses relative asset URLs (an absolute /assets/ path leaves the packaged window blank)', async () => {
  const { resolveConfig } = await import('vite');
  const cfg = await resolveConfig({ configFile: path.join(root, 'vite.config.js'), root }, 'build');
  assert.equal(cfg.base, './');
});

test('package.json points at a main file that exists, and the build config ships what the app needs', () => {
  assert.ok(fs.existsSync(path.join(root, pkg.main)), pkg.main);
  for (const need of ['dist/**', 'server/**/*.js', 'pdk/**', 'electron-main.js', 'preload.js']) assert.ok(files.includes(need), 'build.files lacks ' + need);
  assert.ok(files.includes('!pdk/user-blocks/**'), 'user blocks are user data, not part of the app');
  assert.equal(pkg.build.asar, true);
});

// What the main process (transitively) loads
function loaded() {
  const builtin = new Set(require('module').builtinModules), seen = new Set(), pkgs = new Set(), queue = ['electron-main.js', 'preload.js'];
  while (queue.length) {
    const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
    for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = m[1];
      if (r.startsWith('.')) queue.push(path.normalize(path.join(path.dirname(f), r)).replace(/\\/g, '/'));
      else if (!builtin.has(r) && !r.startsWith('node:')) pkgs.add(r);
    }
  }
  return { files: [...seen], pkgs: [...pkgs] };
}

test('the main process needs no npm package except electron, so excluding node_modules from the archive is safe', () => {
  assert.ok(files.includes('!node_modules/**/*'));
  assert.deepEqual(loaded().pkgs.sort(), ['electron']);
});

test('every file the main process loads is shipped (and the Express-only files are not)', () => {
  const l = loaded().files;
  for (const f of l) {
    assert.ok(fs.existsSync(path.join(root, f)), f + ' is required but missing');
    assert.ok(f === 'electron-main.js' || f === 'preload.js' || (f.startsWith('server/') && f.endsWith('.js')), f + ' would not be matched by build.files');
    assert.ok(!files.includes('!' + f), f + ' is excluded from the package but needed');
  }
  for (const f of ['server/server.js', 'server/security.js']) { assert.ok(!l.includes(f), f + ' unexpectedly loaded by the desktop app'); assert.ok(files.includes('!' + f)); }
});

test('the desktop app and the Docker server share the same tool runners', () => {
  const main = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8'), srv = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  for (const r of ['simRunner', 'synthRunner', 'atpgRunner']) { assert.ok(main.includes(`./server/${r}.js`), 'electron-main lacks ' + r); assert.ok(srv.includes(`./${r}.js`), 'server.js lacks ' + r); }
});
