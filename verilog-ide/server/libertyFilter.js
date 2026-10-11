'use strict';
// Remove cells from a Liberty file. Needed because Yosys' `abc -dont_use` does not exist
// in older releases (the Docker image ships 0.9) and the sky130 library carries no
// dont_use attributes, so without this ABC may map logic onto low-power or delay cells.
const fs = require('fs');
const path = require('path');

function removeCells(text, dontUse) {
  const re = /\bcell\s*\(\s*"?([^")\s]+)"?\s*\)\s*\{/g;
  let out = '', last = 0, m;
  const removed = [];
  while ((m = re.exec(text))) {
    if (!dontUse.test(m[1])) continue;
    let i = m.index + m[0].length, depth = 1;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; } }
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    out += text.slice(last, m.index);
    last = i;
    removed.push(m[1]);
    re.lastIndex = i;
  }
  return { text: out + text.slice(last), removed };
}

// Writes <outDir>/<pdkId>_synth.lib, reusing the previous copy while the source is unchanged.
function prepareLiberty({ src, pdkId, dontUse, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const dst = path.join(outDir, `${pdkId}_synth.lib`), metaPath = dst + '.json';
  const st = fs.statSync(src);
  const key = { src, size: st.size, mtimeMs: st.mtimeMs, dontUse: String(dontUse) };
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (JSON.stringify(meta.key) === JSON.stringify(key) && fs.existsSync(dst)) return { path: dst, removed: meta.removed, cached: true };
  } catch { /* regenerate */ }
  const { text, removed } = removeCells(fs.readFileSync(src, 'utf8'), dontUse);
  fs.writeFileSync(dst, text);
  fs.writeFileSync(metaPath, JSON.stringify({ key, removed }));
  return { path: dst, removed, cached: false };
}

module.exports = { removeCells, prepareLiberty };
