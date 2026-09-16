const AND=(a,b)=>a===0||b===0?0:a===1&&b===1?1:'x';
const OR=(a,b)=>a===1||b===1?1:a===0&&b===0?0:'x';
const XOR=(a,b)=>a==='x'||b==='x'?'x':a^b;
const NOT=a=>a==='x'?'x':a?0:1;
const MUX=(s,a0,a1)=>s==='x'?'x':s?a1:a0;
const MAJ=(a,b,c)=>OR(OR(AND(a,b),AND(b,c)),AND(a,c));

const COMB={
  // sky130
  sky130_and2:i=>({X:AND(i.A,i.B)}), sky130_and3:i=>({X:AND(AND(i.A,i.B),i.C)}), sky130_and4:i=>({X:AND(AND(AND(i.A,i.B),i.C),i.D)}),
  sky130_or2:i=>({X:OR(i.A,i.B)}), sky130_or3:i=>({X:OR(OR(i.A,i.B),i.C)}), sky130_or4:i=>({X:OR(OR(OR(i.A,i.B),i.C),i.D)}),
  sky130_xor2:i=>({X:XOR(i.A,i.B)}), sky130_xnor2:i=>({X:NOT(XOR(i.A,i.B))}),
  sky130_inv:i=>({Y:NOT(i.A)}), sky130_inv2:i=>({Y:NOT(i.A)}), sky130_inv4:i=>({Y:NOT(i.A)}),
  sky130_nand2:i=>({Y:NOT(AND(i.A,i.B))}), sky130_nand3:i=>({Y:NOT(AND(AND(i.A,i.B),i.C))}), sky130_nand4:i=>({Y:NOT(AND(AND(AND(i.A,i.B),i.C),i.D))}),
  sky130_nor2:i=>({Y:NOT(OR(i.A,i.B))}), sky130_nor3:i=>({Y:NOT(OR(OR(i.A,i.B),i.C))}), sky130_nor4:i=>({Y:NOT(OR(OR(OR(i.A,i.B),i.C),i.D))}),
  sky130_mux2:i=>({X:MUX(i.S,i.A0,i.A1)}), sky130_mux2i:i=>({Y:NOT(MUX(i.S,i.A0,i.A1))}),
  sky130_mux4:i=>{const s=i.S1==='x'||i.S0==='x'?'x':(i.S1<<1)|i.S0;return{X:s==='x'?'x':[i.A0,i.A1,i.A2,i.A3][s]};},
  sky130_aoi21:i=>({Y:NOT(OR(AND(i.A1,i.A2),i.B1))}), sky130_aoi22:i=>({Y:NOT(OR(AND(i.A1,i.A2),AND(i.B1,i.B2)))}), sky130_aoi211:i=>({Y:NOT(OR(OR(AND(i.A1,i.A2),i.B1),i.C1))}),
  sky130_oai21:i=>({Y:NOT(AND(OR(i.A1,i.A2),i.B1))}), sky130_oai22:i=>({Y:NOT(AND(OR(i.A1,i.A2),OR(i.B1,i.B2)))}), sky130_oai211:i=>({Y:NOT(AND(AND(OR(i.A1,i.A2),i.B1),i.C1))}),
  sky130_maj3:i=>({X:MAJ(i.A,i.B,i.C)}),
  sky130_buf:i=>({X:i.A}), sky130_buf4:i=>({X:i.A}), sky130_buf8:i=>({X:i.A}), sky130_clkbuf:i=>({X:i.A}), sky130_clkbuf4:i=>({X:i.A}), sky130_clkbuf8:i=>({X:i.A}), sky130_clkinv:i=>({Y:NOT(i.A)}),
  sky130_ha:i=>({SUM:XOR(i.A,i.B),COUT:AND(i.A,i.B)}),
  sky130_fa:i=>{const s1=XOR(i.A,i.B);return{SUM:XOR(s1,i.CIN),COUT:OR(AND(i.A,i.B),AND(s1,i.CIN))};},
  sky130_conb:()=>({HI:1,LO:0}), sky130_ebufn:i=>({Z:i.TE_B===0?i.A:'z'}),
  // gf180
  gf180_and2:i=>({Z:AND(i.A1,i.A2)}), gf180_and3:i=>({Z:AND(AND(i.A1,i.A2),i.A3)}), gf180_and4:i=>({Z:AND(AND(AND(i.A1,i.A2),i.A3),i.A4)}),
  gf180_or2:i=>({Z:OR(i.A1,i.A2)}), gf180_or3:i=>({Z:OR(OR(i.A1,i.A2),i.A3)}),
  gf180_xor2:i=>({Z:XOR(i.A1,i.A2)}), gf180_xnor2:i=>({Z:NOT(XOR(i.A1,i.A2))}),
  gf180_inv:i=>({ZN:NOT(i.A)}), gf180_nand2:i=>({ZN:NOT(AND(i.A1,i.A2))}), gf180_nand3:i=>({ZN:NOT(AND(AND(i.A1,i.A2),i.A3))}),
  gf180_nor2:i=>({ZN:NOT(OR(i.A1,i.A2))}), gf180_nor3:i=>({ZN:NOT(OR(OR(i.A1,i.A2),i.A3))}),
  gf180_aoi21:i=>({ZN:NOT(OR(AND(i.A1,i.A2),i.B))}), gf180_oai21:i=>({ZN:NOT(AND(OR(i.A1,i.A2),i.B))}),
  gf180_mux2:i=>({Z:MUX(i.S,i.I0,i.I1)}),
  gf180_ha:i=>({S:XOR(i.A,i.B),CO:AND(i.A,i.B)}),
  gf180_fa:i=>{const s1=XOR(i.A,i.B);return{S:XOR(s1,i.CI),CO:OR(AND(i.A,i.B),AND(s1,i.CI))};},
  gf180_buf:i=>({Z:i.A}), gf180_buf2:i=>({Z:i.A}), gf180_buf4:i=>({Z:i.A}), gf180_clkbuf:i=>({Z:i.A}), gf180_clkbuf2:i=>({Z:i.A}),
  gf180_tieh:()=>({Z:1}), gf180_tiel:()=>({Z:0}),
};

const FF={
  sky130_dfxtp:(st,i,pe)=>{const Q=pe?i.D:st.Q;return{nextQ:Q,outputs:{Q}};},
  sky130_dfrtp:(st,i,pe)=>{if(i.RESET_B===0)return{nextQ:0,outputs:{Q:0}};const Q=pe?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  sky130_dfstp:(st,i,pe)=>{if(i.SET_B===0)return{nextQ:1,outputs:{Q:1}};const Q=pe?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  sky130_edfxtp:(st,i,pe)=>{const Q=pe&&i.DE===1?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  sky130_sdfxtp:(st,i,pe)=>{if(!pe)return{nextQ:st.Q,outputs:{Q:st.Q}};const Q=i.SCE===1?i.SCD??'x':i.D??'x';return{nextQ:Q,outputs:{Q}};},
  sky130_sdfrtp:(st,i,pe)=>{if(i.RESET_B===0)return{nextQ:0,outputs:{Q:0}};if(!pe)return{nextQ:st.Q,outputs:{Q:st.Q}};const Q=i.SCE===1?i.SCD??'x':i.D??'x';return{nextQ:Q,outputs:{Q}};},
  sky130_dlxtp:(st,i)=>{const Q=i.GATE===1?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  gf180_dff:(st,i,pe)=>{const Q=pe?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  gf180_dffr:(st,i,pe)=>{if(i.RN===0)return{nextQ:0,outputs:{Q:0}};const Q=pe?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  gf180_dffs:(st,i,pe)=>{if(i.SN===0)return{nextQ:1,outputs:{Q:1}};const Q=pe?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  gf180_dffsr:(st,i,pe)=>{if(i.RN===0)return{nextQ:0,outputs:{Q:0}};if(i.SN===0)return{nextQ:1,outputs:{Q:1}};const Q=pe?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  gf180_dffn:(st,i,ne)=>{const Q=ne?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
  gf180_sdff:(st,i,pe)=>{if(!pe)return{nextQ:st.Q,outputs:{Q:st.Q}};const Q=i.SE===1?i.SI??'x':i.D??'x';return{nextQ:Q,outputs:{Q}};},
  gf180_dffs_n:(st,i,ne)=>{const Q=ne?i.D??'x':st.Q;return{nextQ:Q,outputs:{Q}};},
};

const NEG_EDGE_FFS=new Set(['gf180_dffn','gf180_dffs_n']);

export const evaluateComb=(id,iv)=>{try{return COMB[id]?.(iv)||null;}catch{return null;}};
export const evaluateFF=(id,state,iv,posEdge,negEdge)=>{
  const fn=FF[id];if(!fn)return{nextQ:state.Q??'x',outputs:{Q:state.Q??'x'}};
  return fn(state,iv,NEG_EDGE_FFS.has(id)?negEdge:posEdge);
};
export const isSequential=id=>id in FF;
export const isCombinational=id=>id in COMB;
export const isNegEdgeFF=id=>NEG_EDGE_FFS.has(id);
