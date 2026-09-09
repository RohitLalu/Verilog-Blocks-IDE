import{buildNetlist}from'./NetlistGraph.js';
export function runSTA(nodes,edges,pdkCtx=null,opts={}){
  const{nets,cells,topInputs,topOutputs}=buildNetlist(nodes,edges);
  const cp=opts.clockPeriod??10,id=opts.inputDelay??0,od=opts.outputDelay??0;
  const cd=(cell,out='X')=>{if(!pdkCtx)return 0.1;if(cell.isFF)return pdkCtx.getDelay(cell.cellId,'CLK',out,true);const r=Object.keys(cell.inputs)[0]||'A';return pdkCtx.getDelay(cell.cellId,r,out,true)||0.1;};
  // Topological sort
  const inDeg=new Map(),adj=new Map();
  cells.forEach((_,i)=>{inDeg.set(i,0);adj.set(i,[]);});
  cells.forEach((cell,inst)=>Object.values(cell.outputs).forEach(netId=>{
    nets.get(netId)?.fanout.forEach(dn=>{const dc=cells.get(dn);if(!dc||dc.isFF)return;adj.get(inst)?.push(dn);inDeg.set(dn,(inDeg.get(dn)||0)+1);});
  }));
  const q=[...inDeg.entries()].filter(([,d])=>d===0).map(([k])=>k);
  const topo=[];
  while(q.length){const i=q.shift();topo.push(i);adj.get(i)?.forEach(d=>{const nd=(inDeg.get(d)||0)-1;inDeg.set(d,nd);if(nd===0)q.push(d);});}
  // Arrival times
  const arr=new Map(),prev=new Map();
  topInputs.forEach(p=>arr.set(p.netId,id));
  topo.forEach(inst=>{
    const cell=cells.get(inst);if(!cell||cell.isFF)return;
    let mx=0,mxN=null;
    Object.values(cell.inputs).forEach(netId=>{const a=arr.get(netId)??0;if(a>mx){mx=a;mxN=netId;}});
    Object.entries(cell.outputs).forEach(([port,outNetId])=>{const a=mx+cd(cell,port);if(a>(arr.get(outNetId)??-Infinity)){arr.set(outNetId,a);prev.set(outNetId,{fromCell:inst,fromNet:mxN,delay:cd(cell,port)});}});
  });
  // Required times
  const req=new Map();
  topOutputs.forEach(p=>req.set(p.netId,cp-od));
  cells.forEach((cell,inst)=>{if(!cell.isFF)return;const su=pdkCtx?.getSetup(cell.cellId)??0.18;Object.values(cell.inputs).forEach(netId=>{const r=cp-su;if(r<(req.get(netId)??Infinity))req.set(netId,r);});});
  [...topo].reverse().forEach(inst=>{
    const cell=cells.get(inst);if(!cell||cell.isFF)return;
    let minR=Infinity;
    Object.entries(cell.outputs).forEach(([port,on])=>{const r=(req.get(on)??Infinity)-cd(cell,port);if(r<minR)minR=r;});
    Object.values(cell.inputs).forEach(netId=>{if(minR<(req.get(netId)??Infinity))req.set(netId,minR);});
  });
  // Slack
  const slack=new Map();
  nets.forEach((_,id)=>slack.set(id,parseFloat(((req.get(id)??cp)-(arr.get(id)??0)).toFixed(4))));
  // Critical path
  let critNet=null,minS=Infinity;
  topOutputs.forEach(p=>{const s=slack.get(p.netId)??Infinity;if(s<minS){minS=s;critNet=p.netId;}});
  cells.forEach(cell=>{if(!cell.isFF)return;Object.values(cell.inputs).forEach(netId=>{const s=slack.get(netId)??Infinity;if(s<minS){minS=s;critNet=netId;}});});
  const critPath=[];let cur=critNet;const vis=new Set();
  while(cur&&!vis.has(cur)){vis.add(cur);const p=prev.get(cur);critPath.unshift({netId:cur,arrival:parseFloat((arr.get(cur)??0).toFixed(4)),slack:parseFloat((slack.get(cur)??0).toFixed(4)),fromCell:p?.fromCell,delay:parseFloat((p?.delay??0).toFixed(4))});cur=p?.fromNet;}
  const violations=[];slack.forEach((s,id)=>{if(s<0)violations.push({netId:id,slack:s});});violations.sort((a,b)=>a.slack-b.slack);
  const cellStats=[];cells.forEach((cell,inst)=>{if(cell.isFF)return;const delays=Object.entries(cell.outputs).map(([port,netId])=>({port,netId,arrival:parseFloat((arr.get(netId)??0).toFixed(4)),slack:parseFloat((slack.get(netId)??0).toFixed(4))}));cellStats.push({inst,cellId:cell.cellId,delays});});
  // Build instanceName→slack map for canvas colouring
  const instanceSlack={};
  cells.forEach((cell,inst)=>{
    const vals=Object.values(cell.outputs).map(netId=>slack.get(netId)??0);
    if(vals.length)instanceSlack[inst]=Math.min(...vals);
  });
  return{clockPeriod:cp,netArrival:arr,netRequired:req,netSlack:slack,criticalPath:critPath,criticalSlack:parseFloat(minS.toFixed(4)),criticalNetId:critNet,violations,cellStats,instanceSlack,maxFrequencyMHz:critNet?parseFloat((1000/Math.max(0.001,arr.get(critNet)??cp)).toFixed(1)):null};
}
