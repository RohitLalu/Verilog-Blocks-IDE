import React from'react';
import useStore from'../store/graphStore.js';

// Opens the assistant and asks `prompt`; the assistant already sees the design and the latest results.
export default function ExplainButton({prompt,label='✦ Explain',style}){
  const assistantAsk=useStore(s=>s.assistantAsk);
  return(<button onClick={()=>assistantAsk(prompt)} title="Ask the assistant about this"
    style={{background:'#2a0f24',border:'1px solid #9d174d',borderRadius:6,color:'#f472b6',fontSize:11,padding:'4px 10px',
      cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",whiteSpace:'nowrap',...style}}>{label}</button>);
}
