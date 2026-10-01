import * as Cesium from 'cesium';
import { browserAi } from './browserAi.js';
import { registerLayer,listLayers,removeLayer } from './layerRegistry.js';
import { scopeBounds,scopeLabel,ensureCounties } from './dataScope.js';
import { decodeFlowTile } from '../layers/traffic/flowDecode.js';
import { tilesForBounds } from '../data/tomtomTiles.js';
import * as turf from '@turf/turf';
import { createTrafficDots } from './trafficDots.js';
export async function loadWorldTerrain(viewer,{signal}={}) {
  signal?.throwIfAborted();
  const existing=listLayers().find(layer=>layer.kind === 'world-terrain');
  if(existing){viewer.terrainProvider=existing.terrainProvider;existing.visible=true;return existing;}
  const runtime=await browserAi('/runtime');let provider,source;
  if(runtime.cesiumIonToken) {const resource=await Cesium.IonResource.fromAssetId(1,{accessToken:runtime.cesiumIonToken});provider=await Cesium.CesiumTerrainProvider.fromUrl(resource,{requestVertexNormals:true});source='Cesium World Terrain / ion asset 1';}
  else {provider=await Cesium.CesiumTerrainProvider.fromUrl('https://terrain.reearth.land/cesium-mesh/ellipsoid');source='Re:Earth / Mapterhorn CC BY 4.0 全球地形';}
  signal?.throwIfAborted();
  viewer.terrainProvider=provider;viewer.scene.requestRender();
  return registerLayer({name:'全球地形',kind:'world-terrain',source,terrainProvider:provider,viewer,sourceKey:'world-terrain',setVisibility:visible=>{viewer.terrainProvider=visible ? provider : new Cesium.EllipsoidTerrainProvider();viewer.scene.requestRender();},dispose:()=>{viewer.terrainProvider=new Cesium.EllipsoidTerrainProvider();}});
}
export async function loadTomtomFlow(viewer,{signal:externalSignal}={}) {
  externalSignal?.throwIfAborted();
  await ensureCounties();const scope=scopeLabel();const scopeBox=scopeBounds();
  externalSignal?.throwIfAborted();
  for(const old of listLayers().filter(layer=>layer.kind === 'tomtom-flow-image'))removeLayer(old.id);
  const primitives=new Cesium.PrimitiveCollection();viewer.scene.groundPrimitives.add(primitives);
  const trafficDots=createTrafficDots(viewer);
  let controller=null,epoch=0,disposed=false,timer=null,moveTimer=null,layer;
  const stats={count:0,dotCount:0,loading:false,lastUpdate:null,error:null,partial:false};
  const credit=new Cesium.Credit('TomTom Traffic Flow · 即時路況',true);
  const removeCredit=viewer.scene.postRender.addEventListener(()=>{if(layer?.visible)viewer.scene.frameState.creditDisplay.addCreditToNextFrame(credit);});
  function notify(){viewer.scene.requestRender();window.dispatchEvent(new CustomEvent('gev-tw:traffic-status',{detail:{...stats}}));}
  async function refresh(){
    if(disposed || (layer && !layer.visible))return;
    controller?.abort();controller=new AbortController();const signal=controller.signal,generation=++epoch;
    stats.loading=true;notify();
    try{
      const rect=viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
      let bounds={...scopeBox};
      if(rect){const view={west:Cesium.Math.toDegrees(rect.west),east:Cesium.Math.toDegrees(rect.east),south:Cesium.Math.toDegrees(rect.south),north:Cesium.Math.toDegrees(rect.north)};
        if(view.east>view.west){bounds={west:Math.max(view.west,scopeBox.west),east:Math.min(view.east,scopeBox.east),south:Math.max(view.south,scopeBox.south),north:Math.min(view.north,scopeBox.north)};}}
      if(bounds.east<=bounds.west || bounds.north<=bounds.south){primitives.removeAll();trafficDots.replace([]);stats.count=0;stats.dotCount=0;stats.error='目前視野不在所選範圍，請移動地圖查看。';return;}
      let zoom=14,tiles;while(zoom>0){tiles=tilesForBounds(bounds,zoom,{maxTiles:17});if(tiles.length<=16)break;zoom--;}
      tiles=tilesForBounds(bounds,zoom,{maxTiles:16});let cursor=0,failures=0;const segments=[];
      await Promise.all(Array.from({length:Math.min(4,tiles.length)},async()=>{while(cursor<tiles.length){signal.throwIfAborted();const {z,x,y}=tiles[cursor++];try{
        const res=await fetch(`/api/taiwan/ai/traffic-vector/${z}/${x}/${y}.pbf`,{signal});
        if(!res.ok){const error=await res.json().catch(()=>({}));throw new Error(error.error || `TomTom HTTP ${res.status}`);}
        segments.push(...decodeFlowTile(await res.arrayBuffer(),z,x,y));
      }catch(error){if(signal.aborted)throw error;failures++;stats.error=error.message;}}}));
      signal.throwIfAborted();if(generation!==epoch || disposed)return;
      if(failures===tiles.length)throw new Error(stats.error || 'TomTom 無法取得路況');
      const unique=new Map();for(const segment of segments){
        const feature=turf.lineString(segment.coords);
        if(!turf.booleanIntersects(feature,turf.bboxPolygon([bounds.west,bounds.south,bounds.east,bounds.north])))continue;
        const clipped=turf.bboxClip(feature,[bounds.west,bounds.south,bounds.east,bounds.north]);
        const lines=clipped.geometry.type==='LineString' ? [clipped.geometry.coordinates] : clipped.geometry.coordinates;
        for(const coords of lines)if(coords.length>=2){const forward=JSON.stringify(coords),reverse=JSON.stringify([...coords].reverse()),key=forward<reverse ? forward : reverse,previous=unique.get(key);if(!previous || Number(segment.closure)>Number(previous.closure) || (segment.closure===previous.closure && segment.trafficLevel<previous.trafficLevel))unique.set(key,{...segment,coords});}
      }
      const kept=[...unique.values()].sort((a,b)=>Number(b.closure)-Number(a.closure)||a.trafficLevel-b.trafficLevel).slice(0,6000);
      const instances=kept.map(segment=>new Cesium.GeometryInstance({geometry:new Cesium.GroundPolylineGeometry({positions:Cesium.Cartesian3.fromDegreesArray(segment.coords.flat()),width:segment.closure ? 2 : 1.3}),attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(segment.closure ? '#9c5cff' : segment.trafficLevel<.4 ? '#ff3b45' : segment.trafficLevel<.75 ? '#ffbf35' : '#35e586'))}}));
      primitives.removeAll();if(instances.length)primitives.add(new Cesium.GroundPolylinePrimitive({geometryInstances:instances,classificationType:Cesium.ClassificationType.BOTH,appearance:new Cesium.PolylineColorAppearance(),allowPicking:false}));
      stats.dotCount=trafficDots.replace(kept);stats.count=kept.length;stats.partial=failures>0 || unique.size>kept.length;stats.lastUpdate=Date.now();stats.error=failures ? '部分路況圖磚未取得，畫面僅顯示成功載入的路段。' : kept.length ? null : 'TomTom 目前未回傳此視野的路況；請放大到道路查看。';
    }catch(error){if(signal.aborted)return;stats.error=error.message;if(!layer)throw error;}
    finally{if(generation===epoch){stats.loading=false;notify();}}
  }
  const removeMove=viewer.camera.moveEnd.addEventListener(()=>{clearTimeout(moveTimer);if(layer?.visible)moveTimer=setTimeout(()=>void refresh(),600);});
  const dispose=()=>{disposed=true;epoch++;controller?.abort();clearInterval(timer);clearTimeout(moveTimer);removeMove();removeCredit();trafficDots.dispose();viewer.scene.groundPrimitives.remove(primitives);};
  const abort=()=>{controller?.abort();};externalSignal?.addEventListener('abort',abort,{once:true});
  try{await refresh();externalSignal?.throwIfAborted();}catch(error){dispose();throw error;}finally{externalSignal?.removeEventListener('abort',abort);}
  layer=registerLayer({name:`TomTom 即時交通｜${scope}`,kind:'tomtom-flow-image',source:'TomTom Traffic Flow 向量路況（不是個別車輛位置）',sourceKey:'tomtom-flow-image',viewer,scopeManaged:true,getStats:()=>({...stats}),setVisibility:visible=>{primitives.show=visible;trafficDots.setVisibility(visible);if(!visible){epoch++;controller?.abort();clearTimeout(moveTimer);stats.loading=false;}else void refresh();notify();},dispose});
  timer=setInterval(()=>void refresh(),120000);
  return layer;
}
