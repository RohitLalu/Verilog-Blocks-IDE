'use strict';
// PATH used to find yosys, iverilog, vvp and atalanta.
//
// * A bundled copy (resources/tools/bin in a packaged app) wins, so the app uses the tool versions it was
//   tested with.
// * macOS apps started from Finder/the Dock get a minimal PATH (/usr/bin:/bin:...) that does not include
//   Homebrew, so `brew install yosys` would be invisible to the app. The usual install prefixes are appended
//   AFTER the existing PATH, so anything the user configured still takes precedence.
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXTRA = {
  darwin: ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/opt/local/bin'],   // Apple silicon, Intel/legacy, MacPorts
  linux: ['/usr/local/bin'],
};

function toolPath({ platform = process.platform, envPath = '', resourcesPath, packaged = false } = {}) {
  const delimiter = platform === 'win32' ? ';' : ':';
  // Windows has no rpath: the suite's DLLs live in lib/ and are found through PATH (as its environment.bat does)
  const bundled = packaged && resourcesPath ? ['bin', ...(platform === 'win32' ? ['lib'] : [])].map(d => path.join(resourcesPath, 'tools', d)) : [];
  const existing = String(envPath).split(delimiter).filter(Boolean);
  return [...new Set([...bundled, ...existing, ...(EXTRA[platform] || [])])].join(delimiter);
}

// iverilog runs ivlpp/ivl through `sh -c` with its base folder unquoted (driver/main.c), so a tools folder whose path
// contains a space ("/Applications/VerilogBlocks IDE.app/...") breaks every compile. On Windows iverilog switches to the
// 8.3 short path itself. Elsewhere: a symlink without spaces in a fresh private (0700) temp folder, passed as `iverilog -B`.
// Returns the alias of toolsDir (pass <alias>/lib/ivl to -B), or null when none is needed or possible.
function ivlBaseAlias(toolsDir, { platform = process.platform, tmp = os.tmpdir() } = {}) {
  if (platform === 'win32' || !/\s/.test(toolsDir) || /\s/.test(tmp)) return null;
  const link = path.join(fs.mkdtempSync(path.join(tmp, 'vbide-')), 'tools');
  fs.symlinkSync(toolsDir, link);
  return link;
}

module.exports = { toolPath, ivlBaseAlias };
