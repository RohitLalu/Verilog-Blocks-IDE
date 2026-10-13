'use strict';
// Starts the REAL server in-process on a random port (data in a temp dir) and attacks it over HTTP.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// ── fixtures: a PDK folder, a .lib OUTSIDE it, and a symlink pointing out of it ─────────────
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-sec-'));
const pdkRoot = path.join(base, 'pdk');
fs.mkdirSync(path.join(pdkRoot, 'lib'), { recursive: true });
fs.writeFileSync(path.join(pdkRoot, 'lib', 'ok.lib'), 'library(x){}');
fs.writeFileSync(path.join(pdkRoot, 'lib', 'notes.txt'), 'plain text');
const secret = path.join(base, 'secret.lib');
fs.writeFileSync(secret, 'TOP SECRET');
fs.symlinkSync(secret, path.join(pdkRoot, 'lib', 'link.lib'));
const otherRoot = path.join(base, 'other'); fs.mkdirSync(otherRoot); fs.writeFileSync(path.join(otherRoot, 'o.lib'), 'library(o){}');
fs.mkdirSync(path.join(base, 'victim'), { recursive: true }); fs.writeFileSync(path.join(base, 'victim', 'graph.json'), '{"leak":true}');

process.env.VBIDE_DATA_DIR = path.join(base, 'data');
process.env.SKY130_PDK_ROOT = pdkRoot;
process.env.VBIDE_ALLOWED_HOSTS = 'lab.example';
const { app, DIRS } = require('../server/server.js');
const { resolveHost, isLoopbackHost } = require('../server/security.js');

let server, port;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); port = server.address().port; });
after(() => new Promise(r => server.close(r)));

function request(method, url, { headers = {}, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
    const h = { Host: `127.0.0.1:${port}`, ...headers };
    if (payload !== undefined) { h['Content-Length'] = Buffer.byteLength(payload); if (!('Content-Type' in h)) h['Content-Type'] = 'application/json'; }
    const r = http.request({ host: '127.0.0.1', port, method, path: url, headers: h }, res => {
      let text = ''; res.on('data', d => text += d);
      res.on('end', () => { let json; try { json = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    r.on('error', reject); if (payload !== undefined) r.write(payload); r.end();
  });
}
const post = (url, body, opts) => request('POST', url, { body, ...opts });

// ── 1. path traversal through names ──────────────────────────────────────────────────────────
const BAD_NAMES = ['../escape', '..', '../../pwned', 'a/b', 'a\\b', '.hidden', 'trailing.', ' lead', 'x'.repeat(101), '', 'a\0b'];

test('project save rejects traversal and malformed names, and writes nothing outside projects/', async () => {
  for (const name of BAD_NAMES) {
    const r = await post('/api/project/save', { name, graph: {}, verilog: 'x' });
    assert.equal(r.status, 400, `name ${JSON.stringify(name)} -> ${r.status}`);
  }
  assert.equal(fs.existsSync(path.join(base, 'data', 'escape')), false);
  assert.equal(fs.existsSync(path.join(base, 'pwned')), false);
});

test('sensible names still save and load (spaces, parentheses, dashes)', async () => {
  for (const name of ['my_project', 'Adder 8-bit (v2)']) {
    assert.equal((await post('/api/project/save', { name, graph: { n: name }, verilog: '// v' })).status, 200);
    const l = await request('GET', '/api/project/load/' + encodeURIComponent(name));
    assert.equal(l.status, 200); assert.deepEqual(l.json.graph, { n: name });
  }
});

test('project load cannot read a project outside projects/ via ..%2F', async () => {
  const r = await request('GET', '/api/project/load/..%2F..%2Fvictim');
  assert.equal(r.status, 400); assert.ok(!r.text.includes('leak'));
});

test('export-as-block rejects traversal and stays inside user-blocks', async () => {
  assert.equal((await post('/api/project/export-as-block', { name: '../../boom', blockMeta: {} })).status, 400);
  assert.equal(fs.existsSync(path.join(base, 'boom.json')), false);
  await post('/api/project/save', { name: 'blk', graph: {}, verilog: 'module blk; endmodule' });
  assert.equal((await post('/api/project/export-as-block', { name: 'blk', blockMeta: { id: 'blk' } })).status, 200);
  assert.ok(fs.existsSync(path.join(DIRS.userBlocks, 'blk.json')));
});

test('sim, synth and atpg reject bad project names before touching the disk or running any tool', async () => {
  for (const url of ['/api/sim/run', '/api/yosys/synth', '/api/atpg/run']) {
    const r = await post(url, { projectName: '../escape', verilog: 'module top; endmodule', testbench: '', pdkId: 'sky130', pdkRoot });
    assert.equal(r.status, 400, url); assert.ok(r.json && r.json.error, url + ' should answer with JSON');
  }
  assert.equal(fs.existsSync(path.join(base, 'data', 'escape')), false);
});

test('cells-manifest ids are validated', async () => {
  assert.equal((await request('GET', '/api/pdk/cells-manifest/..%2F..')).status, 400);
  assert.equal((await request('GET', '/api/pdk/cells-manifest/sky130')).status, 200);
});

// ── 2. arbitrary file read via read-lib ──────────────────────────────────────────────────────
test('read-lib serves a .lib inside a configured PDK folder', async () => {
  const r = await post('/api/pdk/read-lib', { libPath: path.join(pdkRoot, 'lib', 'ok.lib') });
  assert.equal(r.status, 200); assert.equal(r.json.content, 'library(x){}');
});

test('read-lib refuses /etc/passwd, non-.lib files, .lib files outside the PDK, and symlink escapes', async () => {
  const cases = [
    ['/etc/passwd', 400], [path.join(pdkRoot, 'lib', 'notes.txt'), 400], [secret, 403],
    [path.join(pdkRoot, 'lib', 'link.lib'), 403], [path.join(pdkRoot, '..', 'secret.lib'), 403], [path.join(pdkRoot, 'lib', 'nope.lib'), 403],
  ];
  for (const [libPath, status] of cases) {
    const r = await post('/api/pdk/read-lib', { libPath });
    assert.equal(r.status, status, libPath); assert.ok(!r.text.includes('TOP SECRET') && !r.text.includes('root:'), 'leaked content: ' + libPath);
  }
  assert.equal((await post('/api/pdk/read-lib', { libPath: 42 })).status, 400);
});

test('a PDK folder added through preferences becomes readable; others stay refused', async () => {
  assert.equal((await post('/api/pdk/read-lib', { libPath: path.join(otherRoot, 'o.lib') })).status, 403);
  assert.equal((await post('/api/prefs', { pdkPaths: { gf180: otherRoot } })).status, 200);
  assert.equal((await post('/api/pdk/read-lib', { libPath: path.join(otherRoot, 'o.lib') })).status, 200);
});

test('validate-path refuses files and missing paths', async () => {
  assert.equal((await post('/api/pdk/validate-path', { pdkId: 'sky130', rootPath: '/etc/passwd' })).json.ok, false);
  assert.equal((await post('/api/pdk/validate-path', { pdkId: 'sky130', rootPath: '/no/such' })).json.ok, false);
  assert.equal((await post('/api/pdk/validate-path', { pdkId: 'sky130', rootPath: pdkRoot })).json.ok, true);
});

// ── 3. cross-site and DNS-rebinding access ───────────────────────────────────────────────────
test('requests for an unknown Host are refused (DNS rebinding); configured hosts are allowed', async () => {
  assert.equal((await request('GET', '/api/health', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await request('GET', '/api/health', { headers: { Host: 'evil.example:3000' } })).status, 403);
  assert.equal((await request('GET', '/api/health', { headers: { Host: 'lab.example' } })).status, 200);
  assert.equal((await request('GET', '/api/health', { headers: { Host: 'localhost:9999' } })).status, 200);
  assert.equal((await request('GET', '/api/health', { headers: { Host: '[::1]:3000' } })).status, 200);
});

test('a cross-origin page cannot use the API, and CORS is not enabled', async () => {
  const evil = { Origin: 'http://evil.example' };
  const w = await post('/api/prefs', {}, { headers: evil });
  assert.equal(w.status, 403);
  const r = await request('GET', '/api/project/list', { headers: evil });
  assert.equal(r.status, 403); assert.equal(r.headers['access-control-allow-origin'], undefined);
  const pre = await request('OPTIONS', '/api/prefs', { headers: { ...evil, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.headers['access-control-allow-origin'], undefined);
  const ok = await post('/api/prefs', {}, { headers: { Origin: `http://127.0.0.1:${port}` } });
  assert.equal(ok.status, 200); assert.equal(ok.headers['access-control-allow-origin'], undefined);
});

test('the Vite dev origin works through the proxy; other origins (even other localhost ports) do not', async () => {
  // the proxy forwards Host=127.0.0.1:<api port> and leaves Origin as the page's origin
  assert.equal((await post('/api/prefs', {}, { headers: { Origin: 'http://localhost:5173' } })).status, 200);
  assert.equal((await post('/api/prefs', {}, { headers: { Origin: 'http://127.0.0.1:5173' } })).status, 200);
  for (const o of ['http://localhost:5174', 'https://localhost:5173', 'http://evil.example:5173', 'http://localhost:5173.evil.example']) {
    assert.equal((await post('/api/prefs', {}, { headers: { Origin: o } })).status, 403, o);
  }
});

test('in production the dev origin is NOT allowed, and extra origins must be configured explicitly', () => {
  const { guards } = require('../server/security.js');
  const run = (env, origin, host = '127.0.0.1:3000') => {
    let out = 'next';
    guards(env)[1]({ headers: { origin, host } }, { status: c => ({ json: () => { out = c; } }) }, () => { out = 'next'; });
    return out;
  };
  assert.equal(run({ NODE_ENV: 'production' }, 'http://localhost:5173'), 403);
  assert.equal(run({ NODE_ENV: 'production', VBIDE_ALLOWED_ORIGINS: 'https://lab.example/' }, 'https://lab.example'), 'next');
  assert.equal(run({}, 'http://localhost:5173'), 'next');
  assert.equal(run({ NODE_ENV: 'production' }, 'http://127.0.0.1:3000'), 'next', 'same-origin always works');
});

test('mutating requests must be JSON (blocks no-preflight form posts)', async () => {
  const r = await request('POST', '/api/prefs', { raw: '{"pdkPaths":{}}', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(r.status, 415);
  assert.equal((await request('POST', '/api/prefs', { raw: 'a=b', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
});

// ── 4. hardening details ─────────────────────────────────────────────────────────────────────
test('preferences keep only known keys and reject malformed values', async () => {
  assert.equal((await post('/api/prefs', { pdkPaths: { sky130: pdkRoot }, evil: 'x', lastPDK: 'sky130' })).status, 200);
  const p = (await request('GET', '/api/prefs')).json;
  assert.equal(p.evil, undefined); assert.equal(p.lastPDK, 'sky130');
  assert.equal((await post('/api/prefs', { pdkPaths: 'nope' })).status, 400);
  assert.equal((await post('/api/prefs', { pdkPaths: { sky130: 5 } })).status, 400);
});

test('unknown API routes are JSON 404s, not the single-page app', async () => {
  const r = await request('GET', '/api/does-not-exist');
  assert.equal(r.status, 404); assert.match(r.json.error, /Unknown API route/);
});

test('the server binds to loopback unless explicitly told otherwise', () => {
  assert.equal(resolveHost({}), '127.0.0.1');
  assert.equal(resolveHost({ VBIDE_HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(isLoopbackHost('127.0.0.1'), true); assert.equal(isLoopbackHost('0.0.0.0'), false);
});
