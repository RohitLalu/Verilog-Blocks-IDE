/** Liberty (.lib) parser — extracts per-cell timing arcs and LUT tables */

export function parseLibertyFile(content) {
  const tokens = tokenize(content);
  const parser = new Parser(tokens);
  const root   = parser.parseGroup();
  return extractLibrary(root);
}

function tokenize(src) {
  const tokens = []; let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src[i]==='/'&&src[i+1]==='/') { while(i<src.length&&src[i]!=='\n')i++; continue; }
    if (src[i]==='/'&&src[i+1]==='*') { i+=2; while(i<src.length&&!(src[i]==='*'&&src[i+1]==='/'))i++; i+=2; continue; }
    if (src[i]==='"') { let s=''; i++; while(i<src.length&&src[i]!=='"')s+=src[i++]; i++; tokens.push({t:'S',v:s}); continue; }
    if ('{}();,:\\'.includes(src[i])) { tokens.push({t:'P',v:src[i++]}); continue; }
    let w=''; while(i<src.length&&!/[\s{}();,:\\"\/]/.test(src[i]))w+=src[i++];
    if(w) tokens.push({t:'W',v:w});
  }
  return tokens;
}

class Parser {
  constructor(t){this.t=t;this.i=0;}
  peek(){return this.t[this.i];}
  next(){return this.t[this.i++];}
  eat(v){if(this.peek()?.v===v)this.next();}
  parseGroup(){
    const node={type:'',name:'',attrs:{},children:[]};
    const kw=this.next(); if(!kw)return node;
    node.type=kw.v;
    if(this.peek()?.v==='('){
      this.eat('('); let nm='';
      while(this.peek()?.v!=')')nm+=this.next().v;
      this.eat(')'); node.name=nm.trim();
    }
    if(this.peek()?.v==='{'){
      this.eat('{');
      while(this.peek()&&this.peek()?.v!=='}'){
        const child=this.tryItem(); if(!child)break;
        if(child.isAttr)node.attrs[child.key]=child.val;
        else node.children.push(child.node);
      }
      this.eat('}');
    }else if(this.peek()?.v===':'){
      this.eat(':'); let val='';
      while(this.peek()&&this.peek()?.v!==';'&&this.peek()?.v!=='}')val+=this.next().v+' ';
      this.eat(';'); node.attrs['_value']=val.trim();
    }
    return node;
  }
  tryItem(){
    const kw=this.peek(); if(!kw)return null;
    let j=this.i+1; while(j<this.t.length&&this.t[j]?.v===' ')j++;
    const nxt=this.t[j]?.v;
    if(nxt===':'){
      const key=this.next().v; this.eat(':'); let val='';
      while(this.peek()&&this.peek()?.v!==';'&&this.peek()?.v!=='}')val+=this.next().v+' ';
      this.eat(';'); return{isAttr:true,key,val:val.trim()};
    }
    return{isAttr:false,node:this.parseGroup()};
  }
}

function extractLibrary(root) {
  const libNode=root.children?.find(c=>c.type==='library')||root;
  const cells={};
  for(const cn of(libNode.children||[]).filter(c=>c.type==='cell'))
    cells[cn.name]=extractCell(cn);
  return{library:libNode.name,cells};
}

function extractCell(cellNode) {
  const area=parseFloat(cellNode.attrs.area||'0');
  const arcs=[],setup=[],hold=[];
  for(const pin of cellNode.children.filter(c=>c.type==='pin')){
    const dir=pin.attrs.direction||'';
    if(dir==='output'){
      for(const tm of pin.children.filter(c=>c.type==='timing')){
        const arc={from:tm.attrs.related_pin?.replace(/"/g,'')||'',to:pin.name,
          timing_sense:tm.attrs.timing_sense||'non_unate',
          cell_rise:null,cell_fall:null,rise_transition:null,fall_transition:null};
        for(const lut of tm.children){
          const l=extractLUT(lut); if(!l)continue;
          if(lut.type==='cell_rise')arc.cell_rise=l;
          if(lut.type==='cell_fall')arc.cell_fall=l;
          if(lut.type==='rise_transition')arc.rise_transition=l;
          if(lut.type==='fall_transition')arc.fall_transition=l;
        }
        arcs.push(arc);
      }
    }
    if(dir==='input'){
      for(const tm of pin.children.filter(c=>c.type==='timing')){
        const rel=tm.attrs.related_pin?.replace(/"/g,'')||'';
        const tt=tm.attrs.timing_type||'';
        for(const lut of tm.children){
          const l=extractLUT(lut); if(!l)continue;
          if(tt.includes('setup'))setup.push({pin:pin.name,related:rel,lut:l});
          if(tt.includes('hold')) hold.push({pin:pin.name,related:rel,lut:l});
        }
      }
    }
  }
  return{area,arcs,setup,hold};
}

function extractLUT(node){
  if(!node.attrs)return null;
  const pi=(s)=>(s||'').replace(/"/g,'').split(',').map(Number).filter(n=>!isNaN(n));
  const idx1=pi(node.attrs.index_1); if(!idx1.length)return null;
  const idx2=pi(node.attrs.index_2);
  const nums=(node.attrs.values||'').replace(/["\\\n]/g,' ').split(/[\s,]+/).map(Number).filter(n=>!isNaN(n));
  const values=idx2.length
    ?idx1.map((_,r)=>nums.slice(r*idx2.length,(r+1)*idx2.length))
    :[nums];
  return{index1:idx1,index2:idx2,values};
}

export function lookupLUT(lut,slew,cap){
  if(!lut)return 0;
  const{index1,index2,values}=lut;
  const interp=(arr,v)=>{
    if(arr.length===1)return{lo:0,hi:0,frac:0};
    for(let i=0;i<arr.length-1;i++){
      if(v<=arr[i+1])return{lo:i,hi:i+1,frac:arr[i+1]===arr[i]?0:(v-arr[i])/(arr[i+1]-arr[i])};
    }
    return{lo:arr.length-2,hi:arr.length-1,frac:1};
  };
  const ri=interp(index1,slew);
  if(!index2.length){const r0=values[0][ri.lo],r1=values[0][ri.hi];return r0+(r1-r0)*ri.frac;}
  const ci=interp(index2,cap);
  const v00=values[ri.lo][ci.lo],v01=values[ri.lo][ci.hi];
  const v10=values[ri.hi][ci.lo],v11=values[ri.hi][ci.hi];
  return(v00+(v01-v00)*ci.frac)+(((v10+(v11-v10)*ci.frac)-(v00+(v01-v00)*ci.frac))*ri.frac);
}

export function getCellDelay(timingData,cellName,fromPin,toPin,isRise=true){
  const cell=timingData?.cells?.[cellName]; if(!cell)return 0.1;
  const arc=cell.arcs.find(a=>a.from===fromPin&&a.to===toPin); if(!arc)return 0.1;
  return lookupLUT(isRise?arc.cell_rise:arc.cell_fall,0.05,0.005)||0.1;
}
