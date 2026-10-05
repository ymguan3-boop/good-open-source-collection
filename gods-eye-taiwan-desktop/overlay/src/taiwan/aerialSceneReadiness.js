import * as C from 'cesium';

/** Bounded cache / camera warmup. Does not hide layers or assert full source coverage. */
export function createAerialSceneReadiness({viewer,tilesets=()=>[],governor,onStatus=()=>{}}){
  let lease=null;
  function acquire(){if(lease)return;lease=tilesets().map(t=>{const values={};for(const key of ['preloadFlightDestinations','loadSiblings','foveatedTimeDelay','cullRequestsWhileMoving','cacheBytes','maximumCacheOverflowBytes'])values[key]=t[key];t.preloadFlightDestinations=true;if(t.skipLevelOfDetail)t.loadSiblings=true;t.foveatedTimeDelay=0;t.cullRequestsWhileMoving=false;t.cacheBytes=Math.max(t.cacheBytes||0,governor?.pressured?67108864:134217728);t.maximumCacheOverflowBytes=Math.min(t.maximumCacheOverflowBytes||67108864,134217728);const applied={};for(const key of Object.keys(values))applied[key]=t[key];return {t,values,applied};});}
  function release(){for(const {t,values,applied}of lease||[])if(!t.isDestroyed?.())for(const key of Object.keys(values))if(t[key]===applied[key])t[key]=values[key];lease=null;}
  async function wait(signal){const until=performance.now()+8000;let stable=0;while(performance.now()<until){signal?.throwIfAborted();viewer.scene.requestRender();await new Promise(resolve=>setTimeout(resolve,120));const ready=tilesets().every(t=>t.tilesLoaded===true)&&viewer.scene.globe?.tilesLoaded!==false;stable=ready?stable+1:0;if(stable>=3)return true;}return false;}
  async function prepare(points,{signal}={}){acquire();if(!points?.length)return {ready:await wait(signal),views:0};const camera=viewer.camera,position=C.Cartesian3.clone(camera.positionWC),orientation={heading:camera.heading,pitch:camera.pitch,roll:camera.roll},controls=viewer.scene.screenSpaceCameraController,inputs=controls.enableInputs;controls.enableInputs=false;camera.cancelFlight();let ready=true,views=0;
    try{const count=Math.min(5,points.length);for(let i=0;i<count;i++){signal?.throwIfAborted();const point=points[Math.round(i*(points.length-1)/Math.max(1,count-1))],target=Array.isArray(point)?new C.Cartesian3(...point):point;camera.lookAt(target,new C.HeadingPitchRange(0,-.65,Math.max(100,Number(governor?.pressured?160:220))));camera.lookAtTransform(C.Matrix4.IDENTITY);onStatus(`預載拍攝範圍 ${i+1}/${count}；完成後仍需幾何檢查`);ready=(await wait(signal))&&ready;views++;}return {ready,views};}
    finally{camera.lookAtTransform(C.Matrix4.IDENTITY);camera.setView({destination:position,orientation});controls.enableInputs=inputs;viewer.scene.requestRender();}
  }
  return {prepare,acquire,release,destroy:release};
}
