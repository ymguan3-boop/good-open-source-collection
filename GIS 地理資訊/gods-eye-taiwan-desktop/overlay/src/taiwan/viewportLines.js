import * as Cesium from 'cesium';

const yieldTask=()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();c.port2.close();resolve();};c.port2.postMessage(0);});
const major=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link']);
export async function attachViewportLines(layer,{signal}={}) {
  const {viewer}=layer,features=layer.geojson.features,grid=new Map(),large=[],boxes=new Float64Array(features.length*4);
  const paths=f=>f.geometry?.type==='LineString'?[f.geometry.coordinates]:f.geometry?.type==='MultiLineString'?f.geometry.coordinates:[];
  // Index full source geometries, including segments crossing the current view.
  for(let i=0;i<features.length;i++){
    signal?.throwIfAborted();let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
    for(const line of paths(features[i]))for(const [x,y] of line){w=Math.min(w,x);s=Math.min(s,y);e=Math.max(e,x);n=Math.max(n,y);}
    boxes.set([w,s,e,n],i*4);if(!Number.isFinite(w))continue;
    const x0=Math.floor(w*10),x1=Math.floor(e*10),y0=Math.floor(s*10),y1=Math.floor(n*10);
    if((x1-x0+1)*(y1-y0+1)>100)large.push(i);
    else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
    if(i%3000===2999)await yieldTask();
  }
  const container=viewer.scene.groundPrimitives.add(new Cesium.PrimitiveCollection());
  let disposed=false,generation=0,pending,current,timer,signature='';
  const stats={visibleFeatures:0,inViewFeatures:0,mode:'依視野載入',loading:false};
  const credit=new Cesium.Credit('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://download.geofabrik.de/asia/taiwan.html">Geofabrik</a>',true);
  const removeCredit=viewer.scene.postRender.addEventListener(()=>{if(layer.visible!==false)viewer.scene.frameState.creditDisplay.addCreditToNextFrame(credit);});
  function notify(){viewer.scene.requestRender();window.dispatchEvent(new CustomEvent('gev-tw:vector-view-status',{detail:{id:layer.id,...stats}}));}
  async function refresh(force=false){
    if(disposed||layer.visible===false)return;const epoch=++generation;
    const rect=viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    const b=rect?[rect.west,rect.south,rect.east,rect.north].map(Cesium.Math.toDegrees):[117.8,20,123.5,27];
    if(b[2]<b[0]){b[0]=117.8;b[2]=123.5;}
    const span=Math.max(b[2]-b[0],b[3]-b[1]);const detail=span<=.16,regional=span<=.8;
    const mode=detail?'街區：目前視野完整線段':regional?'區域：主要道路／河川，放大顯示全部':'全台：幹道／主要河川，放大顯示全部';
    const ids=new Set(large);
    for(let x=Math.floor(Math.max(117,b[0])*10);x<=Math.floor(Math.min(124,b[2])*10);x++)for(let y=Math.floor(Math.max(19,b[1])*10);y<=Math.floor(Math.min(28,b[3])*10);y++)for(const i of grid.get(`${x},${y}`)||[])ids.add(i);
    const candidates=[...ids].filter(i=>{const j=i*4;return boxes[j]<=b[2]&&boxes[j+2]>=b[0]&&boxes[j+1]<=b[3]&&boxes[j+3]>=b[1];});
    const selected=candidates.filter(i=>{const p=features[i].properties||{};return detail||layer.builtinId==='osm-coastline'||(layer.builtinId==='osm-roads'?(regional?major.has(p.highway)||['tertiary','tertiary_link'].includes(p.highway):['motorway','motorway_link','trunk','trunk_link','primary','primary_link'].includes(p.highway)):p.waterway==='river'||(regional&&p.waterway==='canal'));});
    const nextSignature=selected.join(',');stats.inViewFeatures=candidates.length;stats.mode=mode;
    if(!force&&nextSignature===signature){notify();return;}
    stats.loading=true;notify();const instances=[];
    const color=Cesium.Color.fromCssColorString(layer.style.stroke||'#38bdf8');
    for(let k=0;k<selected.length;k++){
      if(disposed||epoch!==generation)return;
      for(const coords of paths(features[selected[k]]))if(coords.length>1)instances.push(new Cesium.GeometryInstance({geometry:new Cesium.GroundPolylineGeometry({positions:Cesium.Cartesian3.fromDegreesArray(coords.flatMap(p=>[p[0],p[1]])),width:layer.style.strokeWidth||1.8}),attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(color)}}));
      if(k%500===499)await yieldTask();
    }
    if(disposed||epoch!==generation)return;
    if(pending)container.remove(pending);pending=null;
    if(!instances.length){if(current)container.remove(current);current=null;stats.visibleFeatures=0;stats.loading=false;signature=nextSignature;notify();return;}
    const primitive=container.add(new Cesium.GroundPolylinePrimitive({geometryInstances:instances,classificationType:Cesium.ClassificationType.BOTH,appearance:new Cesium.PolylineColorAppearance(),allowPicking:false}));pending=primitive;
    // Keep the previous geometry visible until Cesium finishes its worker job.
    const removeReady=viewer.scene.postRender.addEventListener(()=>{
      if(disposed||epoch!==generation){removeReady();if(!disposed&&container.contains(primitive))container.remove(primitive);return;}
      if(!primitive.ready){viewer.scene.requestRender();return;}
      removeReady();if(current)container.remove(current);current=primitive;pending=null;signature=nextSignature;
      stats.visibleFeatures=selected.length;layer.renderedFeatureCount=selected.length;stats.loading=false;notify();
    });
    viewer.scene.requestRender();
  }
  const removeMove=viewer.camera.moveEnd.addEventListener(()=>{clearTimeout(timer);timer=setTimeout(()=>void refresh(),120);});
  layer.getRenderStats=()=>({...stats});layer.refreshRendering=()=>void refresh(true);
  layer.setVisibility=visible=>{container.show=visible;if(!visible){generation++;clearTimeout(timer);stats.loading=false;}else void refresh();};
  layer.dispose=()=>{disposed=true;generation++;clearTimeout(timer);removeMove();removeCredit();viewer.scene.groundPrimitives.remove(container);};
  await refresh();signal?.throwIfAborted();return layer;
}
