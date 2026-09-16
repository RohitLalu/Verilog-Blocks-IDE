// Per-PDK inline logic (behavioural equivalents for simulation)
const CELL_LOGIC={
  // sky130
  sky130_and2:{e:(i,o)=>`assign ${o.X}=${i.A}&${i.B};`},
  sky130_and3:{e:(i,o)=>`assign ${o.X}=${i.A}&${i.B}&${i.C};`},
  sky130_and4:{e:(i,o)=>`assign ${o.X}=${i.A}&${i.B}&${i.C}&${i.D};`},
  sky130_or2: {e:(i,o)=>`assign ${o.X}=${i.A}|${i.B};`},
  sky130_or3: {e:(i,o)=>`assign ${o.X}=${i.A}|${i.B}|${i.C};`},
  sky130_or4: {e:(i,o)=>`assign ${o.X}=${i.A}|${i.B}|${i.C}|${i.D};`},
  sky130_xor2:{e:(i,o)=>`assign ${o.X}=${i.A}^${i.B};`},
  sky130_xnor2:{e:(i,o)=>`assign ${o.X}=~(${i.A}^${i.B});`},
  sky130_inv: {e:(i,o)=>`assign ${o.Y}=~${i.A};`},
  sky130_inv2:{e:(i,o)=>`assign ${o.Y}=~${i.A};`},
  sky130_inv4:{e:(i,o)=>`assign ${o.Y}=~${i.A};`},
  sky130_nand2:{e:(i,o)=>`assign ${o.Y}=~(${i.A}&${i.B});`},
  sky130_nand3:{e:(i,o)=>`assign ${o.Y}=~(${i.A}&${i.B}&${i.C});`},
  sky130_nand4:{e:(i,o)=>`assign ${o.Y}=~(${i.A}&${i.B}&${i.C}&${i.D});`},
  sky130_nor2: {e:(i,o)=>`assign ${o.Y}=~(${i.A}|${i.B});`},
  sky130_nor3: {e:(i,o)=>`assign ${o.Y}=~(${i.A}|${i.B}|${i.C});`},
  sky130_nor4: {e:(i,o)=>`assign ${o.Y}=~(${i.A}|${i.B}|${i.C}|${i.D});`},
  sky130_mux2: {e:(i,o)=>`assign ${o.X}=${i.S}?${i.A1}:${i.A0};`},
  sky130_mux4: {e:(i,o)=>`assign ${o.X}=${i.S1}?(${i.S0}?${i.A3}:${i.A2}):(${i.S0}?${i.A1}:${i.A0});`},
  sky130_mux2i:{e:(i,o)=>`assign ${o.Y}=~(${i.S}?${i.A1}:${i.A0});`},
  sky130_aoi21:{e:(i,o)=>`assign ${o.Y}=~(${i.A1}&${i.A2}|${i.B1});`},
  sky130_aoi22:{e:(i,o)=>`assign ${o.Y}=~(${i.A1}&${i.A2}|${i.B1}&${i.B2});`},
  sky130_aoi211:{e:(i,o)=>`assign ${o.Y}=~(${i.A1}&${i.A2}|${i.B1}|${i.C1});`},
  sky130_oai21:{e:(i,o)=>`assign ${o.Y}=~((${i.A1}|${i.A2})&${i.B1});`},
  sky130_oai22:{e:(i,o)=>`assign ${o.Y}=~((${i.A1}|${i.A2})&(${i.B1}|${i.B2}));`},
  sky130_oai211:{e:(i,o)=>`assign ${o.Y}=~((${i.A1}|${i.A2})&${i.B1}&${i.C1});`},
  sky130_maj3: {e:(i,o)=>`assign ${o.X}=(${i.A}&${i.B})|(${i.B}&${i.C})|(${i.A}&${i.C});`},
  sky130_buf:  {e:(i,o)=>`assign ${o.X}=${i.A};`},
  sky130_buf4: {e:(i,o)=>`assign ${o.X}=${i.A};`},
  sky130_buf8: {e:(i,o)=>`assign ${o.X}=${i.A};`},
  sky130_clkbuf:{e:(i,o)=>`assign ${o.X}=${i.A};`},
  sky130_clkbuf4:{e:(i,o)=>`assign ${o.X}=${i.A};`},
  sky130_clkbuf8:{e:(i,o)=>`assign ${o.X}=${i.A};`},
  sky130_clkinv:{e:(i,o)=>`assign ${o.Y}=~${i.A};`},
  sky130_ebufn:{e:(i,o)=>`assign ${o.Z}=${i.TE_B}?1'bz:${i.A};`},
  sky130_ha:   {e:(i,o)=>`assign {${o.COUT},${o.SUM}}=${i.A}+${i.B};`},
  sky130_fa:   {e:(i,o)=>`assign {${o.COUT},${o.SUM}}=${i.A}+${i.B}+${i.CIN};`},
  sky130_dfxtp:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK}) ${o.Q}<=${i.D};`},
  sky130_dfrtp:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.RESET_B})\n        if(!${i.RESET_B})${o.Q}<=1'b0;\n        else ${o.Q}<=${i.D};`},
  sky130_dfstp:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.SET_B})\n        if(!${i.SET_B})${o.Q}<=1'b1;\n        else ${o.Q}<=${i.D};`},
  sky130_edfxtp:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK}) if(${i.DE})${o.Q}<=${i.D};`},
  sky130_sdfxtp:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK}) ${o.Q}<=${i.SCE}?${i.SCD}:${i.D};`},
  sky130_sdfrtp:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.RESET_B})\n        if(!${i.RESET_B})${o.Q}<=1'b0;\n        else ${o.Q}<=${i.SCE}?${i.SCD}:${i.D};`},
  sky130_dlxtp:{isFF:true,e:(i,o)=>`always @(*) if(${i.GATE})${o.Q}<=${i.D};`},
  sky130_conb: {e:(i,o)=>`assign ${o.HI}=1'b1;\n    assign ${o.LO}=1'b0;`},
  // gf180
  gf180_and2: {e:(i,o)=>`assign ${o.Z}=${i.A1}&${i.A2};`},
  gf180_and3: {e:(i,o)=>`assign ${o.Z}=${i.A1}&${i.A2}&${i.A3};`},
  gf180_and4: {e:(i,o)=>`assign ${o.Z}=${i.A1}&${i.A2}&${i.A3}&${i.A4};`},
  gf180_or2:  {e:(i,o)=>`assign ${o.Z}=${i.A1}|${i.A2};`},
  gf180_or3:  {e:(i,o)=>`assign ${o.Z}=${i.A1}|${i.A2}|${i.A3};`},
  gf180_xor2: {e:(i,o)=>`assign ${o.Z}=${i.A1}^${i.A2};`},
  gf180_xnor2:{e:(i,o)=>`assign ${o.Z}=~(${i.A1}^${i.A2});`},
  gf180_inv:  {e:(i,o)=>`assign ${o.ZN}=~${i.A};`},
  gf180_nand2:{e:(i,o)=>`assign ${o.ZN}=~(${i.A1}&${i.A2});`},
  gf180_nand3:{e:(i,o)=>`assign ${o.ZN}=~(${i.A1}&${i.A2}&${i.A3});`},
  gf180_nor2: {e:(i,o)=>`assign ${o.ZN}=~(${i.A1}|${i.A2});`},
  gf180_nor3: {e:(i,o)=>`assign ${o.ZN}=~(${i.A1}|${i.A2}|${i.A3});`},
  gf180_aoi21:{e:(i,o)=>`assign ${o.ZN}=~(${i.A1}&${i.A2}|${i.B});`},
  gf180_oai21:{e:(i,o)=>`assign ${o.ZN}=~((${i.A1}|${i.A2})&${i.B});`},
  gf180_mux2: {e:(i,o)=>`assign ${o.Z}=${i.S}?${i.I1}:${i.I0};`},
  gf180_ha:   {e:(i,o)=>`assign {${o.CO},${o.S}}=${i.A}+${i.B};`},
  gf180_fa:   {e:(i,o)=>`assign {${o.CO},${o.S}}=${i.A}+${i.B}+${i.CI};`},
  gf180_buf:  {e:(i,o)=>`assign ${o.Z}=${i.A};`},
  gf180_buf2: {e:(i,o)=>`assign ${o.Z}=${i.A};`},
  gf180_buf4: {e:(i,o)=>`assign ${o.Z}=${i.A};`},
  gf180_clkbuf:{e:(i,o)=>`assign ${o.Z}=${i.A};`},
  gf180_clkbuf2:{e:(i,o)=>`assign ${o.Z}=${i.A};`},
  gf180_tieh: {e:(i,o)=>`assign ${o.Z}=1'b1;`},
  gf180_tiel: {e:(i,o)=>`assign ${o.Z}=1'b0;`},
  gf180_dff:  {isFF:true,e:(i,o)=>`always @(posedge ${i.CLK}) ${o.Q}<=${i.D};`},
  gf180_dffr: {isFF:true,e:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.RN})\n        if(!${i.RN})${o.Q}<=1'b0;\n        else ${o.Q}<=${i.D};`},
  gf180_dffs: {isFF:true,e:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.SN})\n        if(!${i.SN})${o.Q}<=1'b1;\n        else ${o.Q}<=${i.D};`},
  gf180_dffsr:{isFF:true,e:(i,o)=>`always @(posedge ${i.CLK} or negedge ${i.RN} or negedge ${i.SN})\n        if(!${i.RN})${o.Q}<=1'b0;\n        else if(!${i.SN})${o.Q}<=1'b1;\n        else ${o.Q}<=${i.D};`},
  gf180_dffn: {isFF:true,e:(i,o)=>`always @(negedge ${i.CLK}) ${o.Q}<=${i.D};`},
  gf180_sdff: {isFF:true,e:(i,o)=>`always @(posedge ${i.CLK}) ${o.Q}<=${i.SE}?${i.SI}:${i.D};`},
  gf180_dffs_n:{isFF:true,e:(i,o)=>`always @(negedge ${i.CLK}) ${o.Q}<=${i.D};`},
};

function rw(edges){
  const by={},to={};
  edges.forEach(e=>{const n=e.data?.wireName||`w_${e.id}`;by[`${e.target}:${e.targetHandle}`]=n;to[`${e.source}:${e.sourceHandle}`]=n;});
  return{by,to,inSig:(node,p)=>by[`${node.id}:${p}`]||`${node.data.instanceName}_${p}`,outSig:(node,p)=>to[`${node.id}:${p}`]||`${node.data.instanceName}_${p}`};
}

export function generateVerilog(nodes,edges,projectName='top',pdkCtx=null){
  if(!nodes.length)return{verilog:'// Empty design\nmodule top();\nendmodule\n',errors:[]};
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  const{by,to,inSig,outSig}=rw(edges);
  const seen=new Set(),topIn=[],topOut=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{if(!by[`${node.id}:${p.name}`]){const sig=inSig(node,p.name);if(!seen.has(sig)){seen.add(sig);topIn.push({sig,width:p.width});}}});
    node.data.ports?.outputs?.forEach(p=>{if(!to[`${node.id}:${p.name}`]){const sig=outSig(node,p.name);const isFF=!!CELL_LOGIC[node.data.id]?.isFF;if(!seen.has(sig)){seen.add(sig);topOut.push({sig,width:p.width,isFF});}}});
  });
  const portList=[...topIn.map(p=>`    input  wire ${p.width>1?`[${p.width-1}:0] `:''}${p.sig}`),...topOut.map(p=>`    output ${p.isFF?'reg ':'wire'}${p.width>1?`[${p.width-1}:0] `:''}${p.sig}`)].join(',\n');
  const wires=[],regs=[];
  edges.forEach(e=>{const src=nodes.find(n=>n.id===e.source);if(!src)return;const lg=CELL_LOGIC[src.data.id];const sp=src.data.ports?.outputs?.find(p=>p.name===e.sourceHandle);const w=sp?.width||1;(lg?.isFF?regs:wires).push(`    ${lg?.isFF?'reg ':'wire'}${w>1?` [${w-1}:0]`:''} ${e.data?.wireName||`w_${e.id}`};`);});
  const inclSet=new Set();
  nodes.forEach(n=>{if(!CELL_LOGIC[n.data.id]&&!n.data.isCustomInline&&n.data.file)inclSet.add(n.data.file);});
  const body=[];
  nodes.forEach(node=>{
    const lg=CELL_LOGIC[node.data.id];
    const ins={},outs={};
    node.data.ports?.inputs?.forEach(p=>{ins[p.name]=inSig(node,p.name);});
    node.data.ports?.outputs?.forEach(p=>{outs[p.name]=outSig(node,p.name);});
    body.push(`    // ${node.data.label} [${node.data.instanceName}]`);
    if(lg){body.push(`    ${lg.e(ins,outs)}`);}
    else if(node.data.verilogCode){body.push(...node.data.verilogCode.split('\n').map(l=>`    ${l}`));}
    else{
      const pp=[...node.data.ports?.inputs?.map(p=>`        .${p.name}(${ins[p.name]})`)||[],...node.data.ports?.outputs?.map(p=>`        .${p.name}(${outs[p.name]})`)||[]];
      if(pdkCtx?.manifest?.powerPorts){const nets=pdkCtx.manifest.powerNets||{};pdkCtx.manifest.powerPorts.forEach(pp2=>pp.push(`        .${pp2}(${nets[pp2]||"1'b0"})`));}
      body.push(`    ${node.data.cell||node.data.module} ${node.data.instanceName} (`,pp.join(',\n'),`    );`);
    }
    body.push('');
  });
  const pdkNote=pdkCtx?`// PDK: ${pdkCtx.manifest.description} (${pdkCtx.pdkId})`:'// PDK: generic';
  const verilog=[
    `// ${'─'.repeat(60)}`,`// VerilogBlocks IDE — ${projectName}   ${ts}`,pdkNote,
    `// Blocks:${nodes.length}  Wires:${edges.length}`,`// ${'─'.repeat(60)}`,'',
    [...inclSet].map(f=>`\`include "${f}"`).join('\n')||'// No submodule includes',
    '','`timescale 1ns / 1ps','','module top (',
    portList||'    // no external ports',');','',
    [...wires,...regs].length?'    // Internal signals\n'+[...wires,...regs].join('\n')+'\n':'',
    '    // ── Logic ────────────────────────────────────────────────────────',...body,'endmodule',
  ].join('\n');
  return{verilog,errors:[]};
}

export function generateTestbench(nodes,edges,projectName,tbInputs={},customCode=''){
  if(customCode?.trim())return customCode;
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  const{by,to}=rw(edges);const seen=new Set(),topIn=[],topOut=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{if(!by[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);topIn.push({sig,portName:p.name,width:p.width});}}});
    node.data.ports?.outputs?.forEach(p=>{if(!to[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);topOut.push({sig,portName:p.name,width:p.width});}}});
  });
  const hex=(v,w)=>w>1?`${w}'h${Number(v).toString(16).toUpperCase().padStart(Math.ceil(w/4),'0')}`:`1'b${v}`;
  const clkLines=[],initLines=[],stimLines=[];
  topIn.forEach(port=>{
    const cfg=tbInputs[port.sig]||tbInputs[port.portName]||{type:'constant',value:0};const w=port.width;
    switch(cfg.type){
      case'clock':initLines.push(`        ${port.sig}=1'b0;`);clkLines.push(`    always #${Math.max(1,Math.floor((cfg.period||10)/2))} ${port.sig}=~${port.sig};`);break;
      case'sequence':initLines.push(`        ${port.sig}=${hex(0,w)};`);(cfg.values||[0,1,0,1]).forEach((v,i)=>stimLines.push(`        #${(cfg.period||10)*(i+1)};  ${port.sig}=${hex(v,w)};`));break;
      case'random':initLines.push(`        ${port.sig}=${hex(0,w)};`);for(let i=0;i<(cfg.count||8);i++)stimLines.push(`        #${cfg.period||10};  ${port.sig}=$urandom;`);break;
      default:initLines.push(`        ${port.sig}=${hex(cfg.value??0,w)};`);
    }
  });
  const monFmt=[...topIn,...topOut].map(p=>`${p.sig}=%b`).join('  ');
  const monVars=[...topIn,...topOut].map(p=>p.sig).join(', ');
  return[`// ${'─'.repeat(60)}`,`// Testbench — VerilogBlocks IDE  ${projectName}  ${ts}`,`// ${'─'.repeat(60)}`,'',
    '`timescale 1ns / 1ps','','module top_tb;','',
    topIn.map(p=>`    reg  ${p.width>1?`[${p.width-1}:0] `:''}${p.sig};`).join('\n'),
    topOut.map(p=>`    wire ${p.width>1?`[${p.width-1}:0] `:''}${p.sig};`).join('\n'),
    '','    top dut (',[...topIn,...topOut].map(p=>`        .${p.sig}(${p.sig})`).join(',\n'),'    );','',
    ...clkLines,'','    initial begin','        $dumpfile("wave.vcd");','        $dumpvars(0,top_tb);',
    ...initLines,'',  ...stimLines,'','        #500; $display("Simulation done."); $finish;','    end','',
    `    initial $monitor("t=%0t  ${monFmt}",$time,${monVars});`,'','endmodule'].join('\n');
}

export function exportAsBlock(nodes,edges,meta){
  const{by,to}=rw(edges);const seen=new Set(),inputs=[],outputs=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{if(!by[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);inputs.push({name:sig,width:p.width});}}});
    node.data.ports?.outputs?.forEach(p=>{if(!to[`${node.id}:${p.name}`]){const sig=`${node.data.instanceName}_${p.name}`;if(!seen.has(sig)){seen.add(sig);outputs.push({name:sig,width:p.width});}}});
  });
  const{blockId,label,description,color}=meta;
  return{id:blockId,label:label||blockId,symbol:(label||blockId).slice(0,4).toUpperCase(),module:blockId,category:'hierarchy/user',color:color||'#818cf8',description:description||`Hierarchical block from "${blockId}"`,tutorial:`Instantiates the top module from project "${blockId}".`,isHierarchical:true,ports:{inputs,outputs},sourceProject:blockId};
}
