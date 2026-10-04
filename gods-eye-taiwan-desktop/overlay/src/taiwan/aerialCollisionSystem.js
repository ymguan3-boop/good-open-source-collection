import * as Cesium from 'cesium';
import { listLayers } from './layerRegistry.js';

export const AERIAL_SAFETY = Object.freeze({ radius:1, margin:3, maximumMargin:18, spacing:2, maximumSamples:16000, queryBatch:96, timeout:45000, certificateAge:12000 });
const finite = Number.isFinite;
const distance = Cesium.Cartesian3.distance;
const point = p => p instanceof Cesium.Cartesian3 ? p : new Cesium.Cartesian3(...p);
const timeout = (promise, milliseconds) => {
  let timer; return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('障礙資料準備逾時')),milliseconds);})]).finally(()=>clearTimeout(timer));
};

/** Conservative volume checks against the CURRENT scene. Never changes terrain or layer visibility.
 * Cesium's pinned pickFromRay API is private: callers receive UNKNOWN if the API is unavailable.
 * A resolved empty geometry ray is treated as empty only when its most-detailed request succeeds
 * and no source reports a tile failure. This is a visual geometry check, not a survey guarantee.
 */
export function createAerialCollisionSystem({viewer,excluded=()=>[],sources=()=>listLayers(),onStatus=()=>{}}){
  let revision=0,destroyed=false,terrain=viewer.terrainProvider;const watches=new Map(),indexes=new WeakMap();
  function tilesets(){const result=new Set(sources().filter(l=>l.visible!==false&&l.tileset&&l.tileset.show!==false).map(l=>l.tileset));
    const scan=collection=>{for(let i=0;i<(collection?.length||0);i++){const p=collection.get(i);if(p?.show===false)continue;if(p?.root&&p?.tileFailed)result.add(p);else if(p?.get&&p?.length)scan(p);}};scan(viewer.scene.primitives);return [...result];}
  function signature(){if(terrain!==viewer.terrainProvider){terrain=viewer.terrainProvider;revision++;}const active=tilesets();for(const t of active){if(!watches.has(t)){const w={id:watches.size+1,failed:0,matrix:String(t.modelMatrix)};w.release=t.tileFailed?.addEventListener(()=>{w.failed++;revision++;});watches.set(t,w);}const w=watches.get(t),matrix=String(t.modelMatrix);if(w.matrix!==matrix){w.matrix=matrix;revision++;}}
    return `${revision}:${active.map(t=>`${watches.get(t).id}.${watches.get(t).failed}`).join(',')}:${viewer.scene.verticalExaggeration??1}:${viewer.scene.verticalExaggerationRelativeHeight??0}`;}
  const invalidate=()=>{revision++;};window.addEventListener('gev-tw:layers-changed',invalidate);window.addEventListener('gev-tw:building-geometry-changed',invalidate);
  function margin({speed=0,dt=1/30,margin:A=AERIAL_SAFETY.margin}={}){return AERIAL_SAFETY.radius+Math.min(AERIAL_SAFETY.maximumMargin,Math.max(1,A)+Math.abs(speed)*Math.max(.08,dt)*.35);}
  function dense(points,spacing=AERIAL_SAFETY.spacing){const output=[];for(let i=0;i<points.length;i++){const p=point(points[i]);if(!i){output.push(p);continue;}const previous=point(points[i-1]),length=distance(previous,p);if(length<.001)continue;const count=Math.max(1,Math.ceil(length/spacing));if(output.length+count>AERIAL_SAFETY.maximumSamples)throw new Error('路徑太長，請分段拍攝（安全檢查不可省略）');for(let j=1;j<=count;j++)output.push(Cesium.Cartesian3.lerp(previous,p,j/count,new Cesium.Cartesian3()));}return output;}
  function unknown(reason){return {status:'UNKNOWN',safe:false,reason,revision:signature()};}
  function objects(){return excluded().filter(Boolean);}
  function rays(a,b,radius){const vector=Cesium.Cartesian3.subtract(b,a,new Cesium.Cartesian3()),length=Cesium.Cartesian3.magnitude(vector);if(length<.001)return [];
    const direction=Cesium.Cartesian3.normalize(vector,new Cesium.Cartesian3()),up=Cesium.Cartesian3.normalize(a,new Cesium.Cartesian3());let side=Cesium.Cartesian3.cross(direction,up,new Cesium.Cartesian3());if(Cesium.Cartesian3.magnitude(side)<.01)side=Cesium.Cartesian3.cross(direction,Cesium.Cartesian3.UNIT_X,side);Cesium.Cartesian3.normalize(side,side);const vertical=Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(side,direction,new Cesium.Cartesian3()),new Cesium.Cartesian3());
    // The centre trace uses a 2*radius wide intersection volume (a conservative
    // swept prism enclosing the sphere). Offset traces are available for narrow-ray backends.
    const offsets=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]];
    return offsets.map(([x,y])=>{const origin=Cesium.Cartesian3.clone(a);Cesium.Cartesian3.add(origin,Cesium.Cartesian3.multiplyByScalar(side,x*radius,new Cesium.Cartesian3()),origin);Cesium.Cartesian3.add(origin,Cesium.Cartesian3.multiplyByScalar(vertical,y*radius,new Cesium.Cartesian3()),origin);return {ray:new Cesium.Ray(origin,direction),length};});
  }
  function hit(trace,result,radius){if(!result?.position)return null;const d=distance(trace.ray.origin,result.position);return d<=trace.length+radius?{status:'UNSAFE',safe:false,reason:'前方建物／模型障礙',position:result.position,distance:d}:null;}
  function registeredVolumes(a,b,radius){const ab=Cesium.Cartesian3.subtract(b,a,new Cesium.Cartesian3()),lengthSquared=Cesium.Cartesian3.magnitudeSquared(ab);for(const layer of sources()){if(layer.visible===false||layer.tileset||layer.collisionEnabled!==true)continue;const sphere=typeof layer.collisionSphere==='function'?layer.collisionSphere():layer.collisionSphere||layer.model?.boundingSphere||layer.primitive?.boundingSphere;if(!sphere?.center||!finite(sphere.radius))return unknown(`模型障礙尚未準備好：${layer.name||layer.id}`);const t=lengthSquared?Math.max(0,Math.min(1,Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(sphere.center,a,new Cesium.Cartesian3()),ab)/lengthSquared)):0;const closest=Cesium.Cartesian3.lerp(a,b,t,new Cesium.Cartesian3());if(distance(closest,sphere.center)<sphere.radius+radius)return {status:'UNSAFE',safe:false,reason:`已載入模型障礙：${layer.name||layer.id}`};}return null;}
  async function surface(points,radius){if(destroyed)throw new Error('碰撞系統已關閉');const start=signature(),active=tilesets(),failure=active.map(t=>watches.get(t).failed),cartographics=points.map(p=>Cesium.Cartographic.fromCartesian(p));
    if(active.length&&(!viewer.scene.sampleHeightSupported||!viewer.scene.sampleHeightMostDetailed||!viewer.scene.pickFromRayMostDetailed))return unknown('目前裝置無法可靠查詢 3D 建物障礙');
    if(active.some(t=>t.isDestroyed?.()||!t.root))return unknown('3D 建物資料尚未準備好');
    if(sources().some(l=>l.visible!==false&&l.tileset?.show!==false&&l.getLoadingStats?.().failed>0))return unknown('目前建物來源有圖磚載入失敗，請重新載入來源再檢查');
    const offsets=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]],terrainPoints=[];
    for(const p of points){const frame=Cesium.Transforms.eastNorthUpToFixedFrame(p);for(const [x,y] of offsets){const q=Cesium.Matrix4.multiplyByPoint(frame,new Cesium.Cartesian3(x*radius,y*radius,0),new Cesium.Cartesian3());terrainPoints.push(Cesium.Cartographic.fromCartesian(q));}}
    const scenePoints=cartographics.map(p=>Cesium.Cartographic.clone(p));
    try{if(viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider){terrainPoints.forEach(p=>{p.height=0;});}else{if(!viewer.terrainProvider?.availability)return unknown('目前地形沒有最高細節可用性資料，無法確認障礙');await timeout(Cesium.sampleTerrainMostDetailed(viewer.terrainProvider,terrainPoints),AERIAL_SAFETY.timeout);}
      if(active.length)await timeout(viewer.scene.sampleHeightMostDetailed(scenePoints,objects(),radius*2),AERIAL_SAFETY.timeout);else scenePoints.forEach(p=>{p.height=undefined;});
      if(signature()!==start||active.some((t,i)=>watches.get(t).failed!==failure[i]))return unknown('障礙來源已更新或圖磚載入失敗，請重新檢查');
      if(terrainPoints.some(p=>!finite(p?.height)))return unknown('部分地形高度尚未取得');
      const exaggeration=viewer.scene.verticalExaggeration??1,relative=viewer.scene.verticalExaggerationRelativeHeight??0;
      const heights=cartographics.map((_,i)=>Math.max(...terrainPoints.slice(i*offsets.length,(i+1)*offsets.length).map(p=>(p.height-relative)*exaggeration+relative),finite(scenePoints[i]?.height)?scenePoints[i].height:-Infinity));
      // Undefined scene height can mean a street gap OR a sampling error. A successful
      // most-detailed downward ray with no tile error confirms an empty scene column.
      if(active.length){for(let i=0;i<scenePoints.length;i++){if(finite(scenePoints[i]?.height))continue;const c=cartographics[i],origin=Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,Math.max(c.height+500,heights[i]+1000)),direction=Cesium.Cartesian3.negate(Cesium.Cartesian3.normalize(origin,new Cesium.Cartesian3()),new Cesium.Cartesian3());const picked=await timeout(viewer.scene.pickFromRayMostDetailed(new Cesium.Ray(origin,direction),objects(),radius*2),AERIAL_SAFETY.timeout);if(picked?.position){const h=Cesium.Cartographic.fromCartesian(picked.position).height;if(!finite(h))return unknown('3D 表面高度未知');heights[i]=Math.max(heights[i],h);}}
      }
      if(signature()!==start)return unknown('障礙資料已變更');return {status:'READY',heights,signature:start,cartographics};
    }catch(error){return unknown(`正在準備障礙資料：${error.message}`);}
  }
  async function validate(points,{radius=margin(),signal,onProgress=()=>{}}={}){let sampled;try{sampled=dense(points,Math.min(2,radius*.5));}catch(error){return unknown(error.message);}if(!sampled.length)return unknown('沒有可檢查的路徑');const unsafe=[],start=signature();onStatus('正在準備地形與建物障礙資料…');
    for(let offset=0;offset<sampled.length;offset+=AERIAL_SAFETY.queryBatch){if(signal?.aborted||destroyed)return unknown('檢查已取消');const chunk=sampled.slice(offset,offset+AERIAL_SAFETY.queryBatch),query=await surface(chunk,radius);if(query.status!=='READY')return query;
      for(let j=0;j<chunk.length;j++){const c=query.cartographics[j];if(c.height<query.heights[j]+radius)unsafe.push({index:offset+j,point:chunk[j],requiredHeight:query.heights[j]+radius+1,reason:'地形／建物表面侵入安全體積'});const volume=registeredVolumes(chunk[j],chunk[j],radius);if(volume?.status==='UNKNOWN')return volume;if(volume)unsafe.push({index:offset+j,point:chunk[j],reason:volume.reason});}onProgress(Math.min(1,(offset+chunk.length)/sampled.length));
    }
    // Continuous wide rays catch walls/corners BETWEEN dense samples, independent of height.
    const active=tilesets();for(let i=1;i<sampled.length;i++){if(signal?.aborted)return unknown('檢查已取消');const volume=registeredVolumes(sampled[i-1],sampled[i],radius);if(volume)unsafe.push({index:i,point:sampled[i],reason:volume.reason});if(active.length){try{const trace=rays(sampled[i-1],sampled[i],radius)[0],result=await timeout(viewer.scene.pickFromRayMostDetailed(trace.ray,objects(),radius*2),AERIAL_SAFETY.timeout),collision=hit(trace,result,radius);if(collision)unsafe.push({index:i,point:sampled[i],reason:collision.reason});}catch(error){return unknown(`連續障礙查詢失敗：${error.message}`);}}}
    if(signature()!==start)return unknown('檢查期間障礙來源已更新');return {status:unsafe.length?'UNSAFE':'PASS',safe:!unsafe.length,unsafe,points:sampled,radius,signature:start,time:Date.now(),checkedSamples:sampled.length,checkedTerrain:true,checked3D:active.length>0,limitations:'依目前載入來源及 Cesium 可查詢幾何保守檢查，不保證未提供或缺漏的障礙'};
  }
  function certificateContains(certificate,a,b,radius){if(!certificate?.safe||certificate.signature!==signature()||Date.now()-certificate.time>AERIAL_SAFETY.certificateAge||radius>certificate.radius)return false;const slack=certificate.radius-radius;if(slack<.01)return false;
    let index=indexes.get(certificate);if(!index){const cell=Math.max(1,certificate.radius),cells=new Map();for(const p of certificate.points){const key=[p.x,p.y,p.z].map(v=>Math.floor(v/cell)).join(',');if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}index={cell,cells};indexes.set(certificate,index);}
    function near(p){const cell=[p.x,p.y,p.z].map(v=>Math.floor(v/index.cell));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(index.cells.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))?.some(q=>distance(p,q)<=slack))return true;return false;}
    const count=Math.max(1,Math.ceil(distance(a,b)/1));for(let i=0;i<=count;i++){const p=Cesium.Cartesian3.lerp(a,b,i/count,new Cesium.Cartesian3());if(!near(p))return false;}return true;}
  function checkSweep(a,b,{radius=margin(),certificate}={}){a=point(a);b=point(b);if(!certificateContains(certificate,a,b,radius))return unknown('前方障礙資料尚未完成檢查，已懸停');const volume=registeredVolumes(a,b,radius);if(volume)return volume;
    const active=tilesets();if(active.length&&!viewer.scene.pickFromRay)return unknown('裝置無法即時檢查建物');try{const trace=rays(a,b,radius)[0];if(trace&&viewer.scene.pickFromRay){const collision=hit(trace,viewer.scene.pickFromRay(trace.ray,objects(),radius*2),radius);if(collision)return collision;}const samples=dense([a,b],1);for(const p of samples){const c=Cesium.Cartographic.fromCartesian(p),height=viewer.scene.sampleHeightSupported?viewer.scene.sampleHeight(c,objects(),radius*2):undefined,rawGround=viewer.scene.globe?.getHeight(c),relative=viewer.scene.verticalExaggerationRelativeHeight??0,ground=finite(rawGround)?(rawGround-relative)*(viewer.scene.verticalExaggeration??1)+relative:undefined;if((finite(height)&&c.height<height+radius)||(finite(ground)&&c.height<ground+radius))return {status:'UNSAFE',safe:false,reason:'接近地形／建物表面，已阻擋'};}
      return {status:'PASS',safe:true};}catch(error){return unknown(`即時碰撞查詢失敗：${error.message}`);}}
  return {margin,dense,surface,validate,checkSweep,signature,invalidate,destroy(){destroyed=true;window.removeEventListener('gev-tw:layers-changed',invalidate);window.removeEventListener('gev-tw:building-geometry-changed',invalidate);for(const w of watches.values())w.release?.();watches.clear();},get revision(){return signature();}};
}
