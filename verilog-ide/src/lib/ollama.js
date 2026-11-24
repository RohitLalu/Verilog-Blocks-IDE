// Talks to a local Ollama (https://ollama.com) for the learning assistant. Everything stays on the user's computer.
// Ollama accepts requests from localhost and file:// pages by default, so the UI calls it directly in both the desktop
// app and the browser (Docker) version.
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:1.5b';   // Apache-2.0, ~1 GB, knows Verilog; runs on an ordinary laptop

// Ollama streams newline-delimited JSON; a chunk can end in the middle of a line.
export async function readNdjson(body, onObject) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = done ? '' : lines.pop();
    for (const l of lines) if (l.trim()) onObject(JSON.parse(l));
    if (done) return;
  }
}

async function call(base, path, init) {
  const r = await fetch(base + path, init);
  if (!r.ok) throw new Error(`Ollama ${path}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return r;
}

// null when Ollama isn't running; otherwise the names of the installed models
export async function installedModels(base = OLLAMA_URL) {
  try { return (await (await call(base, '/api/tags')).json()).models.map(m => m.name); }
  catch { return null; }
}

// Download a model; onProgress(fraction 0..1 or null, status text)
export async function pullModel(model, onProgress, { base = OLLAMA_URL, signal } = {}) {
  const r = await call(base, '/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: true }), signal });
  await readNdjson(r.body, o => {
    if (o.error) throw new Error(o.error);
    onProgress(o.total ? (o.completed || 0) / o.total : null, o.status || '');
  });
}

export const SYSTEM_PROMPT = `You are the learning assistant inside VerilogBlocks IDE, a desktop app where students build digital circuits
from real standard cells (SkyWater SKY130 or GF180MCU) on a canvas. The app generates structural Verilog, simulates it with
Icarus Verilog, synthesises it with Yosys, and reports static timing (critical path, slack) and stuck-at fault coverage (ATPG
with atalanta). Help the student understand digital and ASIC design: explain step by step in short paragraphs, use their
design when it is relevant, and ask a guiding question when that teaches more than the answer. Keep Verilog examples small.
If you are not sure, say so. Do not invent features of the app.`;

// The messages for one request: instructions, the current design (optional), then the conversation so far
export function buildMessages(history, design) {
  const sys = design ? `${SYSTEM_PROMPT}\n\nThe student's current design (generated Verilog):\n\`\`\`verilog\n${design.slice(0, 12000)}\n\`\`\`` : SYSTEM_PROMPT;
  return [{ role: 'system', content: sys }, ...history.map(({ role, content }) => ({ role, content }))];
}

// Stream a chat answer; onToken(text) for each piece. Returns the whole answer.
export async function chat(model, messages, onToken, { base = OLLAMA_URL, signal } = {}) {
  const r = await call(base, '/api/chat', { method: 'POST', body: JSON.stringify({ model, messages, stream: true }), signal });
  let text = '';
  await readNdjson(r.body, o => {
    if (o.error) throw new Error(o.error);
    const t = o.message?.content || '';
    if (t) { text += t; onToken(t); }
  });
  return text;
}
