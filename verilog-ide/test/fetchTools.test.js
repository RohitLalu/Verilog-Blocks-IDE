'use strict';
// Pure parts of scripts/fetch-tools.js. The real proof is the script's own verify step (and CI on each OS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { RULES, selectMembers, parseLdList, hostTarget } = require('../scripts/fetch-tools.js');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const lock = require('../tools/tools.lock.json');

test('every bundle target has a pinned, checksummed archive and is a target electron-builder can copy', () => {
  for (const t of Object.keys(RULES)) {
    const pin = lock.suite.assets[t];
    assert.ok(pin, `${t} has no pin`);
    assert.match(pin.sha256, /^[0-9a-f]{64}$/, `${t} sha256`);
    assert.ok(pin.size > 0);
  }
  assert.deepEqual(pkg.build.extraResources, [{ from: 'resources/tools/${os}-${arch}', to: 'tools', filter: ['**/*'] }]);
});

test('host target names match electron-builder ${os}-${arch}', () => {
  assert.equal(hostTarget('darwin', 'arm64'), 'mac-arm64');
  assert.equal(hostTarget('linux', 'x64'), 'linux-x64');
  assert.equal(hostTarget('win32', 'x64'), 'win-x64');
});

test('member selection keeps tools, data and candidate libraries, and drops the rest of the suite', () => {
  const P = 'oss-cad-suite/lib/python3.11/';
  const names = ['oss-cad-suite/', 'oss-cad-suite/bin/yosys', 'oss-cad-suite/bin/nextpnr-ice40', 'oss-cad-suite/libexec/ivl',
    'oss-cad-suite/lib/libz.so.1', P + 'os.py', 'oss-cad-suite/lib/yosys-abc', 'oss-cad-suite/lib/ivl/',
    'oss-cad-suite/lib/ivl/system.vpi', 'oss-cad-suite/share/yosys/cells_sim.v', 'oss-cad-suite/share/yosys/ice40/cells_sim.v',
    'oss-cad-suite/license/LICENSE.yosys', 'oss-cad-suite/license/LICENSE.ghdl',
    // verification tools: kept
    'oss-cad-suite/bin/sby', 'oss-cad-suite/libexec/sby', 'oss-cad-suite/share/yosys/python3/sby_core.py', 'oss-cad-suite/bin/yices-smt2',
    P + 'site-packages/cocotb-2.1-py3.11.egg/cocotb/__init__.py', P + 'site-packages/click/core.py',
    // ... and the parts of the suite's Python the app never uses: dropped
    P + 'site-packages/amaranth/hdl.py', P + 'test/test_os.py', P + 'tkinter/__init__.py', P + '__pycache__/os.cpython-311.pyc',
    P + 'config-3.11-x86_64-linux-gnu/libpython3.11.a', 'oss-cad-suite/bin/boolector'];
  const { top, picked } = selectMembers(names, RULES['linux-x64']);
  assert.equal(top, 'oss-cad-suite');
  assert.deepEqual(picked, ['oss-cad-suite/bin/yosys', 'oss-cad-suite/libexec/ivl', 'oss-cad-suite/lib/libz.so.1', P + 'os.py', 'oss-cad-suite/lib/yosys-abc',
    'oss-cad-suite/lib/ivl/system.vpi', 'oss-cad-suite/share/yosys/cells_sim.v', 'oss-cad-suite/license/LICENSE.yosys',
    'oss-cad-suite/bin/sby', 'oss-cad-suite/libexec/sby', 'oss-cad-suite/share/yosys/python3/sby_core.py', 'oss-cad-suite/bin/yices-smt2',
    P + 'site-packages/cocotb-2.1-py3.11.egg/cocotb/__init__.py', P + 'site-packages/click/core.py']);
});

test('ld.so --list output is parsed into resolved paths', () => {
  const out = '\tlinux-vdso.so.1 (0x00007ffd)\n\tlibz.so.1 => /s/lib/libz.so.1 (0x00007f00)\n\t/s/lib/ld-linux-x86-64.so.2 (0x00007f11)\n\tlibffi.so.8 => /s/lib/libffi.so.8 (0x0)\n';
  assert.deepEqual(parseLdList(out), ['/s/lib/libz.so.1', '/s/lib/libffi.so.8']);
});

test('iverilog gets a space-free alias of a tools folder whose path has a space (and none otherwise)', () => {
  const { ivlBaseAlias, removeAlias } = require('../server/toolEnv.js');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vbide-alias-'));
  const tools = path.join(tmp, 'Verilog Blocks.app', 'tools');
  fs.mkdirSync(path.join(tools, 'lib', 'ivl'), { recursive: true });
  fs.writeFileSync(path.join(tools, 'lib', 'ivl', 'marker'), 'x');
  assert.equal(ivlBaseAlias(path.join(tmp, 'nospace')), null);
  const alias = ivlBaseAlias(tools);
  assert.doesNotMatch(alias, /\s/);
  assert.equal(fs.readFileSync(path.join(alias, 'lib', 'ivl', 'marker'), 'utf8'), 'x');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.dirname(alias)).mode & 0o077, 0, 'alias folder is private');
  removeAlias(alias);
  assert.equal(fs.existsSync(path.dirname(alias)), false, 'alias folder removed');
  assert.equal(fs.readFileSync(path.join(tools, 'lib', 'ivl', 'marker'), 'utf8'), 'x', 'removing the alias leaves the tools alone');
  // Windows: a temp folder with a space (user name with a space) falls back to %ProgramData%
  const pd = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vbide-pd-'));
  const a2 = ivlBaseAlias(tools, { platform: 'win32', tmp: path.join(tmp, 'John Smith'), programData: pd });
  assert.ok(a2.startsWith(pd), a2);
  removeAlias(a2);
  assert.equal(ivlBaseAlias(tools, { platform: 'linux', tmp: path.join(tmp, 'a b') }), null, 'no space-free place: no alias');
  fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(pd, { recursive: true, force: true });
});

test('PE import tables are read without running the file (minimal PE32+ with one import)', () => {
  const { parsePeImports } = require('../scripts/fetch-tools.js');
  const b = Buffer.alloc(0x600), pe = 0x40, opt = pe + 24;
  b.writeUInt32LE(pe, 0x3c); b.write('PE\0\0', pe, 'latin1');
  b.writeUInt16LE(1, pe + 6); b.writeUInt16LE(0xf0, pe + 20); b.writeUInt16LE(0x20b, opt);
  b.writeUInt32LE(0x1000, opt + 112 + 8);                                         // import directory RVA
  const sec = opt + 0xf0; b.writeUInt32LE(0x200, sec + 8); b.writeUInt32LE(0x1000, sec + 12); b.writeUInt32LE(0x200, sec + 16); b.writeUInt32LE(0x400, sec + 20);
  b.writeUInt32LE(0x1100, 0x400 + 12); b.write('zlib1.dll\0', 0x500, 'latin1'); // one descriptor, then a zero one
  assert.deepEqual(parsePeImports(b), ['zlib1.dll']);
});
