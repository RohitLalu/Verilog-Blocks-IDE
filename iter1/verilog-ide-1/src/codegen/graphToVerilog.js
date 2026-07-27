const CELL_LOGIC = {
  sky130_and2:  {expr:(i,o)=>`assign ${o.X} = ${i.A} & ${i.B};`},
  sky130_and3:  {expr:(i,o)=>`assign ${o.X} = ${i.A} & ${i.B} & ${i.C};`},
  sky130_or2:   {expr:(i,o)=>`assign ${o.X} = ${i.A} | ${i.B};`},
  sky130_or3:   {expr:(i,o)=>`assign ${o.X} = ${i.A} | ${i.B} | ${i.C};`},
  sky130_xor2:  {expr:(i,o)=>`assign ${o.X} = ${i.A} ^ ${i.B};`},
  sky130_xnor2: {expr:(i,o)=>`assign ${o.X} = ~(${i.A} ^ ${i.B});`},
  sky130_inv:   {expr:(i,o)=>`assign ${o.Y} = ~${i.A};`},
  sky130_nand2: {expr:(i,o)=>`assign ${o.Y} = ~(${i.A} & ${i.B});`},
  sky130_nor2:  {expr:(i,o)=>`assign ${o.Y} = ~(${i.A} | ${i.B});`},
  sky130_mux2:  {expr:(i,o)=>`assign ${o.X} = ${i.S} ? ${i.A1} : ${i.A0};`},
  sky130_mux4:  {expr:(i,o)=>`assign ${o.X} = ${i.S1} ? (${i.S0} ? ${i.A3} : ${i.A2}) : (${i.S0} ? ${i.A1} : ${i.A0});`},
  sky130_buf:   {expr:(i,o)=>`assign ${o.X} = ${i.A};`},
  sky130_clkbuf:{expr:(i,o)=>`assign ${o.X} = ${i.A};`},
  sky130_ha:    {expr:(i,o)=>`assign {${o.COUT},${o.SUM}} = ${i.A} + ${i.B};`},
  sky130_fa:    {expr:(i,o)=>`assign {${o.COUT},${o.SUM}} = ${i.A} + ${i.B} + ${i.CIN};`},
  sky130_dfxtp: {isFF:true,expr:(i,o)=>`always @(posedge ${i.CLK}) ${o.Q} <= ${i.D};`},
  sky130_dfrtp: {isFF:true,expr:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.RESET_B})\n        if (!${i.RESET_B}) ${o.Q} <= 1'b0;\n        else ${o.Q} <= ${i.D};`},
  sky130_sdfxtp:{isFF:true,expr:(i,o)=>`always @(posedge ${i.CLK}) ${o.Q} <= ${i.SCE} ? ${i.SCD} : ${i.D};`},
};

function resolveWires(edges) {
  const by={},to={};
  edges.forEach(e=>{const n=e.data?.wireName||`w_${e.id}`;by[`${e.target}:${e.targetHandle}`]=n;to[`${e.source}:${e.sourceHandle}`]=n;});
  return{by,to,inSig:(node,p)=>by[`${node.id}:${p}`]||`${node.data.instanceName}_${p}`,outSig:(node,p)=>to[`${node.id}:${p}`]||`${node.data.instanceName}_${p}`};
}

export function generateVerilog(nodes, edges, projectName='top', pdkCtx=null) {
  if(!nodes.length) return{verilog:'// Empty design\nmodule top();\nendmodule\n',errors:[]};
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  const{by,to,inSig,outSig}=resolveWires(edges);

  // Top ports
  const seen=new Set(),topIn=[],topOut=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{
      if(!by[`${node.id}:${p.name}`]){const sig=inSig(node,p.name);if(!seen.has(sig)){seen.add(sig);topIn.push({sig,width:p.width});}}
    });
    node.data.ports?.outputs?.forEach(p=>{
      if(!to[`${node.id}:${p.name}`]){const sig=outSig(node,p.name);const isFF=!!CELL_LOGIC[node.data.id]?.isFF;if(!seen.has(sig)){seen.add(sig);topOut.push({sig,width:p.width,isFF});}}
    });
  });

  const portList=[
    ...topIn.map(p=>`    input  wire ${p.width>1?`[${p.width-1}:0] `:''}${p.sig}`),
    ...topOut.map(p=>`    output ${p.isFF?'reg ':'wire'}${p.width>1?`[${p.width-1}:0] `:''}${p.sig}`),
  ].join(',\n');

  // Internal wires/regs
  const wires=[],regs=[];
  edges.forEach(e=>{
    const src=nodes.find(n=>n.id===e.source);if(!src)return;
    const lg=CELL_LOGIC[src.data.id];
    const sp=src.data.ports?.outputs?.find(p=>p.name===e.sourceHandle);
    const w=sp?.width||1;
    const decl=`    ${lg?.isFF?'reg ':'wire'}${w>1?` [${w-1}:0]`:''} ${e.data?.wireName||`w_${e.id}`};`;
    (lg?.isFF?regs:wires).push(decl);
  });

  const inclSet=new Set();
  nodes.forEach(n=>{if(!CELL_LOGIC[n.data.id]&&!n.data.isCustomInline&&n.data.file)inclSet.add(n.data.file);});

  const body=[];
  nodes.forEach(node=>{
    const lg=CELL_LOGIC[node.data.id];
    const ins={},outs={};
    node.data.ports?.inputs?.forEach(p=>{ins[p.name]=inSig(node,p.name);});
    node.data.ports?.outputs?.forEach(p=>{outs[p.name]=outSig(node,p.name);});
    body.push(`    // ${node.data.label} [${node.data.instanceName}]`);
    if(lg){
      body.push(`    ${lg.expr(ins,outs)}`);
    }else if(node.data.verilogCode){
      body.push(...node.data.verilogCode.split('\n').map(l=>`    ${l}`));
    }else{
      const pp=[
        ...node.data.ports?.inputs?.map(p=>`        .${p.name}(${ins[p.name]})`)||[],
        ...node.data.ports?.outputs?.map(p=>`        .${p.name}(${outs[p.name]})`)||[],
      ];
      if(pdkCtx?.manifest?.powerPorts){
        const nets=pdkCtx.manifest.powerNets||{};
        pdkCtx.manifest.powerPorts.forEach(pp2=>pp.push(`        .${pp2}(${nets[pp2]||"1'b0"})`));
      }
      body.push(`    ${node.data.cell||node.data.module} ${node.data.instanceName} (`);
      body.push(pp.join(',\n'));
      body.push(`    );`);
    }
    body.push('');
  });

  const pdkNote=pdkCtx?`// PDK: ${pdkCtx.manifest.description} (${pdkCtx.pdkId})`:'// PDK: generic';
  const verilog=[
    `// ${'─'.repeat(62)}`,`// VerilogBlocks IDE`,`// Project : ${projectName}   ${ts}`,pdkNote,
    `// Blocks: ${nodes.length}   Wires: ${edges.length}`,`// ${'─'.repeat(62)}`,'',
    [...inclSet].map(f=>`\`include "${f}"`).join('\n')||'// No submodule includes',
    '','`timescale 1ns / 1ps','','module top (',
    portList||'    // no external ports',');','',
    [...wires,...regs].length?'    // Internal signals\n'+[...wires,...regs].join('\n')+'\n':'',
    '    // ── Logic ──────────────────────────────────────────────────────',
    ...body,'endmodule',
  ].join('\n');
  return{verilog,errors:[]};
}

export function generateTestbench(nodes,edges,projectName,tbInputs={},customCode=''){
  if(customCode?.trim())return customCode;
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  const{by,to}=resolveWires(edges);
  const seen=new Set(),topIn=[],topOut=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{
      if(!by[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);topIn.push({sig,portName:p.name,width:p.width});}}
    });
    node.data.ports?.outputs?.forEach(p=>{
      if(!to[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);topOut.push({sig,portName:p.name,width:p.width});}}
    });
  });
  const hex=(v,w)=>w>1?`${w}'h${Number(v).toString(16).toUpperCase().padStart(Math.ceil(w/4),'0')}`:`1'b${v}`;
  const clkLines=[],initLines=[],stimLines=[];
  topIn.forEach(port=>{
    const cfg=tbInputs[port.sig]||tbInputs[port.portName]||{type:'constant',value:0};
    const w=port.width;
    switch(cfg.type){
      case'clock':
        initLines.push(`        ${port.sig} = 1'b0;`);
        clkLines.push(`    always #${Math.max(1,Math.floor((cfg.period||10)/2))} ${port.sig} = ~${port.sig};`);
        break;
      case'sequence':
        initLines.push(`        ${port.sig} = ${hex(0,w)};`);
        (cfg.values||[0,1,0,1]).forEach((v,i)=>stimLines.push(`        #${(cfg.period||10)*(i+1)};  ${port.sig} = ${hex(v,w)};`));
        break;
      case'random':
        initLines.push(`        ${port.sig} = ${hex(0,w)};`);
        for(let i=0;i<(cfg.count||8);i++)stimLines.push(`        #${cfg.period||10};  ${port.sig} = $urandom;`);
        break;
      default:
        initLines.push(`        ${port.sig} = ${hex(cfg.value??0,w)};`);
    }
  });
  const monFmt=[...topIn,...topOut].map(p=>`${p.sig}=%b`).join('  ');
  const monVars=[...topIn,...topOut].map(p=>p.sig).join(', ');
  return[
    `// ${'─'.repeat(60)}`,`// Testbench — VerilogBlocks IDE`,`// Project: ${projectName}   ${ts}`,`// ${'─'.repeat(60)}`,'',
    '`timescale 1ns / 1ps','','module top_tb;','',
    topIn.map(p=>`    reg  ${p.width>1?`[${p.width-1}:0] `:''}${p.sig};`).join('\n'),
    topOut.map(p=>`    wire ${p.width>1?`[${p.width-1}:0] `:''}${p.sig};`).join('\n'),
    '','    top dut (',
    [...topIn,...topOut].map(p=>`        .${p.sig}(${p.sig})`).join(',\n'),'    );','',
    ...clkLines,'','    initial begin',
    '        $dumpfile("wave.vcd");','        $dumpvars(0, top_tb);',
    ...initLines,'',
    ...stimLines,'',
    '        #500; $display("Simulation done."); $finish;','    end','',
    `    initial $monitor("t=%0t  ${monFmt}", $time, ${monVars});`,'','endmodule',
  ].join('\n');
}

export function exportAsBlock(nodes,edges,meta){
  const{by,to}=resolveWires(edges);
  const seen=new Set(),inputs=[],outputs=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{
      if(!by[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);inputs.push({name:sig,width:p.width});}}
    });
    node.data.ports?.outputs?.forEach(p=>{
      if(!to[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);outputs.push({name:sig,width:p.width});}}
    });
  });
  const{blockId,label,description,color}=meta;
  return{
    id:blockId,label:label||blockId,symbol:(label||blockId).slice(0,4).toUpperCase(),
    module:blockId,category:'hierarchy/user',color:color||'#818cf8',
    description:description||`Hierarchical block from project "${blockId}"`,
    tutorial:`This block was created from project "${blockId}". It instantiates the top module.`,
    isHierarchical:true,ports:{inputs,outputs},sourceProject:blockId,
  };
}
