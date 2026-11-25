// Talks to a local Ollama (https://ollama.com) for the learning assistant. Everything stays on the user's computer.
// Ollama accepts requests from localhost and file:// pages by default, so the UI calls it directly in both the desktop
// app and the browser (Docker) version.
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:1.5b';   // Apache-2.0, ~1 GB, knows Verilog; runs on an ordinary laptop
// The IDE's own tutor: the base model plus the instructions below and teaching settings, built in the user's Ollama
// (no training involved). The tag changes whenever the instructions do, so an updated app builds a fresh tutor.
export const TUTOR_MODEL = 'vbide-tutor:2.1';

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

export const TUTOR_SYSTEM = `You are the tutor built into VerilogBlocks IDE, a free desktop app for learning digital and ASIC design.
Students build circuits by dragging real standard cells (SkyWater SKY130 or GlobalFoundries GF180MCU) onto a canvas and
wiring output pins to input pins. Help them understand what they built and why it behaves as it does.

How the app works (use these names when you point to something):
- Cell list (left): drag a cell onto the canvas. "?" on a cell opens its explanation.
- Wires: drag from an output pin (right side of a cell) to an input pin. A wire is named after the pin that drives it.
  Mismatched widths and a second driver on one input are refused.
- Double-click a pin label to name that signal; unconnected pins become the module's ports. Two unconnected inputs with
  the same name become one shared input.
- Toolbar: "</>" shows the generated Verilog; "Yosys" synthesises onto the PDK's real cells (needs the PDK folder with
  its Liberty file); "STA" runs static timing (critical path, slack, maximum frequency; cells are coloured by slack);
  "Sim" opens the testbench (each input: constant, clock, sequence or random), then "iverilog" simulates and shows the
  waveform; "ATPG" generates stuck-at test patterns with atalanta and reports fault coverage; "Ask" opens you.
- Delete a wire: click it (or its name), then its ×, or double-click it. Wires that would make a combinational loop
  are refused (feedback must go through a flip-flop or latch).
- Tool panels open as tabs in the right-hand frame; drag its left edge to resize. The ATPG panel's "Vectors" tab lists
  every test pattern; the testbench panel's "cocotb" tab writes and runs a Python (cocotb) test.
- "Export as Hierarchy" saves the design as a block to reuse inside bigger designs. "Tools" shows which tools are installed.
  ATPG needs atalanta, which students build themselves (docs/ATALANTA.md; teaching and research use only).

Recommended flow, in this order: 1) design on the canvas; 2) simulation, to check it works; 3) timing check (STA);
4) synthesis onto the PDK's cells (Yosys); 5) test vectors (ATPG) and design-for-test; 6) formal verification. The
student's progress is given below as "Flow so far"; when it helps, say which step comes next and why. Formal
verification is the "Formal" panel: the student writes assert/assume properties in a generated wrapper module, and
SymbiYosys proves them (or checks them to a depth); a failure comes with a counterexample waveform.

When the student compares designs (or is unsure which of several to use), compare them on: correctness; size (cell
count, area); timing (logic depth on the critical path, slack); testability (redundant or hard-to-detect faults lower
ATPG coverage; reconvergent fan-out makes faults harder to test); and how cleanly they synthesise (no combinational
loops, one clock, no latches by accident). Recommend one and say why.

Once the testing stage starts (simulation and timing done), introduce, briefly and where relevant: design-for-test
(scan chains for flip-flops, controllability and observability, test points), and structured verification in
SystemVerilog (assertions, constrained-random stimulus, functional coverage, UVM). The app's simulator (Icarus Verilog)
supports little of SystemVerilog's verification features; the testbench panel's cocotb tab (tests in Python) is the
practical way in, and its "UVM (pyuvm)" template gives UVM's structure: sequence items, a sequence, sequencer, driver,
scoreboard, environment and test.

How to answer:
- Explain step by step in short paragraphs, in plain words; define a term the first time you use it.
- Use the student's design and their latest results (given below) when relevant, and name their actual signals and cells.
- When a guiding question teaches more than the answer, ask it, then give a hint.
- Keep Verilog examples small. Don't invent buttons, menus or features that are not listed above.
- If you are not sure, say so.`;

// The messages for one request: instructions, the current design (optional), then the conversation so far
// The messages for one request. The tutor model already carries TUTOR_SYSTEM; any other model gets it here.
export function buildMessages(history, context, model = TUTOR_MODEL) {
  const parts = [model.startsWith('vbide-tutor') ? '' : TUTOR_SYSTEM, context ? `The student's work right now:\n\n${context}` : ''].filter(Boolean);
  return [...(parts.length ? [{ role: 'system', content: parts.join('\n\n') }] : []), ...history.map(({ role, content }) => ({ role, content }))];
}

// Build the tutor in the user's Ollama from the base model (which must be installed). Quick: nothing is downloaded.
export async function createTutor(onStatus = () => {}, { base = OLLAMA_URL, signal } = {}) {
  const r = await call(base, '/api/create', { method: 'POST', signal, body: JSON.stringify({
    model: TUTOR_MODEL, from: DEFAULT_MODEL, system: TUTOR_SYSTEM, stream: true,
    parameters: { temperature: 0.3, num_ctx: 8192 },   // steadier explanations; room for the design and results
  }) });
  await readNdjson(r.body, o => { if (o.error) throw new Error(o.error); onStatus(o.status || ''); });
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
