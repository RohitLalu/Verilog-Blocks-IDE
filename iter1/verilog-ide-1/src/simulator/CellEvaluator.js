const AND=(a,b)=>a===0||b===0?0:a===1&&b===1?1:'x';
const OR=(a,b)=>a===1||b===1?1:a===0&&b===0?0:'x';
const XOR=(a,b)=>a==='x'||b==='x'?'x':a^b;
const NOT=(a)=>a==='x'?'x':a?0:1;
const NAND=(a,b)=>NOT(AND(a,b));
const NOR=(a,b)=>NOT(OR(a,b));
const XNOR=(a,b)=>NOT(XOR(a,b));
const MUX=(s,a0,a1)=>s==='x'?'x':s?a1:a0;

const COMB={
  sky130_and2:(i)=>({X:AND(i.A,i.B)}),
  sky130_and3:(i)=>({X:AND(AND(i.A,i.B),i.C)}),
  sky130_or2:(i)=>({X:OR(i.A,i.B)}),
  sky130_or3:(i)=>({X:OR(OR(i.A,i.B),i.C)}),
  sky130_xor2:(i)=>({X:XOR(i.A,i.B)}),
  sky130_xnor2:(i)=>({X:XNOR(i.A,i.B)}),
  sky130_inv:(i)=>({Y:NOT(i.A)}),
  sky130_nand2:(i)=>({Y:NAND(i.A,i.B)}),
  sky130_nor2:(i)=>({Y:NOR(i.A,i.B)}),
  sky130_mux2:(i)=>({X:MUX(i.S,i.A0,i.A1)}),
  sky130_mux4:(i)=>{const s=i.S1==='x'||i.S0==='x'?'x':(i.S1<<1)|i.S0;return{X:s==='x'?'x':[i.A0,i.A1,i.A2,i.A3][s]};},
  sky130_buf:(i)=>({X:i.A}),
  sky130_clkbuf:(i)=>({X:i.A}),
  sky130_ha:(i)=>({SUM:XOR(i.A,i.B),COUT:AND(i.A,i.B)}),
  sky130_fa:(i)=>{const s1=XOR(i.A,i.B);return{SUM:XOR(s1,i.CIN),COUT:OR(AND(i.A,i.B),AND(s1,i.CIN))};},
  sky130_conb:()=>({HI:1,LO:0}),
};

const FF={
  sky130_dfxtp:(st,i,pe)=>{const Q=pe?i.D:st.Q;return{nextQ:Q,outputs:{Q}};},
  sky130_dfrtp:(st,i,pe)=>{if(i.RESET_B===0)return{nextQ:0,outputs:{Q:0}};const Q=pe?(i.D===undefined?'x':i.D):st.Q;return{nextQ:Q,outputs:{Q}};},
  sky130_sdfxtp:(st,i,pe)=>{if(!pe)return{nextQ:st.Q,outputs:{Q:st.Q}};const Q=i.SCE===1?i.SCD:i.D;return{nextQ:Q??'x',outputs:{Q:Q??'x'}};},
};

export const evaluateComb=(cellId,inputMap)=>{try{return COMB[cellId]?.(inputMap)||null;}catch{return null;}};
export const evaluateFF=(cellId,state,inputMap,posEdge)=>{const fn=FF[cellId];return fn?fn(state,inputMap,posEdge):{nextQ:state.Q??'x',outputs:{Q:state.Q??'x'}};};
export const isSequential=(id)=>id in FF;
export const isCombinational=(id)=>id in COMB;
