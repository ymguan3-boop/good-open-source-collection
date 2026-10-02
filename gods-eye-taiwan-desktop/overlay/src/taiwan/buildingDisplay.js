import * as Cesium from 'cesium';
import { listLayers,setLayerVisible } from './layerRegistry.js';
import { loadWorldTerrain } from './serviceLayers.js';
const hosts=new WeakMap();
export function configureBuildingDisplay(viewer,mapStackController){
  hosts.set(viewer,mapStackController);let previousDepth=null;
  const sync=()=>{
    const active=listLayers().some(layer=>layer.kind==='3d-tiles' && layer.viewer===viewer && layer.tileset && layer.visible);
    if(active){if(previousDepth===null)previousDepth=viewer.scene.globe.depthTestAgainstTerrain;viewer.scene.globe.depthTestAgainstTerrain=false;}
    else if(previousDepth!==null){viewer.scene.globe.depthTestAgainstTerrain=previousDepth;previousDepth=null;}
    viewer.scene.requestRender();
  };
  window.addEventListener('gev-tw:layers-changed',sync);
  return ()=>{window.removeEventListener('gev-tw:layers-changed',sync);if(previousDepth!==null)viewer.scene.globe.depthTestAgainstTerrain=previousDepth;hosts.delete(viewer);};
}
export async function prepareBuildingSurface(viewer,{signal}={}){
  signal?.throwIfAborted();
  for(const relief of listLayers().filter(layer=>layer.kind==='taiwan-relief' && layer.visible))setLayerVisible(relief.id,false);
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
  viewer.scene.requestRender();
}
export function configureBuildingTileset(layer){
  const tileset=layer.tileset;
  tileset.maximumScreenSpaceError=8;tileset.skipLevelOfDetail=false;
  tileset.dynamicScreenSpaceError=false;tileset.foveatedScreenSpaceError=false;
  tileset.cullRequestsWhileMoving=false;tileset.preloadWhenHidden=false;
  const stats={pending:0,processing:0,loaded:0,failed:0,settled:false,lastError:null};
  let notifiedAt=0;const notify=force=>{if(!force && Date.now()-notifiedAt<500)return;notifiedAt=Date.now();window.dispatchEvent(new CustomEvent('gev-tw:building-status',{detail:{id:layer.id}}));};
  const listeners=[tileset.loadProgress.addEventListener((pending,processing)=>{stats.pending=pending;stats.processing=processing;stats.settled=false;notify();}),tileset.tileLoad.addEventListener(()=>{stats.loaded++;notify();}),tileset.tileFailed.addEventListener(error=>{stats.failed++;stats.lastError=String(error.message||'官方圖磚讀取失敗').slice(0,200);notify(true);}),tileset.allTilesLoaded.addEventListener(()=>{stats.settled=true;notify(true);})];
  layer.getLoadingStats=()=>({...stats});
  const priorDispose=layer.dispose;layer.dispose=()=>{for(const remove of listeners)remove();priorDispose?.();};
  // Stable zero offset in the official ECEF coordinate system. A display-only
  // vertical adjustment remains available for data of different height epochs.
  const original=Cesium.Matrix4.clone(tileset.modelMatrix),center=Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
  layer.setHeightOffset=value=>{
    const height=Number(value);if(!Number.isFinite(height)||Math.abs(height)>200)throw new Error('高程微調需介於 -200 至 200 公尺');
    const surface=Cesium.Cartesian3.fromRadians(center.longitude,center.latitude,0),raised=Cesium.Cartesian3.fromRadians(center.longitude,center.latitude,height);
    const translation=Cesium.Cartesian3.subtract(raised,surface,new Cesium.Cartesian3());
    tileset.modelMatrix=Cesium.Matrix4.multiply(Cesium.Matrix4.fromTranslation(translation),original,new Cesium.Matrix4());
    layer.dataMetadata={...layer.dataMetadata,displayHeightOffset:height};layer.viewer.scene.requestRender();
  };
  layer.dataMetadata={...layer.dataMetadata,displayHeightOffset:0,coordinatePolicy:'官方 ECEF 原位；高程微調僅影響展示'};
}
