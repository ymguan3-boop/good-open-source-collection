import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { invoke } from '@tauri-apps/api/core';
import { addGeoJSON } from './dataImport.js';
import { listLayers, removeLayer } from './layerRegistry.js';

export function createNavigationController({ viewer, onStatus=()=>{} }) {
  let currentRoute = null;
  let routeLayerId = null;
  let watchId = null;
  let positionEntity = null;
  let following = false;
  let lastPosition = null;

  async function planRoute({ origin='', destination='' }) {
    if (!globalThis.__TAURI_INTERNALS__) throw new Error('TomTom 路線規劃需要 Tauri 桌面環境');
    if (!String(destination).trim()) throw new Error('請輸入目的地');
    onStatus('正在解析起點與目的地…');
    const start = await resolveLocation(origin, true);
    const end = await resolveLocation(destination, false);

    onStatus('正在向 TomTom 計算含即時交通的行車路線…');
    const raw = await invoke('tomtom_route', {
      originLat:start.lat,
      originLon:start.lon,
      destinationLat:end.lat,
      destinationLon:end.lon,
      travelMode:'car',
    });
    const payload = JSON.parse(raw);
    const route = payload?.routes?.[0];
    if (!route) throw new Error('TomTom 沒有回傳可用路線');

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
    for (const layer of listLayers().filter(l => l.kind === 'tomtom-route')) removeLayer(layer.id);
    const layer = await addGeoJSON(fc, `行車路線｜${end.label}`, viewer, {
      stroke:'#5ee7f7',
      strokeWidth:4,
      clampToGround:true,
      flyTo:true,
      kind:'tomtom-route',
      metadata:{
        source:'TomTom Routing API',
        fetchedAt:new Date().toISOString(),
        destination:end,
      },
    });
    routeLayerId = layer.id;
    currentRoute = {
      start,
      end,
      coordinates:line.geometry.coordinates,
      summary:route.summary || {},
      guidance:route.guidance?.instructions || [],
      raw:route,
    };
    onStatus(summaryText(currentRoute));
    return routeSummary(currentRoute);
  }

  async function showRoute() {
    const layer = routeLayerId ? listLayers().find(l => l.id === routeLayerId) : null;
    if (!layer?.dataSource) throw new Error('尚未規劃行車路線');
    await viewer.flyTo(layer.dataSource, { duration:1.2 });
    onStatus(summaryText(currentRoute));
    return routeSummary(currentRoute);
  }

  function navigationView(position = lastPosition) {
    if (!currentRoute) throw new Error('尚未規劃行車路線');
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
    onStatus('正在取得目前位置並啟動導航…');
    watchId = navigator.geolocation.watchPosition(
      (pos) => updatePosition(pos),
      (error) => onStatus(`定位失敗：${error.message}`),
      { enableHighAccuracy:true, maximumAge:3000, timeout:15000 }
    );
    following = true;
    return { ok:true };
  }

  function stopNavigation() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    following = false;
    onStatus('導航已停止；路線仍保留在地圖上');
    return { ok:true };
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

    const near = viewer.camera.positionCartographic;
    const raw = await invoke('tomtom_search', {
      query:text,
      lat:Cesium.Math.toDegrees(near.latitude),
      lon:Cesium.Math.toDegrees(near.longitude),
    });
    const data = JSON.parse(raw);
    const hit = data?.results?.[0];
    if (!hit?.position) throw new Error(`找不到地點：${text}`);
    return {
      lat:Number(hit.position.lat),
      lon:Number(hit.position.lon),
      label:hit.poi?.name || hit.address?.freeformAddress || text,
    };
  }

  function updatePosition(pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    lastPosition = { lat, lon, accuracy:pos.coords.accuracy };

    if (!positionEntity) {
      positionEntity = viewer.entities.add({
        id:'tw-navigation-position',
        position:Cesium.Cartesian3.fromDegrees(lon, lat, 4),
        point:{
          pixelSize:13,
          color:Cesium.Color.fromCssColorString('#5ee7f7'),
          outlineColor:Cesium.Color.WHITE,
          outlineWidth:3,
          disableDepthTestDistance:Number.POSITIVE_INFINITY,
        },
      });
    } else {
      positionEntity.position = Cesium.Cartesian3.fromDegrees(lon, lat, 4);
    }

    const idx = nearestRouteIndex(lat, lon);
    const next = currentRoute?.coordinates?.[Math.min(idx + 4, (currentRoute?.coordinates?.length || 1) - 1)];
    if (following && next) {
      const heading = Cesium.Math.toRadians(bearingDegrees(lat, lon, next[1], next[0]));
      viewer.camera.setView({
        destination:Cesium.Cartesian3.fromDegrees(lon, lat, 220),
        orientation:{ heading, pitch:Cesium.Math.toRadians(-35), roll:0 },
      });
    }
    onStatus(navigationStatus(lat, lon, idx));
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

  function navigationStatus(lat, lon, idx) {
    const coords = currentRoute?.coordinates || [];
    const dest = currentRoute?.end;
    if (!coords.length || !dest) return '導航中';
    const remainingKm = haversineKm(lat, lon, dest.lat, dest.lon);
    return `導航中｜距目的地直線約 ${remainingKm.toFixed(1)} km｜路線點 ${idx+1}/${coords.length}`;
  }

  return {
    planRoute,
    routeFromCurrentTo,
    showRoute,
    navigationView,
    startNavigation,
    stopNavigation,
    get currentRoute(){ return currentRoute; },
    get active(){ return watchId !== null; },
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
