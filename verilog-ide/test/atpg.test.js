'use strict';
// Runs the real ATPG route (Yosys -> converter -> atalanta). Skipped unless yosys, python3 and atalanta are installed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const have = (cmd, arg) => !spawnSync(cmd, [arg]).error;
const missing = ['yosys', 'python3', 'atalanta'].filter(c => !have(c, c === 'python3' ? '--version' : c === 'yosys' ? '-V' : '--help'));
const opts = { skip: missing.length ? `needs ${missing.join(', ')} on PATH` : false };

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-atpg-'));
process.env.VBIDE_DATA_DIR = data;
const { app, DIRS } = require('../server/server.js');
let server, port;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); port = server.address().port; });
after(() => new Promise(r => server.close(r)));

const post = (url, body) => new Promise((resolve, reject) => {
  const p = JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: url, headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) } }, res => {
    let t = ''; res.on('data', d => t += d); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t) }));
  });
  r.on('error', reject); r.write(p); r.end();
});

test('ATPG reports coverage, and atalanta writes its pattern file into the ATPG folder — not the working directory', opts, async () => {
  const verilog = 'module top(input a, b, c, output y); assign y = (a & b) | c; endmodule\n';
  const leak = path.join(process.cwd(), 'top.test');
  fs.rmSync(leak, { force: true });
  const r = await post('/api/atpg/run', { projectName: 'atpg_t', verilog });
  assert.equal(r.status, 200); assert.equal(r.json.ok, true, JSON.stringify(r.json).slice(0, 300));
  assert.ok(r.json.coverage > 0, 'a coverage number');
  assert.ok(fs.existsSync(path.join(DIRS.atpg, 'top.test')), 'pattern file belongs in the ATPG folder');
  assert.equal(fs.existsSync(leak), false, 'top.test leaked into the process working directory');
});
