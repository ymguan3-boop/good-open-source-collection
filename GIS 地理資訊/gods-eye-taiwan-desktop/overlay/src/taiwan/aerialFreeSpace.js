import * as C from 'cesium';

/** A bounded union of checked swept corridors, never a claim that a whole cube is clear. */
export function createAerialFreeSpace({collision,maximumCertificates=20}={}){
  let certificates=[],epoch=0;
  function prune(){const signature=collision.signature();certificates=certificates.filter(c=>c.signature===signature);}
  function remember(result,token,signal){if(token!==epoch||signal?.aborted)return {status:'UNKNOWN',safe:false,reason:'檢查已取消'};prune();if(result.safe){if(result.signature!==collision.signature())return {status:'UNKNOWN',safe:false,reason:'障礙來源已更新，請重新檢查'};certificates.push({...result,freeSpaceSnapshot:true});if(certificates.length>maximumCertificates)certificates.splice(0,certificates.length-maximumCertificates);}return result;}
  function contains(a,b,radius){prune();return collision.certificateContains(certificates,a,b,radius);}
  function pointsAround(origin,{speed=12,heading=0}={}){
    const extent=Math.min(30,Math.max(12,Number(speed)*2)),frame=C.Transforms.eastNorthUpToFixedFrame(origin),points=[C.Cartesian3.clone(origin)];
    for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      points.push(C.Matrix4.multiplyByPoint(frame,new C.Cartesian3((direction[0]*Math.cos(heading)+direction[1]*Math.sin(heading))*extent,(-direction[0]*Math.sin(heading)+direction[1]*Math.cos(heading))*extent,direction[2]*extent),new C.Cartesian3()),C.Cartesian3.clone(origin));
    }
    return points;
  }
  async function preflight(origin,options={}){certificates=[];const token=++epoch;return remember(await collision.validate(pointsAround(origin,options),options),token,options.signal);}
  async function prepare(points,options={}){const token=epoch;return remember(await collision.validate(points,options),token,options.signal);}
  function distanceAhead(origin,direction,radius,maximum){
    const destination=distance=>C.Cartesian3.add(origin,C.Cartesian3.multiplyByScalar(direction,distance,new C.Cartesian3()),new C.Cartesian3());
    if(!contains(origin,origin,radius))return 0;
    let low=0,high=maximum;
    if(contains(origin,destination(maximum),radius))return maximum;
    for(let i=0;i<6;i++){const mid=(low+high)/2;if(contains(origin,destination(mid),radius))low=mid;else high=mid;}
    return low;
  }
  return {preflight,prepare,contains,distanceAhead,pointsAround,clear(){certificates=[];epoch++;},get certificates(){prune();return certificates.slice();},get size(){prune();return certificates.length;}};
}
