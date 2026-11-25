#!/usr/bin/env node
'use strict';
// Builds resources/tools/<os>-<arch>/: the parts of OSS CAD Suite the app runs (Yosys, Icarus Verilog) with the shared
// libraries they load and their licences, plus atalanta built from source when asked. electron-builder copies that
// folder into the app (package.json build.extraResources) and server/toolEnv.js puts its bin/ first on PATH.
//
//   node scripts/fetch-tools.js [--with-atalanta] [--no-verify] [--target win-x64] [--check]
//
// It builds for the machine it runs on: the library walk uses that platform's own loader / otool, and the result is
// verified by running it. Each installer is therefore built on its own OS (.github/workflows/desktop.yml). Only the
// Windows bundle can also be assembled elsewhere (its DLL imports are read from the files), but then it is not verified.
// atalanta is opt-in (or VBIDE_BUNDLE_ATALANTA=1) because its licence allows teaching/research use only; see README.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const ROOT = path.join(__dirname, '..');
const LOCK = require('../tools/tools.lock.json');
const CACHE = path.join(ROOT, '.cache', 'tools');

const hostTarget = (platform = process.platform, arch = process.arch) => `${{ darwin: 'mac', linux: 'linux', win32: 'win' }[platform]}-${arch}`;

// ── what to take from the suite (paths relative to its top folder) ──────────────────────────────────────────────
// `keep`: always copied. `libs`: candidate shared libraries; only the ones the binaries load are copied.
// `binaries`: the files whose shared-library dependencies are walked (iverilog's .vpi/.tgt plug-ins load libraries too).
const BINARIES = /^libexec\/[^/]+$|^lib\/ivl\/[^/]+\.(vpi|tgt)$|^lib\/python3\.11\/lib-dynload\/[^/]+\.so$|^lib\/python3\.11\/site-packages\/cocotb[^/]*\.egg\/.*\.(so|dylib|vpl)$/;

// Verification tools (macOS, Linux): Python 3.11 with cocotb (pyuvm is added from PyPI), SymbiYosys with the yices solver
// (the app's .sby jobs use smtbmc + yices; z3 would add 25-50 MB unused). The bin/ wrappers start them with the suite's Python.
const VERIFY_KEEP = [
  /^bin\/(tabbypy3|sby|yosys-smtbmc|yices-smt2)$/, /^libexec\/(python3\.11|sby|yosys-smtbmc|yices-smt2)$/,
  /^lib\/python3\.11\//, /^share\/yosys\/python3\//,
  /^license\/LICENSE\.(python3|cocotb|sby|yices)$/,
];
// Parts of the suite's Python that the app never uses: test suites, GUI toolkits, the static library, other packages
// (site-packages keeps cocotb and find_libpython for cocotb, and click for SymbiYosys)
const DROP = [
  /^lib\/python3\.11\/(test|idlelib|tkinter|turtledemo|ensurepip|lib2to3|config-3\.11[^/]*)\//, /\/__pycache__\//,
  /^lib\/python3\.11\/site-packages\/(?!cocotb|find_libpython|click)/, /\/tests?\/.*\.py$/,
  /^lib\/ivl\/vhdlpp/,                 // VHDL front end: the app writes Verilog only
];
const RULES = {
  'linux-x64': {
    keep: [
      /^bin\/(yosys|yosys-abc|iverilog|vvp)$/,
      /^libexec\/(yosys|yosys-abc|iverilog|ivl|ivlpp|vvp)$/,
      /^lib\/ivl\//, /^lib\/tcl8\.6\//, /^share\/yosys\/[^/]+$/, /^share\/yosys\/choices\//,
      /^lib\/ld-linux-x86-64\.so\.2$/,
      /^lib\/yosys-abc$/,             // symlink to ../bin/yosys-abc: Yosys looks for ABC next to itself, and under the suite's loader that is lib/
      /^license\/LICENSE\.(yosys|iverilog)$/, ...VERIFY_KEEP,
    ],
    drop: DROP,
    libs: /^lib\/[^/]+\.so(\.[\d.]+)?$/,
    binaries: BINARIES,
  },
  'mac-arm64': {
    keep: [
      /^bin\/(yosys|yosys-abc|iverilog|vvp)$/,
      /^libexec\/(yosys|yosys-abc|iverilog|ivl|ivlpp|vvp|realpath)$/,   // the bin/ wrappers resolve paths with libexec/realpath
      /^lib\/ivl\//, /^share\/yosys\/[^/]+$/, /^share\/yosys\/choices\//,
      /^license\/LICENSE\.(yosys|iverilog)$/, ...VERIFY_KEEP,
    ],
    drop: DROP,
    libs: /^lib\/[^/]+\.dylib$/,
    binaries: BINARIES,
  },  'win-x64': {
    keep: [
      /^bin\/(yosys|yosys-abc|iverilog|vvp)\.exe$/,
      /^lib\/ivl\//, /^share\/yosys\/[^/]+$/, /^share\/yosys\/choices\//,
      /^license\/LICENSE\.(yosys|iverilog)$/,
      // SymbiYosys and its solvers; the suite's Windows Python (no cocotb there: it is a MinGW build) runs sby's script
      // sby calls yosys-smtbmc as a program: the .exe launchers run the -script.py next to them with python3 from PATH
      /^bin\/(yices-smt2|sby|yosys-smtbmc)\.exe$/i, /^bin\/(sby|yosys-smtbmc)-script\.py$/, /^lib\/python3\.exe$/i,
      /^lib\/python3\.11\//, /^share\/yosys\/python3\//, /^license\/LICENSE\.(python3|sby|yices)$/,
    ],
    drop: DROP,
    libs: /^(bin|lib)\/[^/]+\.dll$/i,
    // Windows looks next to the program before PATH, so each DLL goes beside the programs that load it (bin/ for the tools
    // and the .vpi plug-ins vvp loads, lib/ivl/ for ivl.exe and its .tgt plug-ins). Then a different MinGW runtime on PATH
    // (Git Bash, MSYS2, Strawberry Perl) can't be picked up instead: that made yosys fail to start in CI.
    // folder -> the files whose imports must resolve there (vvp in bin/ loads the .vpi plug-ins; ivl.exe loads the .tgt)
    // lib/: python3.exe and Python's extension modules, which Windows resolves next to python3.exe
    dllDirs: { bin: /^bin\/[^/]+\.exe$|^lib\/ivl\/[^/]+\.vpi$/i, 'lib/ivl': /^lib\/ivl\/[^/]+\.(exe|tgt|vpi)$/i,
               lib: /^lib\/[^/]+\.exe$|^lib\/python3\.11\/lib-dynload\/[^/]+\.dll$/i },
    binaries: /^bin\/[^/]+\.exe$|^lib\/ivl\/[^/]+\.(exe|vpi|tgt)$|^lib\/[^/]+\.exe$|^lib\/python3\.11\/lib-dynload\/[^/]+\.dll$/i,
  },
};

const die = msg => { throw new Error(msg); };          // throw, never process.exit: the finally below must clean up
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) die(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} exited with ${r.status}\n${((r.stderr || '') + (r.stdout || '')).slice(0, 4000)}`);
  return r.stdout + (opts.withStderr ? r.stderr : '');
}

async function sha256(file) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

async function download(pin, tag) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, pin.asset);
  if (!fs.existsSync(file) || fs.statSync(file).size !== pin.size) {
    const url = LOCK.suite.url.replace('{tag}', tag).replace('{asset}', pin.asset);
    console.log(`downloading ${url} (${(pin.size / 1e6).toFixed(0)} MB)`);
    const res = await fetch(url);
    if (!res.ok) die(`download failed: HTTP ${res.status} for ${url}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file + '.part'));
    fs.renameSync(file + '.part', file);
  }
  if (fs.statSync(file).size !== pin.size) die(`${pin.asset}: size ${fs.statSync(file).size}, expected ${pin.size}`);
  const sum = await sha256(file);
  if (sum !== pin.sha256) die(`${pin.asset}: sha256 ${sum} does not match tools.lock.json (${pin.sha256}); delete it from ${CACHE} and retry`);
  return file;
}

// Members of the archive to extract: the kept files and the candidate libraries
function selectMembers(names, rules) {
  const top = names.find(n => n.includes('/')).split('/')[0];
  const rel = n => n.slice(top.length + 1).replace(/\/$/, '');
  const picked = names.filter(n => !n.endsWith('/') && (rules.keep.some(r => r.test(rel(n))) || rules.libs.test(rel(n))) &&
    !(rules.drop || []).some(r => r.test(rel(n))));
  return { top, picked, rel };
}

// "  libfoo.so.1 => /x/lib/libfoo.so.1 (0x...)" lines from `ld.so --list`
const parseLdList = out => [...out.matchAll(/=>\s+(\S+)\s+\(0x/g)].map(m => m[1]);

// Shared libraries (inside the suite) that the binaries load, transitively
// "\t@rpath/libffi.8.dylib (compatibility version ...)" lines from `otool -L`
const parseOtool = out => out.split('\n').slice(1).map(l => l.match(/^\s+(\S.*?) \(compatibility/)).filter(Boolean).map(m => m[1]);
// ELF (Linux), Mach-O incl. universal (macOS) or PE (Windows) by the first bytes
function isBinary(file) {
  const b = Buffer.alloc(4), fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, b, 0, 4, 0); } finally { fs.closeSync(fd); }
  const m = b.readUInt32BE(0);
  return m === 0x7f454c46 || [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(m) || b.readUInt16BE(0) === 0x4d5a;
}

// "path <dir> (offset N)" lines following "cmd LC_RPATH" in `otool -l`
const parseRpaths = out => { const r = [], l = out.split('\n');
  l.forEach((x, i) => { if (x.trim() === 'cmd LC_RPATH') { const m = (l[i + 2] || '').match(/^\s*path (.*) \(offset/); if (m) r.push(m[1]); } }); return r; };
const isSystemLib = n => /^\/(usr\/lib|System)\//.test(n);

// DLL names a Windows PE file imports (normal and delay-load import tables). Read from the file, so it works on any host.
function parsePeImports(buf) {
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') die('not a PE file');
  const nSec = buf.readUInt16LE(pe + 6), optSize = buf.readUInt16LE(pe + 20), opt = pe + 24;
  const dirs = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96);           // PE32+ : PE32
  const secs = Array.from({ length: nSec }, (_, i) => opt + optSize + 40 * i)
    .map(o => ({ va: buf.readUInt32LE(o + 12), size: Math.max(buf.readUInt32LE(o + 8), buf.readUInt32LE(o + 16)), raw: buf.readUInt32LE(o + 20) }));
  const off = rva => { const s = secs.find(s => rva >= s.va && rva < s.va + s.size); return s ? rva - s.va + s.raw : -1; };
  const cstr = o => buf.toString('latin1', o, buf.indexOf(0, o));
  const names = [];
  for (const [entry, stride, nameAt] of [[1, 20, 12], [13, 32, 4]]) {        // import table, delay-load import table
    const rva = buf.readUInt32LE(dirs + 8 * entry);
    for (let o = rva ? off(rva) : -1; o >= 0; o += stride) {
      const name = buf.readUInt32LE(o + nameAt);
      if (!name) break;
      names.push(cstr(off(name)));
    }
  }
  return names;
}

// Shared libraries (inside the suite's lib/) that the binaries load, transitively. Paths are relative to the suite.
function libraryClosure(target, suite, rules, kept) {
  const libDir = path.join(suite, 'lib'), found = new Set();
  // only real binaries: libexec/ also holds Python scripts (sby, yosys-smtbmc), which have no libraries to walk
  const bins = kept.filter(r => rules.binaries.test(r) && fs.lstatSync(path.join(suite, r)).isFile() && isBinary(path.join(suite, r)));
  if (target.startsWith('linux')) {
    const ld = path.join(libDir, 'ld-linux-x86-64.so.2');   // the suite's own loader: what the bin/ wrappers run the tools with
    for (const b of bins) {
      for (const p of parseLdList(sh(ld, ['--library-path', libDir, '--list', path.join(suite, b)]))) {
        if (path.resolve(p).startsWith(libDir + path.sep)) found.add('lib/' + path.basename(p));
      }
    }
  } else if (target.startsWith('mac')) {
    // No loader to ask: walk otool -L. The suite resolves its own libraries through @rpath / @loader_path to lib/.
    const queue = [...bins];
    while (queue.length) {
      const cur = queue.pop(), file = path.join(suite, cur);
      const self = (sh('otool', ['-D', file]).split('\n')[1] || '').trim();   // a library lists its own install name too
      const rpaths = parseRpaths(sh('otool', ['-l', file]));
      for (const dep of parseOtool(sh('otool', ['-L', file]))) {
        if (isSystemLib(dep) || dep === self) continue;
        // where macOS would look: @rpath via the file's LC_RPATHs, @loader_path = its folder, then the suite's lib/
        const dirs = dep.startsWith('@rpath/') ? rpaths : [path.dirname(dep)];
        const cands = dirs.map(d => path.resolve(path.dirname(file), d.replace(/^@loader_path|^@executable_path/, '.'), path.basename(dep)));
        const hit = [...cands, path.join(libDir, path.basename(dep))].find(f => f.startsWith(suite + path.sep) && fs.existsSync(f));
        if (!hit) die(`${dep} (needed by ${cur}) is not a system library and not found in the suite`);
        if (path.dirname(hit) !== libDir) continue;                            // inside a folder that is kept whole (cocotb)
        const r = 'lib/' + path.basename(hit);
        if (!found.has(r)) { found.add(r); queue.push(r); }
      }
    }
  } else if (target.startsWith('win')) {
    // Imports not found in the suite are Windows' own (kernel32, msvcrt, api-ms-win-*); the Windows CI run proves the rest.
    const inSuite = new Map(['lib', 'bin'].flatMap(d => fs.readdirSync(path.join(suite, d)).map(f => `${d}/${f}`))
      .filter(r => rules.libs.test(r)).map(r => [path.basename(r).toLowerCase(), r]));
    const queue = [...bins];
    while (queue.length) {
      for (const dep of parsePeImports(fs.readFileSync(path.join(suite, queue.pop())))) {
        const r = inSuite.get(dep.toLowerCase());
        if (r && !found.has(r)) { found.add(r); queue.push(r); }
      }
    }
  } else die(`no library walk for ${target}`);
  // a kept symlink (libvvp.dylib -> libvvp.1.dylib) needs its target too
  for (const r of [...found]) {
    let p = path.join(suite, r);
    while (fs.lstatSync(p).isSymbolicLink()) { p = path.resolve(path.dirname(p), fs.readlinkSync(p)); found.add('lib/' + path.basename(p)); }
  }
  return found;
}

function copyInto(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), dst);
  else { fs.copyFileSync(src, dst); fs.chmodSync(dst, st.mode); }
}

// atalanta from the pinned commit, compiled directly (no make: Windows has none)
function buildAtalanta(target, outBin) {
  const { repo, commit, sources } = LOCK.atalanta;
  const src = path.join(ROOT, '.cache', `atalanta-${commit.slice(0, 12)}`);
  if (!fs.existsSync(path.join(src, 'atalanta.cpp'))) {
    fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(src, { recursive: true });
    sh('git', ['init', '-q'], { cwd: src });
    sh('git', ['fetch', '-q', '--depth', '1', repo, commit], { cwd: src });   // GitHub's generated tarballs are not byte-stable
    sh('git', ['checkout', '-q', 'FETCH_HEAD'], { cwd: src });
  }
  // The one source change: time((long*)NULL) does not compile on 64-bit Windows (long is 32-bit, time_t 64-bit).
  // time(NULL) is the same call everywhere; on macOS/Linux long and time_t are already the same size.
  const rnd = path.join(src, 'random.cpp');
  fs.writeFileSync(rnd, fs.readFileSync(rnd, 'latin1').replace('time((long*)NULL)', 'time(NULL)'), 'latin1');
  const win = target.startsWith('win');
  const exe = path.join(outBin, win ? 'atalanta.exe' : 'atalanta');
  // gnu++14: clang rejects the old code's `register` under C++17. Static on Linux/Windows so it needs no runtime libraries.
  const flags = ['-O2', '-std=gnu++14', '-w', ...(target.startsWith('linux') ? ['-static'] : []), ...(win ? ['-static', '-DWIN32'] : [])];
  // Windows: 16 MB stack (default 1 MB; atalanta keeps large arrays on the stack and overflows, 0xC00000FD)
  sh(win ? 'g++' : 'c++', [...flags, ...sources, '-o', exe, ...(win ? ['-lpsapi', '-Wl,--stack,16777216'] : [])], { cwd: src });
  return exe;
}

// pyuvm (UVM in Python, pure Python) from PyPI, pinned and checksummed, unpacked into the bundled Python's site-packages
async function addPyuvm(out) {
  const { url, sha256: want, file } = LOCK.pyuvm;
  const whl = path.join(CACHE, file);
  if (!fs.existsSync(whl)) {
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) die(`download failed: HTTP ${res.status} for ${url}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(whl + '.part'));
    fs.renameSync(whl + '.part', whl);
  }
  const sum = await sha256(whl);
  if (sum !== want) die(`${file}: sha256 ${sum} does not match tools.lock.json`);
  sh(path.join(out, 'bin', 'tabbypy3'), ['-m', 'zipfile', '-e', whl, path.join(out, 'lib', 'python3.11', 'site-packages')]);
}

// The suite's sby and yosys-smtbmc launchers run `exec $release_bindir_abs/tabbypy3 ...` unquoted, which splits at the
// space of an installed app's path ("VerilogBlocks IDE.app"). Add the quotes; nothing else changes.
function quoteWrappers(out) {
  for (const name of ['sby', 'yosys-smtbmc']) {
    const f = path.join(out, 'bin', name);
    if (!fs.existsSync(f) || fs.statSync(f).size > 4096) continue;        // only the small launcher scripts
    const s = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, s.replace(/exec \$release_bindir_abs\/tabbypy3 /g, 'exec "$release_bindir_abs"/tabbypy3 '));
  }
}

function writeNotices(out, withAtalanta) {
  const lic = path.join(out, 'license');
  const parts = [
    'Third-party tools bundled with VerilogBlocks IDE. They run as separate programs; they are not linked into the app.',
    'The bin/sby and bin/yosys-smtbmc launcher scripts get quotes around one path (so they work from a folder with a space).',
    `Yosys and Icarus Verilog are unmodified binaries from OSS CAD Suite ${LOCK.suite.tag} (https://github.com/YosysHQ/oss-cad-suite-build).`,
    `Their source code: https://github.com/YosysHQ/yosys and https://github.com/steveicarus/iverilog; the suite's build scripts and the`,
    `versions used are at https://github.com/YosysHQ/oss-cad-suite-build/releases/tag/${LOCK.suite.tag}.`,
    'The shared libraries next to them come from the same release; their licences are listed in that release.',
  ];
  parts.push('Python 3.11, cocotb, SymbiYosys and the yices solver are unmodified, from the same OSS CAD Suite release;',
    `pyuvm ${LOCK.pyuvm.version} (Apache-2.0) is from PyPI (${LOCK.pyuvm.url}); its licence is in lib/python3.11/site-packages/pyuvm-${LOCK.pyuvm.version}.dist-info.`);
  if (withAtalanta) parts.push(`atalanta was built from ${LOCK.atalanta.repo} at commit ${LOCK.atalanta.commit}, with one change in random.cpp`,
    '(time((long*)NULL) -> time(NULL), so it compiles on 64-bit Windows). Its README restricts it to teaching and research use.');
  for (const f of fs.existsSync(lic) ? fs.readdirSync(lic).sort() : []) parts.push(`\n===== ${f} =====\n` + fs.readFileSync(path.join(lic, f), 'latin1'));
  fs.writeFileSync(path.join(out, 'THIRD_PARTY_NOTICES.txt'), parts.join('\n') + '\n');
}

// Run the bundle with a scrubbed environment: compile + simulate, synthesise through ABC, and atalanta if present
function verify(target, out) {
  const bin = path.join(out, 'bin'), win = target.startsWith('win');
  const sys = win ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'];
  const env = { PATH: [bin, ...sys].join(path.delimiter), ...(win ? { SystemRoot: process.env.SystemRoot } : {}), HOME: os.tmpdir() };
  const tool = t => path.join(bin, win ? `${t}.exe` : t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbide-verify-'));
  try {
    fs.writeFileSync(path.join(dir, 'top.v'), 'module top(input a, b, c, output y); assign y = (a & b) | ~c; endmodule\n');
    fs.writeFileSync(path.join(dir, 'tb.v'), 'module tb; reg a=1,b=1,c=1; wire y; top t(a,b,c,y); initial begin #1 $display("VBIDE-SIM %b", y); $finish; end endmodule\n');
    const o = { cwd: dir, env, withStderr: true };
    sh(tool('iverilog'), ['-o', 'sim.out', 'tb.v', 'top.v'], o);
    if (!/VBIDE-SIM 1/.test(sh(tool('vvp'), ['sim.out'], o))) die('vvp did not print the expected result');
    const ys = sh(tool('yosys'), ['-p', 'read_verilog top.v; synth -top top; abc -g AND,OR,XOR; stat'], o);
    if (!/Executing ABC pass/.test(ys) || !/\$_(AND|OR|XOR|NOT)_/.test(ys)) die('yosys did not map the design through ABC:\n' + ys.slice(-2000));
    // SymbiYosys: prove a one-gate property (on Windows, sby's script runs on the bundled Python)
    fs.writeFileSync(path.join(dir, 'prop.sv'), 'module prop(input a, b, output y); assign y = a & b; always @* assert (y == (a & b)); endmodule\n');
    fs.writeFileSync(path.join(dir, 'check.sby'), '[options]\nmode prove\n[engines]\nsmtbmc yices\n[script]\nread -formal prop.sv\nprep -top prop\n[files]\nprop.sv\n');
    const py = win ? path.join(out, 'lib', 'python3.exe') : tool('tabbypy3');
    const sby = win ? sh(py, [path.join(bin, 'sby-script.py'), '-f', 'check.sby'], { ...o, env: { ...env, PATH: [bin, path.join(out, 'lib'), ...sys].join(path.delimiter) } })
                    : sh(tool('sby'), ['-f', 'check.sby'], o);
    if (!/DONE \(PASS/.test(sby)) die('SymbiYosys did not prove a trivial property:\n' + sby.slice(-2000));
    if (!win) {
      // cocotb + pyuvm on the bundled Python, simulating with the bundled Icarus Verilog
      fs.writeFileSync(path.join(dir, 'top.v'), 'module top(input a, b, output y); assign y = a & b; endmodule\n');
      fs.writeFileSync(path.join(dir, 'test_top.py'), 'import cocotb, pyuvm\nfrom cocotb.triggers import Timer\n@cocotb.test()\nasync def t(dut):\n    dut.a.value = 1\n    dut.b.value = 1\n    await Timer(1, "ns")\n    assert int(dut.y.value) == 1\n');
      fs.writeFileSync(path.join(dir, 'run.py'), 'from cocotb_tools.runner import get_runner\nr = get_runner("icarus")\nr.build(sources=["top.v"], hdl_toplevel="top", timescale=("1ns", "1ps"))\nr.test(hdl_toplevel="top", test_module="test_top")\n');
      const c = sh(py, ['run.py'], o);
      if (!/TESTS=1 PASS=1 FAIL=0/.test(c)) die('cocotb did not pass a one-gate test:\n' + c.slice(-2000));
    }
    if (fs.existsSync(tool('atalanta'))) {
      // atalanta skips the first line of a bench file (the app's converter always writes a comment header there)
      fs.writeFileSync(path.join(dir, 't.bench'), '# verify\nINPUT(a)\nINPUT(b)\nOUTPUT(y)\ny = AND(a, b)\n');
      if (!/Fault coverage\s*:\s*100/.test(sh(tool('atalanta'), ['t.bench'], o))) die('atalanta did not report full coverage of a 2-input AND');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function main(argv) {
  const ti = argv.indexOf('--target'), target = ti >= 0 ? argv[ti + 1] : hostTarget();
  const onHost = target === hostTarget();
  if (!onHost && !target.startsWith('win')) die(`${target} must be built on ${target} (its library walk runs that platform's tools)`);
  const rules = RULES[target], pin = LOCK.suite.assets[target];
  if (!rules || !pin) die(`no bundle defined for ${target} (have: ${Object.keys(RULES).join(', ')})`);
  const withAtalanta = argv.includes('--with-atalanta') || process.env.VBIDE_BUNDLE_ATALANTA === '1';
  const out = path.join(ROOT, 'resources', 'tools', target);
  if (argv.includes('--check')) {          // `npm run dist` guard: an installer must not silently ship without its tools
    if (!fs.existsSync(path.join(out, 'THIRD_PARTY_NOTICES.txt'))) die(`no bundled tools in ${path.relative(ROOT, out)}: run \`npm run fetch-tools\` first`);
    return console.log(`bundled tools present: ${path.relative(ROOT, out)}`);
  }

  const archive = await download(pin, LOCK.suite.tag);
  const tmp = fs.mkdtempSync(path.join(ROOT, '.cache', 'extract-'));   // next to the archive: tar only ever sees relative paths (GNU tar reads "D:/x" as a remote host)
  try {
    // list, filter here, extract only those members (-T works with GNU tar and bsdtar)
    const names = sh('tar', ['tzf', path.basename(archive)], { cwd: CACHE }).split('\n').filter(Boolean);
    const { top, picked, rel } = selectMembers(names, rules);
    fs.writeFileSync(path.join(tmp, 'members.txt'), picked.join('\n') + '\n');
    sh('tar', ['xzf', `../tools/${pin.asset}`, '-T', 'members.txt'], { cwd: tmp });
    const suite = path.join(tmp, top);

    const kept = picked.map(rel).filter(r => !rules.libs.test(r));
    const libs = libraryClosure(target, suite, rules, kept);
    // [source in the suite, destination in the bundle]
    const copies = [...kept.map(r => [r, r]), ...(rules.dllDirs
      ? Object.entries(rules.dllDirs).flatMap(([dir, binaries]) =>
          [...libraryClosure(target, suite, { ...rules, binaries }, kept)].map(r => [r, `${dir}/${path.basename(r)}`]))
      : [...libs].map(r => [r, r]))];
    fs.rmSync(out, { recursive: true, force: true });
    for (const [from, to] of copies) copyInto(path.join(suite, from), path.join(out, to));
    if (withAtalanta) { if (!onHost) die('atalanta is compiled on the target OS'); buildAtalanta(target, path.join(out, 'bin')); }
    if (!target.startsWith('win')) await addPyuvm(out);   // needs cocotb, which the Windows suite lacks
    quoteWrappers(out);
    writeNotices(out, withAtalanta);
    if (!onHost) console.log(`not verified: ${target} can only be run on ${target}`);
    else if (!argv.includes('--no-verify')) verify(target, out);

    const size = copies.reduce((s, [, r]) => s + fs.lstatSync(path.join(out, r)).size, 0);
    console.log(`${target}: ${copies.length} files (${libs.size} shared libraries), ${(size / 1e6).toFixed(1)} MB${withAtalanta ? ' + atalanta' : ''} -> ${path.relative(ROOT, out)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('fetch-tools: ' + e.message); process.exitCode = 1; });
module.exports = { RULES, selectMembers, parseLdList, parseOtool, parsePeImports, hostTarget };
