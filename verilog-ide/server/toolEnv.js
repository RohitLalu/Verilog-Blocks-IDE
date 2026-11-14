'use strict';
// PATH used to find yosys, iverilog, vvp and atalanta.
//
// * A bundled copy (resources/tools/bin in a packaged app) wins, so the app uses the tool versions it was
//   tested with.
// * macOS apps started from Finder/the Dock get a minimal PATH (/usr/bin:/bin:...) that does not include
//   Homebrew, so `brew install yosys` would be invisible to the app. The usual install prefixes are appended
//   AFTER the existing PATH, so anything the user configured still takes precedence.
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

module.exports = { toolPath };
