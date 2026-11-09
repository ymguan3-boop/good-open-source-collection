import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
export async function sampleGlobalTerrain(viewer,feature,{signal,provider=viewer.terrainProvider}={}){
  signal?.throwIfAborted();if(provider instanceof Cesium.EllipsoidTerrainProvider)throw new Error('全球地形尚未載入；橢球底面沒有真實高程');
  const points=[];let spacing;
  if(feature.geometry.type==='LineString'){
    const length=turf.length(feature,{units:'meters'});spacing=Math.max(30,length/255);
    for(let distance=0;distance<=length;distance+=spacing)points.push(turf.along(feature,distance,{units:'meters'}).geometry.coordinates);
    points.push(feature.geometry.coordinates.at(-1));
  }else{
    const bbox=turf.bbox(feature),width=turf.distance([bbox[0],bbox[1]],[bbox[2],bbox[1]],{units:'meters'}),height=turf.distance([bbox[0],bbox[1]],[bbox[0],bbox[3]],{units:'meters'});
    spacing=Math.max(30,Math.sqrt(width*height/225));
    for(const p of turf.pointGrid(bbox,spacing,{units:'meters',mask:feature}).features)points.push(p.geometry.coordinates);
    if(!points.length)points.push(turf.pointOnFeature(feature).geometry.coordinates);
  }
  const positions=points.slice(0,256).map(p=>Cesium.Cartographic.fromDegrees(...p));
  let timer,abort;const request=provider.availability?Cesium.sampleTerrainMostDetailed(provider,positions):Cesium.sampleTerrain(provider,12,positions);
  const cancelled=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('全球地形取樣超過30秒，請稍後重試')),30000);abort=()=>reject(signal.reason||new DOMException('取樣已停止','AbortError'));signal?.addEventListener('abort',abort,{once:true});});
  let samples;try{samples=await Promise.race([request,cancelled]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  signal?.throwIfAborted();const heights=samples.map(p=>p.height).filter(Number.isFinite);
  if(!heights.length)throw new Error('全球地形服務未回傳這個範圍的高程');
  return {terrainSamples:heights.length,dtmSamples:0,minHeightMeters:Math.min(...heights),maxHeightMeters:Math.max(...heights),meanHeightMeters:heights.reduce((sum,h)=>sum+h,0)/heights.length,sampledSpacingMeters:spacing,heightSource:'已手動確認的全球地形服務',heightSourceRole:'global-terrain',dtmWarning:'全球地形的取樣估計；不是官方20m DTM原始格網，也不是工程測量'};
}
