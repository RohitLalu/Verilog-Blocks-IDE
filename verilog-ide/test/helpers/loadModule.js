'use strict';
// Loads an ES-module source file from src/ (store, codegen, …) into node:test by bundling it
// with esbuild — the bundler Vite already uses — so tests run the REAL app code.
const esbuild = require('esbuild');
const Module = require('module');
const path = require('path');

const cache = new Map();

function bundle(rel) {
  if (!cache.has(rel)) {
    const file = path.join(__dirname, '..', '..', rel);
    const out = esbuild.buildSync({
      entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false,
      loader: { '.js': 'jsx' }, logLevel: 'silent',
    });
    cache.set(rel, { code: out.outputFiles[0].text, file });
  }
  return cache.get(rel);
}

// Returns a FRESH module instance each call (e.g. a brand-new zustand store per test).
function load(rel) {
  const { code, file } = bundle(rel);
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  const m = new Module(file);
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(code, file);
  return m.exports;
}

module.exports = { load };
