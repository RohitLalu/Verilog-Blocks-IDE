import React,{useState,useEffect}from'react';
import useStore from'../store/graphStore.js';

export default function ProjectBrowser(){
  const{setShowProjectBrowser,setProjectName,setSelectedPDK,setPDKLocked,pushNotification,
    setStaSlack}=useStore();
  const[projects,setProjects]=useState([]);
  const[loading,setLoading]=useState(true);
  const[loadingProj,setLoadingProj]=useState(null);
  const[error,setError]=useState('');

  useEffect(()=>{
    async function load(){
      if(!window.api?.project?.list){setError('Project listing requires the server backend (Docker or Electron).');setLoading(false);return;}
      try{
        const list=await window.api.project.list();
        setProjects(list||[]);
      }catch(e){setError('Could not load project list.');}
      setLoading(false);
    }
    load();
  },[]);

  const handleOpen=async(name)=>{
    setLoadingProj(name);
    try{
      const data=await window.api.project.load(name);
      if(!data||!data.graph){pushNotification(`Could not load "${name}"`,'error');setLoadingProj(null);return;}

      // Replace the graph wholesale
      const store=useStore.getState();
      store._pushHistory();
      useStore.setState({
        nodes:data.graph.nodes||[],
        edges:data.graph.edges||[],
        instanceCounter:data.graph.instanceCounter||{},
      });
      setProjectName(name);
      setStaSlack({});

      // Restore PDK if metadata present
      if(data.meta?.pdkId){
        setSelectedPDK({id:data.meta.pdkId,name:data.meta.pdkName||data.meta.pdkId});
      }
      setPDKLocked((data.graph.nodes||[]).length>0);

      pushNotification(`Loaded "${name}" (${(data.graph.nodes||[]).length} blocks)`,'success');
      setShowProjectBrowser(false);
    }catch(e){
      pushNotification(`Error loading "${name}": ${e.message}`,'error');
    }
    setLoadingProj(null);
  };

  return(
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,fontFamily:"'Space Grotesk',sans-serif"}}>
      <div style={{background:'#161b27',border:'1px solid #1e2733',borderRadius:12,width:520,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,.6)'}}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid #1e2733',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'#94a3b8',fontSize:15,fontWeight:700}}>📂 Open Project</span>
          <button onClick={()=>setShowProjectBrowser(false)} style={{background:'transparent',border:'none',color:'#334155',cursor:'pointer',fontSize:18}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {loading&&<div style={{color:'#334155',fontSize:12,textAlign:'center',padding:30}}>Loading projects…</div>}
          {error&&<div style={{color:'#f87171',fontSize:12,textAlign:'center',padding:30,lineHeight:1.7}}>{error}<br/><span style={{color:'#475569',fontSize:11}}>(works in Docker / Electron mode, where the server can list saved projects)</span></div>}
          {!loading&&!error&&projects.length===0&&<div style={{color:'#334155',fontSize:12,textAlign:'center',padding:30}}>No saved projects yet.<br/><span style={{fontSize:10}}>Use ↓ Save in the toolbar to create one.</span></div>}
          {!loading&&!error&&projects.map(name=>(
            <div key={name} onClick={()=>handleOpen(name)}
              style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderRadius:7,border:'1px solid #1e2733',marginBottom:8,cursor:loadingProj?'wait':'pointer',background:'#0d1117',opacity:loadingProj&&loadingProj!==name?.5:1}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='#3b82f6'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='#1e2733'}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>📁</span>
                <span style={{color:'#e2e8f0',fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}>{name}</span>
              </div>
              <span style={{color:'#475569',fontSize:11}}>{loadingProj===name?'⟳ Loading…':'Open →'}</span>
            </div>
          ))}
        </div>
        <div style={{padding:'12px 22px',borderTop:'1px solid #1e2733',color:'#1e2733',fontSize:10}}>
          Opening a project replaces your current workspace (you can Undo with Ctrl+Z).
        </div>
      </div>
    </div>
  );
}
