import {VERSION} from 'cesium';
const locks=new WeakMap();
/** Pinned 1.138 adapter: Picking's offscreen orthographic camera retains far.
 * No upstream mutation. One scene lease bounds preload AND final pick; only
 * requests created inside this lease are removed on failure. Shape/version drift
 * fails closed. Other callers' pending queries are never altered. */
export async function withAerialPickRange(scene,far,run){
  if(VERSION!=='1.138.0'||!Number.isFinite(far)||far<1)throw new Error('此 Cesium 版本尚未驗證有限距離障礙查詢');
  const prior=locks.get(scene)||Promise.resolve();let unlock;const lock=new Promise(resolve=>unlock=resolve);locks.set(scene,prior.catch(()=>{}).then(()=>lock));await prior.catch(()=>{});
  const picking=scene._picking,frustum=picking?._pickOffscreenView?.camera?.frustum,queries=picking?._mostDetailedRayPicks;
  try{if(!frustum||!Array.isArray(queries)||!Number.isFinite(frustum.far)||!Number.isFinite(frustum.near)||frustum.width===undefined)throw new Error('有限距離障礙查詢介面不可用');if(queries.length)throw new Error('另一筆場景高度查詢尚在執行，請稍候再規劃');
    const original=frustum.far;frustum.far=Math.max(frustum.near+1,far);
    let owned=[];try{const result=run();owned=queries.slice();return await result;}catch(error){for(const query of owned){const index=queries.indexOf(query);if(index>=0)queries.splice(index,1);query._completePick?.();}await Promise.resolve();await Promise.resolve();throw error;}
    finally{frustum.far=original;scene.requestRender();}
  }finally{unlock();}
}
export function withAerialPickRangeSync(scene,far,run){const frustum=scene._picking?._pickOffscreenView?.camera?.frustum;if(VERSION!=='1.138.0'||!frustum||!Number.isFinite(frustum.far))throw new Error('有限距離即時障礙查詢介面不可用');const original=frustum.far;try{frustum.far=Math.max(frustum.near+1,far);return run();}finally{frustum.far=original;}}
