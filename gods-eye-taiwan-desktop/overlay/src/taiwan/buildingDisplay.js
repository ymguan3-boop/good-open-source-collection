import {createBuildingAlignment} from './buildingAlignment.js';
import * as Cesium from 'cesium';
import { listLayers,setLayerVisible } from './layerRegistry.js';
import { loadWorldTerrain } from './serviceLayers.js';
const hosts=new WeakMap();
const resourcePolicies=new WeakMap();
const BUILDING_BUDGETS={eco:{sse:4,cacheMB:192,overflowMB:64},balanced:{sse:2,cacheMB:384,overflowMB:192},performance:{sse:2,cacheMB:768,overflowMB:256}};
function buildingResourcePolicy(viewer){
  const policy=resourcePolicies.get(viewer) || {profile:'balanced',pressured:false};
  const count=Math.max(1,listLayers().filter(layer=>layer.viewer===viewer && layer.kind==='3d-tiles' && layer.visible && layer.tileset).length);
  const custom=policy.custom || {},customBudget={sse:Math.max(2,Number(custom.sse)||2),cacheMB:Math.max(32,Math.min(768,Number(custom.cacheMB)||384)),overflowMB:Math.max(16,Math.min(256,Number(custom.overflowMB)||192))};
  const budget=policy.pressured ? {sse:12,cacheMB:96,overflowMB:32} : policy.profile==='custom' ? customBudget : BUILDING_BUDGETS[policy.profile] || BUILDING_BUDGETS.balanced;
  return {...budget,...policy,count,cacheMB:Math.max(32,budget.cacheMB/count),overflowMB:Math.max(16,budget.overflowMB/count)};
}
export function configureBuildingDisplay(viewer,mapStackController,{governor}={}){
  hosts.set(viewer,mapStackController);let previousDepth=null;
  resourcePolicies.set(viewer,{profile:governor?.profile || 'balanced',pressured:!!governor?.pressured,custom:governor?.custom});
  const sync=()=>{
    const active=listLayers().some(layer=>layer.kind==='3d-tiles' && layer.viewer===viewer && layer.tileset && layer.visible);
    if(active){if(previousDepth===null)previousDepth=viewer.scene.globe.depthTestAgainstTerrain;viewer.scene.globe.depthTestAgainstTerrain=false;
      if(!listLayers().some(layer=>layer.viewer===viewer && layer.kind==='taiwan-relief' && layer.visible)){viewer.scene.verticalExaggeration=1;viewer.scene.verticalExaggerationRelativeHeight=0;}}
    else if(previousDepth!==null){viewer.scene.globe.depthTestAgainstTerrain=previousDepth;previousDepth=null;}
    for(const layer of listLayers().filter(layer=>layer.viewer===viewer && layer.kind==='3d-tiles'))layer.applyResourcePolicy?.();
    viewer.scene.requestRender();
  };
  const removeGovernor=governor?.subscribe(snapshot=>{
    resourcePolicies.set(viewer,{profile:governor.profile || 'balanced',pressured:!!snapshot.pressured,custom:governor.custom});sync();
  });
  window.addEventListener('gev-tw:layers-changed',sync);
  sync();
  return ()=>{window.removeEventListener('gev-tw:layers-changed',sync);removeGovernor?.();if(previousDepth!==null)viewer.scene.globe.depthTestAgainstTerrain=previousDepth;hosts.delete(viewer);resourcePolicies.delete(viewer);};
}
export async function prepareBuildingSurface(viewer,{signal}={}){
  signal?.throwIfAborted();
  const relief=listLayers().find(layer=>layer.viewer===viewer && layer.kind==='taiwan-relief' && layer.visible);
  if(relief){
    viewer.terrainProvider=relief.terrainProvider;viewer.scene.globe.show=true;
    relief.syncBuildingCoexistence?.();viewer.scene.requestRender();return;
  }
  // Official DTM points do not replace the globe terrain provider. Keep the
  // official building's absolute position; never derive a county-wide offset
  // from its bounding sphere or from a camera-dependent roof height.
  const terrain=await loadWorldTerrain(viewer,{signal});
  signal?.throwIfAborted();
  setLayerVisible(terrain.id,true);
  const maps=hosts.get(viewer);
  if(maps?.getActiveId()==='photoreal'){
    const state=await maps.setStack('nlsc-ortho');
    signal?.throwIfAborted();
    if(state?.activeId!=='nlsc-ortho')throw new Error('NLSC 建物需要地形與正射底圖；底圖切換失敗，請稍後再試');
  }
  viewer.terrainProvider=terrain.terrainProvider;viewer.scene.globe.show=true;
  viewer.scene.verticalExaggeration=1;
  viewer.scene.verticalExaggerationRelativeHeight=0;
  viewer.scene.requestRender();
}
export function configureBuildingTileset(layer){
  const tileset=layer.tileset;
  const originalShader=tileset.customShader;let whiteShader=null;
  layer.setWhiteMode=enabled=>{if(enabled){whiteShader ||= new Cesium.CustomShader({lightingModel:Cesium.LightingModel.PBR,fragmentShaderText:'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.95); material.alpha = 1.0; material.specular = vec3(0.04); material.emissive = vec3(0.0); material.roughness = 1.0; }'});tileset.customShader=whiteShader;}else tileset.customShader=originalShader;layer.dataMetadata={...layer.dataMetadata,whiteModel:!!enabled};layer.viewer.scene.requestRender();};
  layer.setWhiteMode(buildingWhiteMode(layer.viewer));
  let detailMode='detailed';
  tileset.skipLevelOfDetail=false;
  tileset.dynamicScreenSpaceError=false;tileset.foveatedScreenSpaceError=false;
  tileset.cullRequestsWhileMoving=false;tileset.preloadWhenHidden=false;
  tileset.preloadFlightDestinations=true;
  const stats={pending:0,processing:0,loaded:0,resident:0,failed:0,settled:false,lastError:null};
  let notifiedAt=0;const notify=force=>{if(!force && Date.now()-notifiedAt<500)return;notifiedAt=Date.now();window.dispatchEvent(new CustomEvent('gev-tw:building-status',{detail:{id:layer.id}}));};
  const seen=new WeakSet();
  layer.applyResourcePolicy=()=>{
    if(tileset.isDestroyed())return;
    const policy=buildingResourcePolicy(layer.viewer),sse=Math.max(policy.sse,detailMode==='balanced'?8:2);
    // Setting maximumScreenSpaceError resets Cesium's memory-adjusted SSE.
    // Only update changed values, so resource refreshes do not fight its safety.
    if(tileset.maximumScreenSpaceError!==sse)tileset.maximumScreenSpaceError=sse;
    tileset.cacheBytes=Math.round(policy.cacheMB*1024*1024);
    tileset.maximumCacheOverflowBytes=Math.round(policy.overflowMB*1024*1024);
    layer.dataMetadata={...layer.dataMetadata,loadingDetail:detailMode,resourceProfile:policy.profile,resourcePressure:policy.pressured,
      coverageNote:'依官方服務涵蓋及目前視野逐級載入；不代表全縣每棟建物，圖磚數不是建物棟數。'};
    notify();
  };
  layer.setLoadingDetail=value=>{if(!['detailed','balanced'].includes(value))throw new Error('建物細節策略需為詳細或平衡');detailMode=value;layer.applyResourcePolicy();layer.viewer.scene.requestRender();};
  layer.getLoadingDetail=()=>detailMode;
  const listeners=[tileset.loadProgress.addEventListener((pending,processing)=>{stats.pending=pending;stats.processing=processing;stats.settled=false;notify();}),tileset.tileLoad.addEventListener(tile=>{if(tile && !seen.has(tile)){seen.add(tile);stats.loaded++;}stats.resident++;notify();}),tileset.tileFailed.addEventListener(error=>{stats.failed++;stats.lastError=String(error.message||'官方圖磚讀取失敗').slice(0,200);notify(true);}),tileset.allTilesLoaded.addEventListener(()=>{if(!stats.settled){stats.settled=true;notify(true);}})];
  if(tileset.tileUnload)listeners.push(tileset.tileUnload.addEventListener(()=>{stats.resident=Math.max(0,stats.resident-1);notify();}));
  layer.getLoadingStats=()=>{
    const policy=buildingResourcePolicy(layer.viewer),adjusted=tileset.memoryAdjustedScreenSpaceError || tileset.maximumScreenSpaceError;
    return {...stats,detailMode,requestedSse:tileset.maximumScreenSpaceError,effectiveSse:adjusted,memoryLimited:adjusted>tileset.maximumScreenSpaceError*1.05,
      residentBytes:tileset.totalMemoryUsageInBytes || 0,cacheBytes:tileset.cacheBytes,pressured:policy.pressured,
      completeness:'僅目前視野及當前細節／資源限制，不代表官方完整建物清冊'};
  };
  layer.applyResourcePolicy();
  const priorDispose=layer.dispose;layer.dispose=()=>{for(const remove of listeners)remove();if(whiteShader && !whiteShader.isDestroyed())whiteShader.destroy();priorDispose?.();};
  // Stable zero offset in the official ECEF coordinate system. A display-only
  // vertical adjustment remains available for data of different height epochs.
  const original=Cesium.Matrix4.clone(tileset.modelMatrix),center=Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
  layer.setHeightOffset=(value,{automatic=false}={})=>{
    if(!automatic)layer.alignment?.manual();
    const height=Number(value);if(!Number.isFinite(height)||Math.abs(height)>200)throw new Error('高程微調需介於 -200 至 200 公尺');
    const surface=Cesium.Cartesian3.fromRadians(center.longitude,center.latitude,0),raised=Cesium.Cartesian3.fromRadians(center.longitude,center.latitude,height);
    const translation=Cesium.Cartesian3.subtract(raised,surface,new Cesium.Cartesian3());
    tileset.modelMatrix=Cesium.Matrix4.multiply(Cesium.Matrix4.fromTranslation(translation),original,new Cesium.Matrix4());
    layer.dataMetadata={...layer.dataMetadata,displayHeightOffset:height};layer.viewer.scene.requestRender();
  };
  layer.dataMetadata={...layer.dataMetadata,displayHeightOffset:0,coordinatePolicy:'官方 ECEF 原位；高程對齊僅影響展示，保留原始 modelMatrix'};
  layer.alignment=createBuildingAlignment(layer,()=>notify(true));
  listeners.push(tileset.tileVisible.addEventListener(tile=>{void layer.alignment.consider(tile);}));
  const releaseAlignment=layer.dispose;layer.dispose=()=>{layer.alignment.destroy();releaseAlignment();};
}

const whiteModes=new WeakMap();
export function setBuildingWhiteMode(viewer,enabled){
  whiteModes.set(viewer,!!enabled);
  for(const layer of listLayers().filter(layer=>layer.viewer===viewer && layer.kind==='3d-tiles'))layer.setWhiteMode?.(enabled);
  viewer.scene.requestRender();
}
export function buildingWhiteMode(viewer){return whiteModes.get(viewer)===true;}
