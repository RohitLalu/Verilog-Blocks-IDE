import{EventQueue}from'./EventQueue.js';
import{buildNetlist}from'./NetlistGraph.js';
import{evaluateComb,evaluateFF,isNegEdgeFF}from'./CellEvaluator.js';

const MAX_TIME=2000,MAX_EVENTS=500_000;

export function runSimulation(nodes,edges,stimulus,pdkCtx=null){
  const t0=performance.now();
  const{nets,cells,topInputs,topOutputs}=buildNetlist(nodes,edges);
  const waveform=new Map();
  nets.forEach((_,id)=>waveform.set(id,[{time:0,value:'x'}]));
  const rec=(id,time,value)=>{const w=waveform.get(id);if(!w)return;if(w[w.length-1].value!==value)w.push({time,value});};
  const queue=new EventQueue();
  const pending=new Map();
  const sched=(id,value,time)=>{if(pending.get(id)===time)return;queue.push({time,netId:id,value});pending.set(id,time);};
  Object.entries(stimulus).forEach(([id,evs])=>evs.forEach(({time,value})=>queue.push({time,netId:id,value,isStim:true})));
  topInputs.forEach(p=>{if(!stimulus[p.netId])sched(p.netId,'x',0);});
  const delay=(cell,out,rise)=>{if(!pdkCtx)return 0.1;if(cell.isFF)return pdkCtx.getDelay(cell.cellId,'CLK',out,rise);const rel=Object.keys(cell.inputs)[0]||'A';return pdkCtx.getDelay(cell.cellId,rel,out,rise)||0.1;};
  const propagate=(netId,now)=>{
    const net=nets.get(netId);if(!net)return;
    net.fanout.forEach(inst=>{
      const cell=cells.get(inst);if(!cell)return;
      const iv={};Object.entries(cell.inputs).forEach(([p,n])=>{iv[p]=nets.get(n)?.value??'x';});
      if(cell.isComb){
        const outs=evaluateComb(cell.cellId,iv);if(!outs)return;
        Object.entries(outs).forEach(([op,nv])=>{const on=cell.outputs[op];if(!on)return;if(nets.get(on)?.value!==nv)sched(on,nv,now+delay(cell,op,nv===1));});
      }else if(cell.isFF){
        const clkN=cell.inputs['CLK']||cell.inputs['clk'];const clkV=nets.get(clkN)?.value??'x';
        const posEdge=(cell.prevCLK===0||cell.prevCLK==='x')&&clkV===1;
        const negEdge=(cell.prevCLK===1||cell.prevCLK==='x')&&clkV===0;
        if(netId===clkN){cell.prevCLK=clkV;}
        const triggered=isNegEdgeFF(cell.cellId)?negEdge:posEdge;
        if(triggered||cell.cellId.includes('dlx')){
          const{nextQ,outputs}=evaluateFF(cell.cellId,cell.state,iv,posEdge,negEdge);
          cell.state.Q=nextQ;
          Object.entries(outputs).forEach(([op,nv])=>{const on=cell.outputs[op];if(!on)return;if(nets.get(on)?.value!==nv){const tco=pdkCtx?pdkCtx.getDelay(cell.cellId,'CLK',op,nv===1):0.28;sched(on,nv,now+tco);}});
        }
      }
    });
  };
  let evCount=0;
  while(!queue.empty&&evCount<MAX_EVENTS){
    const{time,netId,value}=queue.pop();evCount++;
    if(time>MAX_TIME)break;
    pending.delete(netId);
    const net=nets.get(netId);if(!net||net.value===value)continue;
    net.value=value;rec(netId,time,value);propagate(netId,time);
  }
  let endTime=0;waveform.forEach(w=>{if(w.length)endTime=Math.max(endTime,w[w.length-1].time);});
  return{waveform,netlist:{nets,cells},topInputs,topOutputs,eventCount:evCount,wallTimeMs:(performance.now()-t0).toFixed(1),endTime,nets,cells};
}

export function buildStimulus(topInputs,tbInputs,simDur=200){
  const stim={};
  topInputs.forEach(port=>{
    const cfg=tbInputs[port.netId]||tbInputs[port.portName]||{type:'constant',value:0};
    const evs=[];
    switch(cfg.type){
      case'clock':{const half=Math.max(0.5,(cfg.period||10)/2);let t=0,v=0;evs.push({time:0,value:0});while(t<simDur){t+=half;v^=1;evs.push({time:parseFloat(t.toFixed(4)),value:v});}break;}
      case'sequence':{const p=cfg.period||10,vs=cfg.values||[0,1,0,1];evs.push({time:0,value:vs[0]??0});vs.forEach((v,i)=>evs.push({time:p*(i+1),value:v}));break;}
      case'random':{evs.push({time:0,value:0});let prev=0;for(let i=1;i<=(cfg.count||8);i++){const v=Math.random()>.5?1:0;if(v!==prev)evs.push({time:(cfg.period||10)*i,value:v});prev=v;}break;}
      default:evs.push({time:0,value:cfg.value??0});
    }
    stim[port.netId]=evs;
  });
  return stim;
}

export function waveformToVCD(waveform,topInputs,topOutputs,timescale='1ns'){
  const all=[...topInputs,...topOutputs];const lines=[];const vm={};
  const ids='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  lines.push(`$timescale ${timescale} $end`,'$scope module top_tb $end');
  all.forEach((p,i)=>{const id=ids[i%ids.length]+(i>=ids.length?Math.floor(i/ids.length):'');vm[p.netId]=id;lines.push(`$var wire ${p.width||1} ${id} ${p.portName||p.netId} $end`);});
  lines.push('$upscope $end','$enddefinitions $end','#0','$dumpvars');
  all.forEach(p=>{const w=waveform.get(p.netId);const v=w?.[0]?.value??'x';lines.push(`${v==='x'?'x':v}${vm[p.netId]}`);});
  lines.push('$end');
  const times=new Set();all.forEach(p=>waveform.get(p.netId)?.forEach(e=>times.add(e.time)));
  const getV=(id,t)=>{const w=waveform.get(id);if(!w)return'x';let v='x';for(const e of w){if(e.time<=t)v=e.value;else break;}return v;};
  [...times].sort((a,b)=>a-b).forEach(t=>{lines.push(`#${Math.round(t*1000)}`);all.forEach(p=>lines.push(`${getV(p.netId,t)==='x'?'x':getV(p.netId,t)}${vm[p.netId]}`));});
  return lines.join('\n');
}
