'use strict';
// Guards against committing dependencies, build output, packaged apps or runtime data again.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const cwd = path.join(__dirname, '..');
const inRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd }).status === 0;
const opts = { skip: !inRepo && 'not inside a git work tree' };
const ignored = p => spawnSync('git', ['check-ignore', '--no-index', '-q', p], { cwd }).status === 0;

test('generated and local-only files are ignored', opts, () => {
  for (const p of [
    'node_modules/x/index.js', 'sub/dir/node_modules/y.js', 'dist/index.html', 'release/VBiDE.dmg',
    'Electron.app/Contents/MacOS/Electron', 'build/VBiDE.AppImage', 'VBiDE.deb', 'VBiDE Setup.exe',
    'projects/a/graph.json', 'synthesis/output/top_synth.v', 'atpg/top.bench', 'pdk/user-blocks/a.json', '.vbide-prefs.json',
    // paths outside verilog-ide/ are covered by the repo-root .gitignore alone
    '../tool/node_modules/x.js', '../tool/dist/index.html', '../tool/Electron.app/Contents/MacOS/Electron',
    'docker-projects/p/graph.json', 'docker-synthesis/synth.ys', 'docker-userblocks/a.json', '.DS_Store', 'src/.DS_Store', 'npm-debug.log',
  ]) assert.ok(ignored(p), `${p} should be ignored`);
});

test('source, config and fixtures are NOT ignored', opts, () => {
  for (const p of [
    'src/store/graphStore.js', 'server/server.js', 'electron-main.js', 'package.json', 'package-lock.json', 'Dockerfile', 'docker-compose.yml',
    '.dockerignore', 'pdk/pdk-registry.json', 'pdk/sky130/cells-manifest.json', 'test/fixtures/sky130_mini.lib', 'public/index.html', 'src/projects.js',
  ]) assert.ok(!ignored(p), `${p} must not be ignored`);
});
