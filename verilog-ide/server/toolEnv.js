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
  const bundled = packaged && resourcesPath ? [path.join(resourcesPath, 'tools', 'bin')] : [];
  const existing = String(envPath).split(delimiter).filter(Boolean);
  return [...new Set([...bundled, ...existing, ...(EXTRA[platform] || [])])].join(delimiter);
}

// iverilog runs ivlpp/ivl through a shell (`sh -c`, or cmd.exe on Windows) with its base folder unquoted (driver/main.c), so
// a tools folder whose path contains a space ("/Applications/VerilogBlocks IDE.app/...", "%LOCALAPPDATA%\Programs\
// VerilogBlocks IDE") breaks every compile. Windows iverilog tries 8.3 short names, but those can be switched off (they are
// on GitHub's runners). So: an alias without spaces in a fresh private temp folder, passed as `iverilog -B`. A symlink on
// macOS/Linux, a directory junction on Windows (no admin rights needed); on Windows %ProgramData% is the fallback when the
// temp folder itself has a space (a user name with a space).
// Returns the alias of toolsDir (pass <alias>/lib/ivl to -B), or null when none is needed or possible.
function ivlBaseAlias(toolsDir, { platform = process.platform, tmp = os.tmpdir(), programData = process.env.ProgramData } = {}) {
  if (!/\s/.test(toolsDir)) return null;
  const parent = [tmp, ...(platform === 'win32' ? [programData] : [])].find(d => d && !/\s/.test(d));
  if (!parent) return null;
  const link = path.join(fs.mkdtempSync(path.join(parent, 'vbide-')), 'tools');
  fs.symlinkSync(toolsDir, link, 'junction');   // the type is used only on Windows
  return link;
}

// Remove the alias (the link itself, never what it points to), then its folder
function removeAlias(link) {
  try { fs.unlinkSync(link); fs.rmdirSync(path.dirname(link)); } catch { /* best effort: it lives in a temp folder */ }
}

module.exports = { toolPath, ivlBaseAlias, removeAlias };
