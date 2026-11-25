// What the assistant knows about the student's work right now: the process, the cells on the canvas, the Verilog and
// the latest result of each tool. Plain text, trimmed: small local models have small context windows.
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…(cut)' : s);
const clipEnd = (s, n) => (s.length > n ? '(cut)…\n' + s.slice(-n) : s);   // Yosys puts its errors and statistics at the end

// One line the tutor can use to suggest the next step (the recommended order is in its instructions)
function flowSoFar({ simOutput, lastVCD, staResult, atpgResult, synthesisOutput, formalResult }) {
  const step = (name, state) => `${name}: ${state}`;
  return [
    step('design', 'started'),
    step('simulation', lastVCD ? 'done (waveform produced)' : simOutput ? 'tried, no waveform (failed)' : 'not yet'),
    step('timing check', staResult ? `done (${staResult.violations?.length ? `${staResult.violations.length} violations` : 'no violations'})` : 'not yet'),
    step('synthesis', synthesisOutput ? (/ERROR/.test(synthesisOutput) ? 'tried, failed' : 'done') : 'not yet'),
    step('test vectors (ATPG)', atpgResult ? (atpgResult.ok ? `done (${atpgResult.coverage}% coverage)` : 'tried, failed') : 'not yet'),
    step('formal verification', formalResult ? `${formalResult.status === 'PASS' ? 'done' : 'tried'} (${formalResult.mode || 'prove'}: ${formalResult.status})` : 'not yet'),
  ].join('; ');
}

export function buildContext({ nodes = [], verilog = '', pdkName = '', simOutput = '', lastVCD = null, staResult = null, atpgResult = null, synthesisOutput = '', cocotbResult = null, formalResult = null }) {
  if (!nodes.length) return 'The canvas is empty: the student has not placed any cells yet.';
  const parts = [`Process (PDK): ${pdkName || 'not selected'}.`, `Flow so far: ${flowSoFar({ simOutput, lastVCD, staResult, atpgResult, synthesisOutput, formalResult })}.`];

  const cells = new Map();
  for (const { data: d } of nodes) {
    const key = d.id || d.module;
    if (!cells.has(key)) cells.set(key, { d, count: 0 });
    cells.get(key).count++;
  }
  parts.push('Cells on the canvas:\n' + [...cells.values()].map(({ d, count }) =>
    `- ${count} x ${d.label}${d.cell ? ` (${d.cell})` : ''}${d.logic ? `: ${d.logic}` : ''}` +
    `${d.timingHint?.tpd_typ != null ? `, typical delay ${d.timingHint.tpd_typ} ns` : ''}${d.isHierarchical ? ' (a saved design used as a block)' : ''}`).join('\n'));

  if (verilog) parts.push('Generated Verilog:\n```verilog\n' + clip(verilog, 6000) + '\n```');
  if (simOutput) parts.push(`Latest simulation (Icarus Verilog)${lastVCD ? ', a waveform was produced' : ''}. Output:\n` + clip(simOutput, 1500));
  if (staResult) {
    parts.push(`Latest static timing analysis: clock period ${staResult.clockPeriod} ns, worst slack ${staResult.criticalSlack} ns, ` +
      `${staResult.violations?.length || 0} setup violations${staResult.maxFrequencyMHz ? `, maximum frequency ${staResult.maxFrequencyMHz} MHz` : ''}. ` +
      `Critical path: ${(staResult.criticalPath || []).map(s => `${s.netId} (arrives ${s.arrival} ns)`).join(' -> ') || 'none'}.`);
  }
  if (atpgResult) {
    parts.push(atpgResult.ok
      ? `Latest ATPG (stuck-at faults): ${atpgResult.coverage}% fault coverage, ${atpgResult.detected} of ${atpgResult.total} faults detected, ` +
        `${atpgResult.vectors} test vectors, ${atpgResult.faults?.redundantCount || 0} redundant, ${atpgResult.faults?.abortedCount || 0} aborted.`
      : `Latest ATPG failed at the ${atpgResult.stage || 'unknown'} step:\n` + clip(atpgResult.output || '', 800));
  }
  if (synthesisOutput) parts.push('Latest Yosys synthesis output:\n' + clipEnd(synthesisOutput, 1500));
  if (formalResult) parts.push(`Latest formal check (SymbiYosys, ${formalResult.mode || 'prove'}${formalResult.mode === 'bmc' ? `, depth ${formalResult.depth}` : ''}): ${formalResult.status}${formalResult.vcd ? ', with a counterexample trace' : ''}. Output (end):\n` + clipEnd(formalResult.output || '', 1000));
  if (cocotbResult) parts.push(`Latest cocotb test run: ${cocotbResult.summary ? `${cocotbResult.summary.passed} of ${cocotbResult.summary.tests} tests passed` : 'did not run'}. Output (end):\n` + clipEnd(cocotbResult.output || '', 1200));
  if (simOutput || staResult || atpgResult || synthesisOutput || cocotbResult || formalResult) parts.push('(Results are from each tool\'s latest run; the design may have changed since.)');
  return parts.join('\n\n');
}
