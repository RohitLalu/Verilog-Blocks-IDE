export function parseVCD(text){
  const tokens=text.replace(/\$end/g,'$end\n').split(/[\s]+/).filter(Boolean);
  let t=0,curTime=0;
  const signalMap=new Map(),scopePath=[{name:'root',children:[],signals:[]}];
  let curScope=scopePath[0];
  let timescale='1ns';
  const next=()=>tokens[t++];
  const until=s=>{const p=[];while(t<tokens.length&&tokens[t]!==s)p.push(next());if(tokens[t]===s)t++;return p;};
  while(t<tokens.length){
    const tok=next();
    if(tok==='$timescale'){timescale=until('$end').join(' ');continue;}
    if(tok==='$scope'){const p=until('$end');const nm=p[1]||p[0]||'anon';const ns={name:nm,children:[],signals:[],parent:curScope};curScope.children.push(ns);scopePath.push(ns);curScope=ns;continue;}
    if(tok==='$upscope'){until('$end');scopePath.pop();curScope=scopePath[scopePath.length-1]||scopePath[0];continue;}
    if(tok==='$var'){
      const p=until('$end');
      const type=p[0],width=parseInt(p[1])||1,id=p[2],name=p[3]||id;
      const fullName=[...scopePath.slice(1).map(s=>s.name),name].join('.');
      const sig={id,name,fullName,scope:scopePath.slice(1).map(s=>s.name),width,type,transitions:[],color:null};
      signalMap.set(id,sig);curScope.signals.push(sig);continue;
    }
    if(['$enddefinitions','$dumpvars','$comment','$version','$date','$end'].includes(tok)){until('$end');continue;}
    if(tok.startsWith('#')){curTime=parseInt(tok.slice(1));continue;}
    if(/^[01xzXZ]/.test(tok)&&tok.length>1&&!tok.startsWith('b')&&!tok.startsWith('r')){
      const val=tok[0].toLowerCase(),id=tok.slice(1),sig=signalMap.get(id);
      if(sig)sig.transitions.push({time:curTime,value:val==='1'?1:val==='0'?0:val});continue;
    }
    if(tok.startsWith('b')||tok.startsWith('B')){
      const bin=tok.slice(1),id=next(),sig=signalMap.get(id);
      if(sig){const v=/^[xX]+$/.test(bin)?'x':/^[zZ]+$/.test(bin)?'z':parseInt(bin.replace(/[xXzZ]/g,'0'),2);sig.transitions.push({time:curTime,value:v});}continue;
    }
    if(tok.startsWith('r')||tok.startsWith('R')){const id=next(),sig=signalMap.get(id);if(sig)sig.transitions.push({time:curTime,value:parseFloat(tok.slice(1))});continue;}
  }
  const signals=[...signalMap.values()];
  signals.forEach(sig=>{
    sig.transitions.sort((a,b)=>a.time-b.time);
    sig.transitions=sig.transitions.filter((t,i)=>i===0||t.value!==sig.transitions[i-1].value);
  });
  let endTime=0;
  signals.forEach(s=>{if(s.transitions.length)endTime=Math.max(endTime,s.transitions[s.transitions.length-1].time);});
  const COLORS=['#4ade80','#60a5fa','#f59e0b','#f472b6','#a78bfa','#38bdf8','#fb923c','#34d399','#facc15','#e879f9'];
  signals.forEach((s,i)=>{
    if(/clk|clock/i.test(s.name))s.color='#facc15';
    else if(/rst|reset/i.test(s.name))s.color='#f87171';
    else s.color=COLORS[i%COLORS.length];
  });
  return{timescale,endTime,signals,hierarchy:scopePath[0],signalMap};
}
export function getValueAt(signal,time){
  if(!signal.transitions.length)return'x';
  let v=signal.transitions[0].value;
  for(const t of signal.transitions){if(t.time>time)break;v=t.value;}
  return v;
}
export function formatValue(value,width,mode='hex'){
  if(value==='x')return'x';if(value==='z')return'z';
  if(width===1)return String(value);
  const n=typeof value==='number'?value:0;
  switch(mode){case'bin':return n.toString(2).padStart(width,'0');case'dec':return String(n);case'oct':return n.toString(8);default:return n.toString(16).toUpperCase().padStart(Math.ceil(width/4),'0');}
}
export function timescaleToNs(ts){
  const m=(ts||'1ns').match(/([\d.]+)\s*(fs|ps|ns|us|ms|s)/i);
  if(!m)return 1;
  const val=parseFloat(m[1]),unit=m[2].toLowerCase();
  const factors={fs:1e-6,ps:1e-3,ns:1,us:1e3,ms:1e6,s:1e9};
  return val*(factors[unit]||1);
}
