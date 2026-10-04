import * as C from 'cesium';
import {decodeOfficialGlb} from './buildingGeometry.js';
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
/** Per-tile display height correction, using real model bases and terrain.
 * Restore every original transform when disabled. Never infer an XY shift. */
export function createBuildingAlignment(layer,onChange=()=>{}){
 let enabled=true,disposed=false,busy=false,suspended=false,controller=null;
 const entries=new Map(),attempts=new Map();let last=null,activeProvider=layer.viewer.terrainProvider;
 function state(value){layer.dataMetadata={...layer.dataMetadata,buildingAlignment:{...layer.dataMetadata?.buildingAlignment,...value}};onChange();}
 state({status:'pending',enabled:true,note:'等待街區圖磚，將比較模型底面與地形高程；不改寫官方來源。'});
 const geometryChanged=()=>window.dispatchEvent(new CustomEvent('gev-tw:building-geometry-changed',{detail:{id:layer.id}}));
 const aerialPriority=event=>{suspended=!!event.detail?.active;if(suspended)controller?.abort();};window.addEventListener('gev-tw:aerial-priority',aerialPriority);
 function restore(){for(const entry of entries.values())entry.tile.transform=C.Matrix4.clone(entry.original);entries.clear();attempts.clear();last=null;geometryChanged();layer.viewer.scene.requestRender();}
 async function consider(tile){
  if(activeProvider!==layer.viewer.terrainProvider&&!busy){restore();activeProvider=layer.viewer.terrainProvider;state({status:'pending',tiles:0});}
  if(!enabled||disposed||busy||suspended||!layer.visible||layer.viewer.camera.positionCartographic.height>6000)return;
  // Limit workload to currently visible street blocks, one job at a time.
  if(!tile.boundingSphere||tile.boundingSphere.radius>600||entries.has(tile)||entries.size>=256||(attempts.get(tile)||0)>=3)return;
  const url=tile.content?.url;if(typeof url!=='string'||!url.split('?')[0].endsWith('.glb'))return;
  const target=new URL(url,layer.serviceUrl);if(target.protocol!=='https:'||!/(^|\.)nlsc\.gov\.tw$/.test(target.hostname))return;
  busy=true;attempts.set(tile,(attempts.get(tile)||0)+1);controller=new AbortController();const job=controller;
  const original=C.Matrix4.clone(tile.transform),computed=C.Matrix4.clone(tile.computedTransform);
  const parent=C.Matrix4.multiply(computed,C.Matrix4.inverse(original,new C.Matrix4()),new C.Matrix4());
  try{
   const response=await fetch(target.href,{signal:job.signal});if(!response.ok)throw Error('官方圖磚無法讀取');
   const geometry=decodeOfficialGlb(await response.arrayBuffer(),{tileTransform:computed});
   const buildings=geometry.buildings.filter(b=>b.vertices.length>=6&&b.roofHeight-b.baseHeight>=2).slice(0,48);if(buildings.length<5)throw Error('底面取樣不足，保留原高程');
   const provider=layer.viewer.terrainProvider,samples=buildings.map(b=>C.Cartographic.fromDegrees(...b.center));
   const terrain=await C.sampleTerrainMostDetailed(provider,samples);job.signal.throwIfAborted();
   if(provider!==layer.viewer.terrainProvider)throw Error('地形來源已切換，需重新比較');
   if(!C.Matrix4.equalsEpsilon(computed,tile.computedTransform,1e-8)){attempts.delete(tile);return;}
   const rows=buildings.map((b,i)=>({longitude:b.center[0],latitude:b.center[1],base:b.baseHeight,terrain:terrain[i].height,delta:terrain[i].height-b.baseHeight})).filter(r=>Number.isFinite(r.delta));
   if(rows.length<5)throw Error('地形取樣不足，保留原高程');
   const delta=median(rows.map(r=>r.delta)),mad=median(rows.map(r=>Math.abs(r.delta-delta)));
   if(Math.abs(delta)>100||mad>3)throw Error('來源高程差不一致，保留原高程並請人工核對');
   const offset=Math.abs(delta)<1?0:delta;if(disposed||!enabled)return;
   const lon=median(rows.map(r=>r.longitude)),lat=median(rows.map(r=>r.latitude));
   const movement=C.Cartesian3.subtract(C.Cartesian3.fromDegrees(lon,lat,offset),C.Cartesian3.fromDegrees(lon,lat,0),new C.Cartesian3());
   const translation=C.Matrix4.fromTranslation(movement);
   // Conjugate the world vertical translation into the tile's parent frame.
   // Child transforms inherit their parent's correction, so their residual
   // is measured again rather than adding a county-wide offset twice.
   const local=C.Matrix4.multiply(C.Matrix4.inverse(parent,new C.Matrix4()),C.Matrix4.multiply(translation,parent,new C.Matrix4()),new C.Matrix4());
   // A corrected ancestor changes all child world transforms. Restore child
   // corrections before they are measured again, preventing double offsets.
   for(const [child,entry] of entries){
    let ancestor=child.parent;
    while(ancestor&&ancestor!==tile)ancestor=ancestor.parent;
    if(ancestor===tile){child.transform=C.Matrix4.clone(entry.original);entries.delete(child);attempts.delete(child);}
   }
   tile.transform=C.Matrix4.multiply(local,original,new C.Matrix4());
   last={source:target.href,offsetMeters:offset,samples:rows.length,medianAbsoluteDeviation:mad,terrainSource:provider.constructor.name,rows,checkedAt:new Date().toISOString()};
   entries.set(tile,{tile,original,...last});geometryChanged();layer.viewer.scene.requestRender();
   state({status:'aligned',enabled:true,tiles:entries.size,...last,note:'逐街區模型底面對齊目前地形的展示高程；官方水平位置與來源檔保留，不代表官方高程改正或地籍精度。'});
  }catch(error){if(!disposed&&enabled&&error.name!=='AbortError')state({status:entries.size?'aligned':'unverified',note:String(error.message).slice(0,200)});}
  finally{if(controller===job)controller=null;busy=false;}
 }
 return {consider,getTileStatus(url){const entry=[...entries.values()].find(item=>item.source===url);return entry?{...entry,tile:undefined,original:undefined,transform:C.Matrix4.clone(entry.tile.computedTransform)}:null;},setEnabled(value){enabled=!!value;controller?.abort();restore();state({enabled,status:enabled?'pending':'disabled',tiles:0,note:enabled?'等待可驗證的街區底面與地形':'使用官方原始高程'});},manual(){enabled=false;controller?.abort();restore();state({enabled:false,status:'manual',tiles:0,note:'使用者高程微調，已停止自動對齊'});},destroy(){disposed=true;controller?.abort();window.removeEventListener('gev-tw:aerial-priority',aerialPriority);restore();}};
}
