import{topPorts}from'./graphToVerilog.js';

// A properties module for SymbiYosys: it wraps the design, every input is free (the checker tries all values), and
// assert(...) lines say what must always hold. Examples are commented out; the student writes the real ones.
export function generateFormalProps(nodes,edges){
  const{topIn,topOut}=topPorts(nodes,edges);
  const w=p=>p.width>1?`[${p.width-1}:0] `:'';
  const ins=topIn.map(p=>`    input  wire ${w(p)}${p.sig}`);
  const conn=[...topIn,...topOut].map(p=>`        .${p.sig}(${p.sig})`);
  const o=topOut[0]?.sig||'y',a=topIn[0]?.sig||'a',b=topIn[1]?.sig||a;
  return[
    '// Formal properties for "top", written by VerilogBlocks IDE. The checker treats every input as free: it tries every',
    '// possible value. Write what must ALWAYS hold with assert(...); limit the inputs you care about with assume(...).',
    '// Then press Run. With no assert, there is nothing to check (and the result is a trivial PASS).',
    'module props (',
    (ins.length?ins:['    input wire unused']).join(',\n'),
    ');',
    ...topOut.map(p=>`    wire ${w(p)}${p.sig};`),
    '',
    '    top dut (',
    conn.join(',\n'),
    '    );',
    '',
    '    always @(*) begin',
    `        // assume (!(${a} && ${b}));          // example: only consider inputs where this holds`,
    `        // assert (${o} == (${a} & ${b}));     // example: replace with what your design must do`,
    '    end',
    '',
    '    // For flip-flops, check properties on a clock edge instead:  always @(posedge <your clock>) assert (...);',
    'endmodule',
    '',
  ].join('\n');
}
