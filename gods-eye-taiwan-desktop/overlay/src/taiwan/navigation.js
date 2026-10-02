import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { invoke } from '@tauri-apps/api/core';
import { addGeoJSON } from './dataImport.js';
import { listLayers, removeLayer } from './layerRegistry.js';
import { browserAi } from './browserAi.js';
import { resolvePlace } from './places.js';

export function createNavigationController({ viewer, onStatus=()=>{},onRoute=()=>{} }) {
  let currentRoute = null;
  let routeLayerId = null;
  let watchId = null;
  let positionEntity = null;
  let following = false;
  let lastPosition = null;
  let planEpoch = 0;
  let previewTimer=null;
  let driveMode=false,driveHeights=[];

  async function planRoute({origin='',destination='',waypoints=[],travelMode='car'}) {
    if(!['car','motorcycle'].includes(travelMode))throw new Error('請選擇汽車或機車');
    if(!Array.isArray(waypoints))throw new Error('中途點格式不正確');
    stopMotion();
    const epoch = ++planEpoch;
    const ensureCurrent = () => { if (epoch !== planEpoch) throw new DOMException('路線規劃已停止', 'AbortError'); };
    const presence=globalThis.__TAURI_INTERNALS__ ? await invoke('has_api_key',{name:'TOMTOM_API_KEY'}) : (await browserAi('/keys')).env?.TOMTOM_API_KEY;
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
      const raw=globalThis.__TAURI_INTERNALS__?await invoke('tomtom_route',request):await browserAi('/route',{method:'POST',data:request});
      ensureCurrent();const payload=typeof raw==='string'?JSON.parse(raw):raw,legRoute=payload?.routes?.[0];
      if(!legRoute)throw new Error(`第 ${i+1} 段沒有可用路線`);routes.push(legRoute);
    }
    // Two-point requests keep both native and browser paths compatible and allow any number of stops.
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
      stroke:'#5ee7f7',
      strokeWidth:9,
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
    following=false;driveMode=false;
    const layer = routeLayerId ? listLayers().find(l => l.id === routeLayerId) : null;
    if (!layer?.dataSource) throw new Error('尚未規劃行車路線');
    layer.visible=true;layer.dataSource.show=true;onRoute(routeSummary(currentRoute));
    await viewer.flyTo(layer.dataSource, { duration:1.2 });
    onStatus(summaryText(currentRoute));
    return routeSummary(currentRoute);
  }

  function navigationView(position = lastPosition) {
    if (!currentRoute) throw new Error('尚未規劃行車路線');
    if(watchId===null)return driveRoute();
    const pos = position || {
      lat:currentRoute.coordinates[0][1],
      lon:currentRoute.coordinates[0][0],
    };
    const nearestIndex = nearestRouteIndex(pos.lat, pos.lon);
    const next = currentRoute.coordinates[Math.min(nearestIndex + 4, currentRoute.coordinates.length - 1)];
    const heading = Cesium.Math.toRadians(bearingDegrees(pos.lat, pos.lon, next[1], next[0]));
    viewer.camera.flyTo({
      destination:Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 220),
      orientation:{ heading, pitch:Cesium.Math.toRadians(-35), roll:0 },
      duration:0.7,
    });
    following = true;
    onStatus('已切換導航視角');
    return { ok:true, mode:'navigation' };
  }

  async function startNavigation() {
    if (!currentRoute) throw new Error('請先規劃路線');
    if (!navigator.geolocation) throw new Error('此裝置不支援定位');
    if (watchId !== null) return { ok:true, alreadyRunning:true };
    stopMotion();
    const layer=listLayers().find(l=>l.id===routeLayerId);if(layer?.dataSource)layer.dataSource.show=true;
    if(layer)layer.visible=true;
    onRoute(routeSummary(currentRoute));
    onStatus('正在取得目前位置並啟動導航…');
    watchId = navigator.geolocation.watchPosition(
      (pos) => updatePosition(pos),
      (error) => {stopMotion();onStatus(`定位失敗：${error.message}`);},
      { enableHighAccuracy:true, maximumAge:3000, timeout:15000 }
    );
    following = true;
    return { ok:true };
  }

  function stopNavigation() {
    planEpoch++;
    stopMotion();
    onStatus('導航與行進示意已停止；路線仍保留在地圖上');
    return { ok:true };
  }
  function stopMotion(){
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    following = false;
    driveMode=false;viewer.camera.cancelFlight();
    clearInterval(previewTimer);previewTimer=null;
    if(positionEntity){listLayers().find(l=>l.id===routeLayerId)?.dataSource?.entities.remove(positionEntity);positionEntity=null;}
  }
  function clearRoute(){
    ++planEpoch;stopMotion();
    if(routeLayerId)removeLayer(routeLayerId);
    currentRoute=null;routeLayerId=null;lastPosition=null;onRoute(null);onStatus('路線已關閉');
    return { ok:true };
  }
  function startPreview({follow=false,durationSeconds=60}={}){
    if(!currentRoute)throw new Error('請先規劃路線');
    stopMotion();const layer=listLayers().find(l=>l.id===routeLayerId);if(!layer)throw new Error('路線圖層已移除');
    layer.visible=true;layer.dataSource.show=true;onRoute(routeSummary(currentRoute));
    following=follow;driveMode=follow;viewer.camera.cancelFlight();
    const started=performance.now();
    const tick=()=>{if(!currentRoute || !layer.visible){stopMotion();return;}const fraction=Math.min(1,(performance.now()-started)/(durationSeconds*1000)),distance=currentRoute.lengthKm*fraction,distances=currentRoute.cumulative;
      let low=0,high=distances.length-1;while(low+1<high){const mid=(low+high)>>1;if(distances[mid]<=distance)low=mid;else high=mid;}
      const a=currentRoute.coordinates[low],b=currentRoute.coordinates[high],ratio=distances[high]>distances[low] ? (distance-distances[low])/(distances[high]-distances[low]) : 0;
      const point=[a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio];
      updatePosition({coords:{latitude:point[1],longitude:point[0],accuracy:0}},true,fraction);
      if(fraction>=1){clearInterval(previewTimer);previewTimer=null;following=false;driveMode=false;onStatus('行進示意已完成（非 GPS 實際位置）');}
    };
    previewTimer=setInterval(tick,100);tick();return {ok:true,mode:'route-preview'};
  }
  async function driveRoute(){
    if(!currentRoute)throw new Error('請先規劃行車路線');
    stopMotion();const route=currentRoute,epoch=planEpoch;
    onStatus('正在準備沿路線行車視角（非 GPS 實際位置）…');
    const positions=Array.from({length:65},(_,i)=>{const p=turf.along(route.line,route.lengthKm*i/64).geometry.coordinates;return Cesium.Cartographic.fromDegrees(...p);});
    driveHeights=[];
    if(viewer.terrainProvider?.availability){try{const sampled=await Promise.race([Cesium.sampleTerrainMostDetailed(viewer.terrainProvider,positions),new Promise((_,reject)=>setTimeout(()=>reject(new Error('地形取樣逾時')),8000))]);driveHeights=sampled.map(p=>Number.isFinite(p.height)?p.height:0);}catch{onStatus('地形取樣暫時無法取得，改依已載入地表高度行進');}}
    if(route!==currentRoute || epoch!==planEpoch)throw new DOMException('行車預覽已停止','AbortError');
    return startPreview({follow:true,durationSeconds:Math.max(90,Math.min(300,route.summary.travelTimeInSeconds/4 || 120))});
  }

  async function routeFromCurrentTo(destination) {
    const result = await planRoute({ origin:'', destination });
    await startNavigation();
    return result;
  }

  async function resolveLocation(value, allowCurrent) {
    if (value && typeof value === 'object' && Number.isFinite(value.lat) && Number.isFinite(value.lon)) {
      return { lat:Number(value.lat), lon:Number(value.lon), label:value.label || '座標' };
    }
    const text = String(value || '').trim();
    if (allowCurrent && (!text || text === '目前位置' || text === '我的位置' || text.toLowerCase() === 'current location')) {
      const pos = await getCurrentPosition();
      return { lat:pos.coords.latitude, lon:pos.coords.longitude, label:'目前位置' };
    }

    const hit = await resolvePlace(text);
    return {lat:hit.lat,lon:hit.lon,label:hit.name};
  }

  function updatePosition(pos,preview=false,fraction=0) {
    if(!currentRoute)return;
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    lastPosition = { lat, lon, accuracy:pos.coords.accuracy };

    if (!positionEntity) {
      positionEntity = listLayers().find(l=>l.id===routeLayerId).dataSource.entities.add({
        position:Cesium.Cartesian3.fromDegrees(lon, lat, 4),
        point:{
          pixelSize:13,
          color:Cesium.Color.fromCssColorString('#5ee7f7'),
          outlineColor:Cesium.Color.WHITE,
          outlineWidth:3,
          disableDepthTestDistance:Number.POSITIVE_INFINITY,
        },
        label:{text:preview ? '行進示意（非 GPS）' : '目前位置',font:'13px IBM Plex Sans TC',fillColor:Cesium.Color.WHITE,showBackground:true,pixelOffset:new Cesium.Cartesian2(0,-24),disableDepthTestDistance:Infinity},
      });
    } else {
      positionEntity.position = Cesium.Cartesian3.fromDegrees(lon, lat, 4);
    }

    const idx = nearestRouteIndex(lat, lon);
    const next = currentRoute?.coordinates?.[Math.min(idx + 4, (currentRoute?.coordinates?.length || 1) - 1)];
    if (following && next) {
      const routeDistance=preview?currentRoute.lengthKm*fraction:turf.nearestPointOnLine(currentRoute.line,turf.point([lon,lat])).properties.location;
      const target=turf.along(currentRoute.line,Math.min(currentRoute.lengthKm,routeDistance+.06)).geometry.coordinates;
      const heading = Cesium.Math.toRadians(bearingDegrees(lat, lon, target[1], target[0]));
      const groundPoint=Cesium.Cartographic.fromDegrees(lon,lat);
      let height=viewer.scene.globe.getHeight(groundPoint);
      if(viewer.scene.sampleHeightSupported){try{const sampled=viewer.scene.sampleHeight(groundPoint,[positionEntity]);if(Number.isFinite(sampled))height=sampled;}catch{}}
      if(!Number.isFinite(height)&&driveHeights.length){const index=Math.min(63,Math.floor(fraction*64)),ratio=fraction*64-index;height=driveHeights[index]*(1-ratio)+driveHeights[index+1]*ratio;}
      height=Number.isFinite(height)?height:0;
      viewer.camera.setView({
        destination:Cesium.Cartesian3.fromDegrees(lon, lat, height+(driveMode?18:70)),
        orientation:{ heading, pitch:Cesium.Math.toRadians(driveMode?-12:-24), roll:0 },
      });
    }
    onStatus(navigationStatus(lat, lon, idx,preview,fraction));viewer.scene.requestRender();
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

  function navigationStatus(lat, lon, idx,preview,fraction) {
    const coords = currentRoute?.coordinates || [];
    const dest = currentRoute?.end;
    if (!coords.length || !dest) return '導航中';
    const total=currentRoute.lengthKm,nearest=preview ? {properties:{location:total*fraction,dist:0}} : turf.nearestPointOnLine(currentRoute.line,turf.point([lon,lat]));
    const remainingKm=Math.max(0,total-nearest.properties.location),remainingMinutes=total ? Math.ceil(currentRoute.summary.travelTimeInSeconds/60*remainingKm/total) : 0;
    const mode=preview ? '路線行進示意（非 GPS 實際位置）' : 'GPS 導航中';
    const instruction=currentRoute.guidance.find(item=>item.routeOffsetInMeters>nearest.properties.location*1000);
    return `${mode}｜剩餘路程約 ${remainingKm.toFixed(1)} 公里｜依規劃時間估計約 ${remainingMinutes} 分鐘${!preview && nearest.properties.dist>.1 ? '｜已偏離路線，請重新規劃' : ''}${instruction?.message ? `｜${instruction.message}` : ''}`;
  }

  return {
    planRoute,
    routeFromCurrentTo,
    showRoute,
    navigationView,
    startNavigation,
    stopNavigation,
    clearRoute,
    startPreview,
    driveRoute,
    get currentRoute(){ return currentRoute; },
    get active(){ return watchId !== null || previewTimer !== null; },
  };
}

function getCurrentPosition() {
  return new Promise((resolve,reject) => {
    if (!navigator.geolocation) return reject(new Error('此裝置不支援定位'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy:true,
      maximumAge:5000,
      timeout:15000,
    });
  });
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
