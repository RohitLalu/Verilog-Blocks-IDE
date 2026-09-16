import { isSequential, isCombinational } from './CellEvaluator.js';
const POWER=new Set(['VPWR','VGND','VPB','VNB']);

export function buildNetlist(nodes,edges){
  const by={},to={};
  edges.forEach(e=>{const n=e.data?.wireName||`w_${e.id}`;by[`${e.target}:${e.targetHandle}`]=n;to[`${e.source}:${e.sourceHandle}`]=n;});
  const inSig=(node,p)=>by[`${node.id}:${p}`]||`${node.data.instanceName}_${p}`;
  const outSig=(node,p)=>to[`${node.id}:${p}`]||`${node.data.instanceName}_${p}`;
  const nets=new Map(),cells=new Map();
  const ensureNet=(id)=>{if(!nets.has(id))nets.set(id,{id,value:'x',drivers:[],fanout:[]});return nets.get(id);};
  const seenP=new Set(),topIn=[],topOut=[];
  nodes.forEach(node=>{
    node.data.ports?.inputs?.forEach(p=>{
      if(!by[`${node.id}:${p.name}`]){const netId=inSig(node,p.name);if(!seenP.has(netId)){seenP.add(netId);topIn.push({netId,portName:p.name,width:p.width,nodeLabel:node.data.label});}ensureNet(netId);}
    });
    node.data.ports?.outputs?.forEach(p=>{
      if(!to[`${node.id}:${p.name}`]){const netId=outSig(node,p.name);if(!seenP.has(netId)){seenP.add(netId);topOut.push({netId,portName:p.name,width:p.width});}ensureNet(netId);}
    });
  });
  nodes.forEach(node=>{
    const cellId=node.data.id;if(!cellId)return;
    const inputNets={},outputNets={};
    node.data.ports?.inputs?.forEach(p=>{if(POWER.has(p.name))return;const netId=inSig(node,p.name);inputNets[p.name]=netId;ensureNet(netId).fanout.push(node.data.instanceName);});
    node.data.ports?.outputs?.forEach(p=>{const netId=outSig(node,p.name);outputNets[p.name]=netId;ensureNet(netId).drivers.push(node.data.instanceName);});
    cells.set(node.data.instanceName,{cellId,instanceName:node.data.instanceName,inputs:inputNets,outputs:outputNets,isFF:isSequential(cellId),isComb:isCombinational(cellId),state:{Q:'x'},prevCLK:'x'});
  });
  return{nets,cells,topInputs:topIn,topOutputs:topOut};
}
