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
const BINARIES = /^libexec\/[^/]+$|^lib\/ivl\/[^/]+\.(vpi|tgt)$/;
const RULES = {
  'linux-x64': {
    keep: [
      /^bin\/(yosys|yosys-abc|iverilog|vvp)$/,
      /^libexec\/(yosys|yosys-abc|iverilog|ivl|ivlpp|vvp)$/,
      /^lib\/ivl\//, /^lib\/tcl8\.6\//, /^share\/yosys\/[^/]+$/, /^share\/yosys\/choices\//,
      /^lib\/ld-linux-x86-64\.so\.2$/,
      /^lib\/yosys-abc$/,             // symlink to ../bin/yosys-abc: Yosys looks for ABC next to itself, and under the suite's loader that is lib/
      /^license\/LICENSE\.(yosys|iverilog)$/,
    ],
    libs: /^lib\/[^/]+\.so(\.[\d.]+)?$/,
    binaries: BINARIES,
  },
  'mac-arm64': {
    keep: [
      /^bin\/(yosys|yosys-abc|iverilog|vvp)$/,
      /^libexec\/(yosys|yosys-abc|iverilog|ivl|ivlpp|vvp|realpath)$/,   // the bin/ wrappers resolve paths with libexec/realpath
      /^lib\/ivl\//, /^share\/yosys\/[^/]+$/, /^share\/yosys\/choices\//,
      /^license\/LICENSE\.(yosys|iverilog)$/,
    ],
    libs: /^lib\/[^/]+\.dylib$/,
    binaries: BINARIES,
  },  'win-x64': {
    keep: [
      /^bin\/(yosys|yosys-abc|iverilog|vvp)\.exe$/,
      /^lib\/ivl\//, /^share\/yosys\/[^/]+$/, /^share\/yosys\/choices\//,
      /^license\/LICENSE\.(yosys|iverilog)$/,
    ],
    libs: /^(bin|lib)\/[^/]+\.dll$/i,
    // Windows looks next to the program before PATH, so each DLL goes beside the programs that load it (bin/ for the tools
    // and the .vpi plug-ins vvp loads, lib/ivl/ for ivl.exe and its .tgt plug-ins). Then a different MinGW runtime on PATH
    // (Git Bash, MSYS2, Strawberry Perl) can't be picked up instead: that made yosys fail to start in CI.
    // folder -> the files whose imports must resolve there (vvp in bin/ loads the .vpi plug-ins; ivl.exe loads the .tgt)
    dllDirs: { bin: /^bin\/[^/]+\.exe$|^lib\/ivl\/[^/]+\.vpi$/i, 'lib/ivl': /^lib\/ivl\/[^/]+\.(exe|tgt|vpi)$/i },
    binaries: /^bin\/[^/]+\.exe$|^lib\/ivl\/[^/]+\.(exe|vpi|tgt)$/i,
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
  const picked = names.filter(n => !n.endsWith('/') && (rules.keep.some(r => r.test(rel(n))) || rules.libs.test(rel(n))));
  return { top, picked, rel };
}

// "  libfoo.so.1 => /x/lib/libfoo.so.1 (0x...)" lines from `ld.so --list`
const parseLdList = out => [...out.matchAll(/=>\s+(\S+)\s+\(0x/g)].map(m => m[1]);

// Shared libraries (inside the suite) that the binaries load, transitively
// "\t@rpath/libffi.8.dylib (compatibility version ...)" lines from `otool -L`
const parseOtool = out => out.split('\n').slice(1).map(l => l.match(/^\s+(\S.*?) \(compatibility/)).filter(Boolean).map(m => m[1]);
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
  const bins = kept.filter(r => rules.binaries.test(r) && fs.lstatSync(path.join(suite, r)).isFile());
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
      for (const dep of parseOtool(sh('otool', ['-L', path.join(suite, queue.pop())]))) {
        if (isSystemLib(dep)) continue;
        const r = 'lib/' + path.basename(dep);
        if (!fs.existsSync(path.join(suite, r))) die(`${dep} is not a system library and not in the suite's lib/`);
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

function writeNotices(out, withAtalanta) {
  const lic = path.join(out, 'license');
  const parts = [
    'Third-party tools bundled with VerilogBlocks IDE. They run as separate programs; they are not linked into the app.',
    `Yosys and Icarus Verilog are unmodified binaries from OSS CAD Suite ${LOCK.suite.tag} (https://github.com/YosysHQ/oss-cad-suite-build).`,
    `Their source code: https://github.com/YosysHQ/yosys and https://github.com/steveicarus/iverilog; the suite's build scripts and the`,
    `versions used are at https://github.com/YosysHQ/oss-cad-suite-build/releases/tag/${LOCK.suite.tag}.`,
    'The shared libraries next to them come from the same release; their licences are listed in that release.',
  ];
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
