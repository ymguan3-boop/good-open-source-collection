import * as Cesium from 'cesium';
import {registerLayer,listLayers,setLayerVisible,removeLayer} from './layerRegistry.js';

// Named OSM features only: bounded queries, one request at a time, and a short
// session cache. No Google/CARTO tile service or API key is used.
export function osmLabelQuery(b){
  const box=[b.south,b.west,b.north,b.east].map(v=>v.toFixed(4)).join(',');
  return `[out:json][timeout:25][maxsize:16777216];(way[highway][name](${box});nwr[building][name](${box});nwr[amenity][name](${box});nwr[tourism][name](${box});nwr[shop][name](${box});node[place][name](${box}););out tags center 1800;`;
}
export function osmLabelFeatures(payload){
  const seen=new Set();return (payload.elements||[]).map(el=>{
    const tags=el.tags||{},name=tags['name:zh-Hant']||tags['name:zh']||tags.name;
    const lon=el.lon??el.center?.lon,lat=el.lat??el.center?.lat;
    if(!name || !Number.isFinite(lon) || !Number.isFinite(lat))return null;
    const kind=tags.highway?'road':tags.place?'place':tags.building?'building':'poi';
    const key=`${name}:${lon.toFixed(4)}:${lat.toFixed(4)}`;
    if(seen.has(key))return null;seen.add(key);
    return {id:`${el.type}/${el.id}`,name:String(name).slice(0,80),lon,lat,kind};
  }).filter(Boolean).sort((a,b)=>Number(a.kind==='road')-Number(b.kind==='road')).slice(0,800);
}
export async function loadOsmLabels(viewer,{signal,onStatus=()=>{}}={}){
  const existing=listLayers().find(l=>l.sourceKey==='osm-labels');if(existing){setLayerVisible(existing.id,true);return existing;}
  const collection=viewer.scene.primitives.add(new Cesium.LabelCollection());
  const cache=new Map();let layer,controller,timer,revision=0,visible=true,disposed=false,lastProject=0,creditAdded=false;
  const credit=new Cesium.Credit('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · 道路／建物／景點名稱',true);
  const status=text=>{layer.status=text;onStatus(text);};
  function bounds(){
    if(viewer.camera.positionCartographic.height>80000)return null;
    const rect=viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);if(!rect || rect.east<rect.west)return null;
    const ray=viewer.camera.getPickRay(new Cesium.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2));
    const p=ray && viewer.scene.globe.pick(ray,viewer.scene),c=p?Cesium.Cartographic.fromCartesian(p):Cesium.Rectangle.center(rect);
    const lon=Cesium.Math.toDegrees(c.longitude),lat=Cesium.Math.toDegrees(c.latitude);
    const dx=Math.min(.06,Math.max(.003,Cesium.Math.toDegrees(rect.east-rect.west)/2));
    const dy=Math.min(.045,Math.max(.003,Cesium.Math.toDegrees(rect.north-rect.south)/2));
    return {west:Math.max(-180,lon-dx),east:Math.min(180,lon+dx),south:Math.max(-85,lat-dy),north:Math.min(85,lat+dy)};
  }
  function project(){
    if(!visible || disposed || Date.now()-lastProject<250)return;lastProject=Date.now();
    const occupied=new Set(),width=viewer.canvas.clientWidth,height=viewer.canvas.clientHeight;let changed=false;
    for(let i=0;i<collection.length;i++){
      const label=collection.get(i),pixel=Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene,label.position);
      const normal=Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(label.position),toward=Cesium.Cartesian3.subtract(viewer.camera.positionWC,label.position,new Cesium.Cartesian3());
      const cell=pixel && `${Math.floor(pixel.x/110)}:${Math.floor(pixel.y/28)}`;
      const show=!!pixel && pixel.x>=0 && pixel.x<=width && pixel.y>=0 && pixel.y<=height && Cesium.Cartesian3.dot(normal,toward)>0 && !occupied.has(cell);
      if(show)occupied.add(cell);if(label.show!==show){label.show=show;changed=true;}
    }
    if(changed)viewer.scene.requestRender();
  }
  function render(features){
    collection.removeAll();
    for(const f of features){const c=Cesium.Cartographic.fromDegrees(f.lon,f.lat),height=viewer.scene.globe.getHeight(c)||0;
      collection.add({id:f.id,text:f.name,position:Cesium.Cartesian3.fromDegrees(f.lon,f.lat,height+2),font:`${f.kind==='road'?13:15}px "Microsoft JhengHei", sans-serif`,fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.fromCssColorString('#162936'),outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,disableDepthTestDistance:Number.POSITIVE_INFINITY,horizontalOrigin:Cesium.HorizontalOrigin.CENTER,verticalOrigin:Cesium.VerticalOrigin.CENTER});
    }
    lastProject=0;project();viewer.scene.requestRender();
  }
  async function refresh(){
    if(!visible || disposed)return;controller?.abort();const local=new AbortController();controller=local;const current=++revision,b=bounds();
    if(!b){collection.removeAll();status('請放大到城市或街道範圍以顯示 OSM 名稱；單次查詢以畫面中心附近約 12 公里為限');return;}
    const key=Object.values(b).map(v=>v.toFixed(3)).join(',');
    try{
      let features=cache.get(key);
      if(!features){status('正在查詢目前視野的 OSM 名稱…');const response=await fetch('/api/overpass',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:osmLabelQuery(b)}).toString(),signal:AbortSignal.any([local.signal,AbortSignal.timeout(90000)])});
        if(!response.ok)throw new Error(`OSM 標籤查詢 HTTP ${response.status}；請稍後重試`);
        const payload=await response.json();if(!Array.isArray(payload.elements))throw new Error('OSM 未回傳可用名稱資料');if(payload.remark)throw new Error(`OSM 查詢未完成：${String(payload.remark).slice(0,160)}`);
        features=osmLabelFeatures(payload);cache.set(key,features);if(cache.size>12)cache.delete(cache.keys().next().value);
      }
      local.signal.throwIfAborted();if(disposed || !visible || current!==revision)return;render(features);
      status(`目前視野取得 ${features.length} 個 OSM 名稱（顯示時避免文字重疊）；涵蓋依 OSM 資料，不是每棟建物都有名稱`);
    }catch(error){if(!local.signal.aborted && !disposed){collection.removeAll();status(error.message);throw error;}}
  }
  const schedule=()=>{controller?.abort();clearTimeout(timer);timer=setTimeout(()=>void refresh().catch(()=>{}),1500);};
  const unsubscribe=viewer.camera.moveEnd.addEventListener(schedule),unproject=viewer.scene.postRender.addEventListener(project);
  const credits=viewer.scene.frameState.creditDisplay;
  const setCredit=enabled=>{if(enabled && !creditAdded){credits.addStaticCredit(credit);creditAdded=true;}else if(!enabled && creditAdded){credits.removeStaticCredit(credit);creditAdded=false;}};
  layer=registerLayer({name:'OSM 道路、建物與景點標籤',kind:'osm-labels',sourceKey:'osm-labels',source:'OpenStreetMap / Overpass；名稱標示，不是完整建物清冊',viewer,status:'正在讀取標籤',setVisibility:enabled=>{visible=enabled;collection.show=enabled;setCredit(enabled);if(enabled)schedule();else{controller?.abort();clearTimeout(timer);}},dispose:()=>{disposed=true;controller?.abort();clearTimeout(timer);unsubscribe();unproject();setCredit(false);viewer.scene.primitives.remove(collection);cache.clear();}});
  setCredit(true);const abort=()=>{controller?.abort();removeLayer(layer.id);};signal?.addEventListener('abort',abort,{once:true});
  try{signal?.throwIfAborted();await refresh();signal?.throwIfAborted();return layer;}catch(error){removeLayer(layer.id);throw error;}finally{signal?.removeEventListener('abort',abort);}
}
