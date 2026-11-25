'use strict';
// The Tools window's data (server/toolStatus.js): found / missing / bundled, path and version.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toolStatus, whichTool } = require('../server/toolStatus.js');

test('tools are found on PATH, reported with a version; bundled copies are told apart; missing ones say so', { skip: process.platform === 'win32' && 'uses a shell-script stand-in' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-tools-'));
  const bundled = path.join(root, 'app', 'tools', 'bin'), system = path.join(root, 'usr', 'bin');
  fs.mkdirSync(bundled, { recursive: true }); fs.mkdirSync(system, { recursive: true });
  const fake = (dir, name, line) => fs.writeFileSync(path.join(dir, name), `#!/bin/sh\necho "${line}"\n`, { mode: 0o755 });
  fake(bundled, 'yosys', 'Yosys 0.71'); fake(system, 'iverilog', 'Icarus Verilog version 14.0'); fake(system, 'vvp', 'Icarus Verilog runtime version 14.0');
  const st = Object.fromEntries(toolStatus({ bundledDir: path.join(root, 'app', 'tools'), envPath: [bundled, system].join(path.delimiter) }).map(t => [t.name, t]));
  assert.deepEqual([st.yosys.found, st.yosys.bundled, st.yosys.version], [true, true, 'Yosys 0.71']);
  assert.deepEqual([st.iverilog.found, st.iverilog.bundled, st.iverilog.version], [true, false, 'Icarus Verilog version 14.0']);
  assert.deepEqual([st.atalanta.found, st.atalanta.path, st.atalanta.version], [false, null, null]);
  assert.equal(whichTool('vvp', { envPath: system }), path.join(system, 'vvp'));
});

test('a found atalanta is reported without running it (it has no version option)', { skip: process.platform === 'win32' && 'uses a shell-script stand-in' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-tools-'));
  fs.writeFileSync(path.join(dir, 'atalanta'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  const a = toolStatus({ envPath: dir }).find(t => t.name === 'atalanta');
  assert.deepEqual([a.found, a.version], [true, null]);
});
