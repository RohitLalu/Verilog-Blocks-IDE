import{parseLibertyFile,getCellDelay}from'./libertyParser.js';
const _cache={};
export async function loadPDK(pdkId,pdkRoot=null){
  const key=`${pdkId}:${pdkRoot}`;if(_cache[key])return _cache[key];
  let manifest=null;
  if(window.api?.pdk?.cellsManifest)manifest=await window.api.pdk.cellsManifest(pdkId).catch(()=>null);
  if(!manifest){try{const r=await fetch(`/pdk/${pdkId}/cells-manifest.json`);if(r.ok)manifest=await r.json();}catch{}}
  if(!manifest){console.warn(`[PDK] No manifest for ${pdkId}`);manifest={cells:[],powerPorts:[],powerNets:{},pdkId};}
  let timingData=null;
  if(pdkRoot&&window.api?.pdk?.validatePath){
    try{
      const libMap={sky130:'sky130_fd_sc_hd__tt_025C_1v80.lib',gf180:'gf180mcu_fd_sc_mcu7t5v0__tt_025C_3v3.lib',ihp130:'sg13g2_stdcell_typ_1p2V_25C.lib'};
      const v=await window.api.pdk.validatePath({pdkId,rootPath:pdkRoot});
      const libPath=libMap[pdkId]&&v.found?.[libMap[pdkId]];
      if(libPath){const r=await window.api.pdk.readLib({libPath});if(r.ok){timingData=parseLibertyFile(r.content);console.log(`[PDK] Liberty: ${libPath} — ${Object.keys(timingData.cells).length} cells`);}}
    }catch(e){console.warn('[PDK] Liberty skip:',e.message);}
  }
  const ctx=new PDKContext(pdkId,manifest,timingData);_cache[key]=ctx;return ctx;
}
export class PDKContext{
  constructor(pdkId,manifest,timingData){this.pdkId=pdkId;this.manifest=manifest;this.timingData=timingData;this._cm=Object.fromEntries((manifest.cells||[]).map(c=>[c.id,c]));}
  get cells(){return this.manifest.cells||[];}
  getCell(id){return this._cm[id]||null;}
  cellName(id){return this._cm[id]?.cell||id;}
  getDelay(cellId,fromPin,toPin,isRise=true){
    const def=this._cm[cellId];if(!def)return 0.1;
    if(this.timingData){const d=getCellDelay(this.timingData,def.cell,fromPin,toPin,isRise);if(d>0)return d;}
    const h=def.timingHint;return h?(h.tpd_typ||h.tco||0.1):0.1;
  }
  getSetup(cellId){return this._cm[cellId]?.timingHint?.tsu||0.18;}
  getHold(cellId){return this._cm[cellId]?.timingHint?.thd||0.04;}
  buildInstantiation(cellId,instanceName,portMap){
    const def=this._cm[cellId];if(!def)return`// UNKNOWN: ${cellId}`;
    const nets=this.manifest.powerNets||{};
    const ports=[...Object.entries(portMap).map(([p,s])=>`        .${p}(${s})`),...(this.manifest.powerPorts||[]).map(pp=>`        .${pp}(${nets[pp]||"1'b0"})`)];
    return`    ${def.cell} ${instanceName} (\n${ports.join(',\n')}\n    );`;
  }
}
