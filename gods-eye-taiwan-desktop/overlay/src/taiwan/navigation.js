import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';
import { listLayers, removeLayer } from './layerRegistry.js';
import { browserAi } from './browserAi.js';
import { resolvePlace } from './places.js';
import { attachNavigationCard, vehicleDisplayPolicy } from './navigationDisplay.js';

export function createNavigationController({ viewer, beforeCamera=()=>{}, onStatus=()=>{},onRoute=()=>{} }) {
  let routeStyle={color:'#369cff',width:2};
  try{const saved=JSON.parse(localStorage.getItem('gev.tw.routeStyle')||'{}');if(/^#[0-9a-f]{6}$/i.test(saved.color||''))routeStyle.color=saved.color;if(Number.isFinite(Number(saved.width)))routeStyle.width=Math.max(.5,Math.min(16,Number(saved.width)));}catch{}
  function setRouteStyle(patch={}){
    if(/^#[0-9a-f]{6}$/i.test(patch.color||''))routeStyle.color=patch.color;
    if(Number.isFinite(Number(patch.width)))routeStyle.width=Math.max(.5,Math.min(16,Number(patch.width)));
    localStorage.setItem('gev.tw.routeStyle',JSON.stringify(routeStyle));
    const layer=listLayers().find(item=>item.id===routeLayerId);
    if(layer){layer.style={...layer.style,stroke:routeStyle.color,strokeWidth:routeStyle.width};for(const entity of layer.dataSource.entities.values)if(entity.polyline){entity.polyline.width=routeStyle.width;entity.polyline.material=new Cesium.PolylineDashMaterialProperty({color:Cesium.Color.fromCssColorString(routeStyle.color),dashLength:16});}}
    viewer.scene.requestRender();return {...routeStyle};
  }
  let currentRoute = null;
  let routeLayerId = null;
  let positionEntity = null;
  let following = false;
  let planEpoch = 0;
  let previewTimer=null;
  let driveMode=false,driveHeights=[];
  let releaseCard=null,attachedCard=null;
  function attachCard(card){
    if(card===attachedCard)return;
    releaseCard?.();attachedCard=card;
    releaseCard=attachNavigationCard(card);
  }

  async function planRoute({origin='',destination='',waypoints=[],travelMode='car'}) {
    beforeCamera();
    if(!['car','motorcycle'].includes(travelMode))throw new Error('請選擇汽車或機車');
    if(!Array.isArray(waypoints))throw new Error('中途點格式不正確');
    stopMotion();
    const epoch = ++planEpoch;
    const ensureCurrent = () => { if (epoch !== planEpoch) throw new DOMException('路線規劃已停止', 'AbortError'); };
    const presence=(await browserAi('/keys')).env?.TOMTOM_API_KEY;
    ensureCurrent();if(!presence)throw new Error('未輸入金鑰');
    if (!String(destination).trim()) throw new Error('請輸入目的地');
    onStatus('正在解析起點與目的地…');
    const start = await resolveLocation(origin, true);
    ensureCurrent();
    const end = await resolveLocation(destination, false);
    ensureCurrent();

    const stops=[];
    for(const waypoint of waypoints){if(typeof waypoint==='string' && !waypoint.trim())continue;ensureCurrent();stops.push(await resolveLocation(waypoint,false));}
    ensureCurrent();const locations=[start,...stops,end],routes=[];
    for(let i=0;i<locations.length-1;i++){
      ensureCurrent();onStatus(`正在計算第 ${i+1}／${locations.length-1} 段${travelMode==='motorcycle'?'機車':'汽車'}路線…`);
      const from=locations[i],to=locations[i+1],request={originLat:from.lat,originLon:from.lon,destinationLat:to.lat,destinationLon:to.lon,travelMode};
      const raw=await browserAi('/route',{method:'POST',data:request});
      ensureCurrent();const payload=typeof raw==='string'?JSON.parse(raw):raw,legRoute=payload?.routes?.[0];
      if(!legRoute)throw new Error(`第 ${i+1} 段沒有可用路線`);routes.push(legRoute);
    }
    // Two-point requests use the local browser proxy and allow any number of stops.
    let offset=0;
    const guidance=routes.flatMap(route=>{const items=(route.guidance?.instructions||[]).map(item=>({...item,routeOffsetInMeters:Number(item.routeOffsetInMeters||0)+offset}));offset+=Number(route.summary?.lengthInMeters||0);return items;});
    const route={legs:routes.flatMap(route=>route.legs||[]),summary:{lengthInMeters:routes.reduce((sum,route)=>sum+Number(route.summary?.lengthInMeters||0),0),travelTimeInSeconds:routes.reduce((sum,route)=>sum+Number(route.summary?.travelTimeInSeconds||0),0),trafficDelayInSeconds:routes.reduce((sum,route)=>sum+Number(route.summary?.trafficDelayInSeconds||0),0)},guidance:{instructions:guidance},segments:routes};

    const coords = [];
    for (const leg of route.legs || []) {
      for (const p of leg.points || []) {
        const pair = [Number(p.longitude), Number(p.latitude)];
        if (pair.every(Number.isFinite)) {
          const prev = coords.at(-1);
          if (!prev || prev[0] !== pair[0] || prev[1] !== pair[1]) coords.push(pair);
        }
      }
    }
    if (coords.length < 2) throw new Error('TomTom 路線沒有足夠幾何點');

    let line = turf.lineString(coords, {
      provider:'TomTom',
      origin:start.label,
      destination:end.label,
    });
    if (coords.length > 6000) {
      line = turf.simplify(line, { tolerance:0.000015, highQuality:false, mutate:false });
    }
    const fc = turf.featureCollection([line]);

    if (routeLayerId) removeLayer(routeLayerId);
    const layer = await addGeoJSON(fc, `行車路線｜${end.label}`, viewer, {
      stroke:routeStyle.color,
      strokeWidth:routeStyle.width,
      clampToGround:true,
      flyTo:true,
      kind:'tomtom-route',
      metadata:{
        source:'TomTom Routing API',
        fetchedAt:new Date().toISOString(),
        destination:end,
      },
    });
    if (epoch !== planEpoch) {
      removeLayer(layer.id);
      ensureCurrent();
    }
    routeLayerId = layer.id;
    for(const entity of layer.dataSource.entities.values){if(entity.polyline){entity.polyline.classificationType=Cesium.ClassificationType.BOTH;entity.polyline.zIndex=100;}}
    setRouteStyle(routeStyle);
    currentRoute = {
      start,
      end,
      stops,
      travelMode,
      coordinates:line.geometry.coordinates,
      summary:route.summary || {},
      guidance:route.guidance?.instructions || [],
      raw:route,
    };
    currentRoute.line=turf.lineString(currentRoute.coordinates);
    currentRoute.cumulative=[0];for(let i=1;i<currentRoute.coordinates.length;i++)currentRoute.cumulative.push(currentRoute.cumulative[i-1]+turf.distance(currentRoute.coordinates[i-1],currentRoute.coordinates[i]));
    currentRoute.lengthKm=currentRoute.cumulative.at(-1);
    for(const [place,label,color] of [[start,'起點','#35e586'],...stops.map((stop,index)=>[stop,`中途 ${index+1}`,'#b39dff']),[end,'終點','#ffbf35']])layer.dataSource.entities.add({position:Cesium.Cartesian3.fromDegrees(place.lon,place.lat,12),point:{pixelSize:11,color:Cesium.Color.fromCssColorString(color),outlineColor:Cesium.Color.BLACK,outlineWidth:2,disableDepthTestDistance:Infinity},label:{text:`${label}：${place.label}`,font:'14px IBM Plex Sans TC',fillColor:Cesium.Color.WHITE,showBackground:true,backgroundColor:Cesium.Color.fromCssColorString('#071a2b').withAlpha(.9),pixelOffset:new Cesium.Cartesian2(0,label==='起點' ? -26 : 26),disableDepthTestDistance:Infinity}});
    layer.setVisibility=visible=>{if(!visible)stopMotion();onRoute(visible ? routeSummary(currentRoute) : null);};
    layer.dispose=()=>{stopMotion();positionEntity=null;currentRoute=null;routeLayerId=null;onRoute(null);};
    onRoute(routeSummary(currentRoute));
    onStatus(summaryText(currentRoute));
    startPreview();
    return routeSummary(currentRoute);
  }

  async function showRoute() {
    beforeCamera();
    following=false;driveMode=false;
    const layer = routeLayerId ? listLayers().find(l => l.id === routeLayerId) : null;
    if (!layer?.dataSource) throw new Error('尚未規劃行車路線');
    layer.visible=true;layer.dataSource.show=true;onRoute(routeSummary(currentRoute));
    await viewer.flyTo(layer.dataSource, { duration:1.2 });
    onStatus(summaryText(currentRoute));
    return routeSummary(currentRoute);
  }

  function navigationView() { return driveRoute(); }

  function stopNavigation() {
    planEpoch++;
    stopMotion();
    onStatus('行車視角與行進示意已停止；路線仍保留在地圖上');
    return { ok:true };
  }
  function stopMotion(){
    following = false;
    driveMode=false;viewer.camera.cancelFlight();
    cancelAnimationFrame(previewTimer);previewTimer=null;
    if(positionEntity){listLayers().find(l=>l.id===routeLayerId)?.dataSource?.entities.remove(positionEntity);positionEntity=null;}
  }
  function clearRoute(){
    ++planEpoch;stopMotion();
    if(routeLayerId)removeLayer(routeLayerId);
    currentRoute=null;routeLayerId=null;onRoute(null);onStatus('路線已關閉');
    return { ok:true };
  }
  function startPreview({follow=false,durationSeconds=60}={}){
    if(!currentRoute)throw new Error('請先規劃路線');
    stopMotion();lastSurface={at:-Infinity,height:0};driveHeights=follow?driveHeights:[];const layer=listLayers().find(l=>l.id===routeLayerId);if(!layer)throw new Error('路線圖層已移除');
    layer.visible=true;layer.dataSource.show=true;onRoute(routeSummary(currentRoute));
    following=follow;driveMode=follow;viewer.camera.cancelFlight();
    const started=performance.now();
    const tick=()=>{if(!currentRoute || !layer.visible){stopMotion();return;}const fraction=Math.min(1,(performance.now()-started)/(durationSeconds*1000)),distance=currentRoute.lengthKm*fraction,distances=currentRoute.cumulative;
      let low=0,high=distances.length-1;while(low+1<high){const mid=(low+high)>>1;if(distances[mid]<=distance)low=mid;else high=mid;}
      const a=currentRoute.coordinates[low],b=currentRoute.coordinates[high],ratio=distances[high]>distances[low] ? (distance-distances[low])/(distances[high]-distances[low]) : 0;
      const point=[a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio];
      updatePosition(point[1],point[0],fraction,bearingDegrees(a[1],a[0],b[1],b[0]));
      if(fraction>=1){previewTimer=null;following=false;driveMode=false;onStatus('路線行進示意已完成（非裝置實際位置）');}else previewTimer=requestAnimationFrame(tick);
    };
    tick();return {ok:true,mode:'route-preview'};
  }
  async function driveRoute(){
    beforeCamera();
    if(!currentRoute)throw new Error('請先規劃行車路線');
    stopMotion();const route=currentRoute,epoch=planEpoch;
    onStatus('正在準備沿路線行車視角（非裝置實際位置）…');
    const positions=Array.from({length:65},(_,i)=>{const p=turf.along(route.line,route.lengthKm*i/64).geometry.coordinates;return Cesium.Cartographic.fromDegrees(...p);});
    driveHeights=[];
    if(viewer.terrainProvider?.availability){try{const sampled=await Promise.race([Cesium.sampleTerrainMostDetailed(viewer.terrainProvider,positions),new Promise((_,reject)=>setTimeout(()=>reject(new Error('地形取樣逾時')),8000))]);driveHeights=sampled.map(p=>Number.isFinite(p.height)?p.height:0);}catch{onStatus('地形取樣暫時無法取得，改依已載入地表高度行進');}}
    if(route!==currentRoute || epoch!==planEpoch)throw new DOMException('行車預覽已停止','AbortError');
    return startPreview({follow:true,durationSeconds:Math.max(90,Math.min(300,route.summary.travelTimeInSeconds/4 || 120))});
  }

  async function routeFromCurrentTo(destination) {
    const result = await planRoute({ origin:'', destination });
    return result;
  }

  async function resolveLocation(value, allowCurrent) {
    if (value && typeof value === 'object' && Number.isFinite(value.lat) && Number.isFinite(value.lon)) {
      return { lat:Number(value.lat), lon:Number(value.lon), label:value.label || '座標' };
    }
    const text = String(value || '').trim();
    if (allowCurrent && (!text || text === '目前位置' || text === '我的位置' || text === '地圖中心' || text === '目前地圖中心' || text.toLowerCase() === 'current location')) {
      return mapCenterLocation(viewer);
    }

    const hit = await resolvePlace(text);
    return {lat:hit.lat,lon:hit.lon,label:hit.name};
  }

  let lastSurface = { at: -Infinity, height: 0 }, lastStatusAt = 0;
  function surfaceHeight(lon, lat, fraction) {
    const now=performance.now();
    if(now-lastSurface.at<120)return lastSurface.height;
    const point=Cesium.Cartographic.fromDegrees(lon,lat);
    let height=viewer.scene.globe.getHeight(point);
    if(viewer.scene.sampleHeightSupported){try{const sampled=viewer.scene.sampleHeight(point,positionEntity?[positionEntity]:[]);if(Number.isFinite(sampled))height=sampled;}catch{}}
    if(!Number.isFinite(height)&&driveHeights.length){const index=Math.min(63,Math.floor(fraction*64)),ratio=fraction*64-index;height=driveHeights[index]*(1-ratio)+driveHeights[index+1]*ratio;}
    lastSurface={at:now,height:Number.isFinite(height)?height:0};return lastSurface.height;
  }
  function updatePosition(lat,lon,fraction=0,headingDegrees=0) {
    if(!currentRoute)return;
    const height=surfaceHeight(lon,lat,fraction),position=Cesium.Cartesian3.fromDegrees(lon,lat,height+.12);
    // GLB has +X forward; Cesium heading is clockwise from north.
    const orientation=Cesium.Transforms.headingPitchRollQuaternion(position,new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(headingDegrees)-Math.PI/2,0,0));
    if(!positionEntity){
      const display=vehicleDisplayPolicy(currentRoute.travelMode);
      positionEntity=listLayers().find(l=>l.id===routeLayerId).dataSource.entities.add({
        name:currentRoute.travelMode==='motorcycle'?'機車路線示意':'汽車路線示意',position,orientation,
        model:{uri:display.uri,scale:1,minimumPixelSize:display.minimumPixelSize,heightReference:Cesium.HeightReference.NONE,shadows:Cesium.ShadowMode.DISABLED},
        billboard:{image:display.markerImage,width:display.markerSize,height:display.markerSize,distanceDisplayCondition:new Cesium.DistanceDisplayCondition(display.markerNear,Infinity),disableDepthTestDistance:Infinity},
        label:{text:display.label,font:'13px IBM Plex Sans TC',fillColor:Cesium.Color.WHITE,showBackground:true,pixelOffset:new Cesium.Cartesian2(0,-28),disableDepthTestDistance:Infinity},
      });
    }else{positionEntity.position=position;positionEntity.orientation=orientation;}
    const routeDistance=currentRoute.lengthKm*fraction;
    if(following){
      const target=turf.along(currentRoute.line,Math.min(currentRoute.lengthKm,routeDistance+.06)).geometry.coordinates;
      const heading=Cesium.Math.toRadians(bearingDegrees(lat,lon,target[1],target[0]));
      // Follow from behind the colored 3D vehicle so the model remains visible.
      const behind=routeDistance>=.025?turf.along(currentRoute.line,routeDistance-.025).geometry.coordinates:turf.destination([lon,lat],.025,headingDegrees+180).geometry.coordinates;
      viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(behind[0],behind[1],height+(driveMode?18:70)),orientation:{heading,pitch:Cesium.Math.toRadians(driveMode?-33:-24),roll:0}});
    }
    const now=performance.now();if(now-lastStatusAt>450 || fraction>=1){lastStatusAt=now;onStatus(navigationStatus(fraction));}
    viewer.scene.requestRender();
  }

  function nearestRouteIndex(lat, lon) {
    if (!currentRoute?.coordinates?.length) return 0;
    let best = 0, bestD = Infinity;
    const coords = currentRoute.coordinates;
    const step = Math.max(1, Math.floor(coords.length / 1500));
    for (let i=0;i<coords.length;i+=step) {
      const d = squaredDistance(lat, lon, coords[i][1], coords[i][0]);
      if (d < bestD) { bestD=d; best=i; }
    }
    return best;
  }

  function navigationStatus(fraction) {
    if(!currentRoute?.end)return '路線行進示意';
    const total=currentRoute.lengthKm,remainingKm=Math.max(0,total*(1-fraction));
    const remainingMinutes=total?Math.ceil(currentRoute.summary.travelTimeInSeconds/60*(1-fraction)):0;
    const instruction=currentRoute.guidance.find(item=>item.routeOffsetInMeters>total*fraction*1000);
    return `路線行進示意（非裝置實際位置）｜剩餘路程約 ${remainingKm.toFixed(1)} 公里｜依規劃時間估計約 ${remainingMinutes} 分鐘${instruction?.message?`｜${instruction.message}`:''}`;
  }

  return {
    attachCard,
    destroy(){stopNavigation();releaseCard?.();releaseCard=null;attachedCard=null;},
    setRouteStyle,
    get routeStyle(){return {...routeStyle};},
    planRoute,
    routeFromCurrentTo,
    showRoute,
    navigationView,
    stopNavigation,
    clearRoute,
    startPreview,
    driveRoute,
    get currentRoute(){ return currentRoute; },
    get active(){ return previewTimer !== null; },
  };
}

export function mapCenterLocation(viewer) {
  const point=new Cesium.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2);
  const ray=viewer.camera.getPickRay(point);
  const surface=ray?viewer.scene.globe.pick(ray,viewer.scene):null;
  const cartesian=surface || viewer.camera.pickEllipsoid(point,viewer.scene.globe.ellipsoid);
  const c=cartesian?Cesium.Cartographic.fromCartesian(cartesian):viewer.camera.positionCartographic;
  if(!c)throw new Error('無法取得地圖中心，請輸入起點');
  return {lat:Cesium.Math.toDegrees(c.latitude),lon:Cesium.Math.toDegrees(c.longitude),label:'地圖中心（非裝置定位）'};
}
function routeSummary(route) {
  return {
    origin:route.start.label,
    destination:route.end.label,
    waypoints:(route.stops||[]).map(stop=>({name:stop.label,lat:stop.lat,lon:stop.lon})),
    travelMode:route.travelMode || 'car',
    lengthMeters:route.summary?.lengthInMeters || 0,
    travelTimeSeconds:route.summary?.travelTimeInSeconds || 0,
    trafficDelaySeconds:route.summary?.trafficDelayInSeconds || 0,
  };
}
function summaryText(route) {
  const s = routeSummary(route);
  return `路線：${s.origin} → ${s.destination}｜${(s.lengthMeters/1000).toFixed(1)} km｜約 ${Math.round(s.travelTimeSeconds/60)} 分鐘${s.trafficDelaySeconds ? `｜交通延誤約 ${Math.round(s.trafficDelaySeconds/60)} 分` : ''}`;
}
function squaredDistance(a,b,c,d){ return (a-c)**2 + (b-d)**2; }
function bearingDegrees(lat1,lon1,lat2,lon2){
  const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
