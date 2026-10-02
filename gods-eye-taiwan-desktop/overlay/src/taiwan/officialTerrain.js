import { prepareBuildingSurface,configureBuildingTileset } from './buildingDisplay.js';
import * as Cesium from 'cesium';
import proj4 from 'proj4';
import { addGeoJSON } from './dataImport.js';
import { registerLayer, listLayers, removeLayer } from './layerRegistry.js';

const TWD97_121 = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const TWD97_119 = '+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';

export async function importDtmCsv(file, viewer, crs='EPSG:3826') {
  if (file.size > 30_000_000) throw new Error('請先切出 30 MB 以下的 DTM 範圍檔');
  const text = await file.text();
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  const sourceKey = `dtm-file:${crs}:${[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')}`;
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('DTM CSV 沒有資料列');
  const columns = lines[0].split(/[,\s]+/).map(item => item.replace(/^\uFEFF/, '').trim().toLowerCase());
  if (columns.every(item => Number.isFinite(Number(item)))) throw new Error('DTM 檔案需要 E、N、H 欄名，請先確認原始資料的坐標順序');
  const index = names => columns.findIndex(item => names.includes(item));
  const ix = index(['e', 'x', 'easting', 'lon', 'longitude', '經度']);
  const iy = index(['n', 'y', 'northing', 'lat', 'latitude', '緯度']);
  const ih = index(['h', 'z', 'height', 'elevation', '高程']);
  if ([ix, iy, ih].some(n => n < 0)) throw new Error('CSV 需有 E、N、H 或 longitude、latitude、height 欄位');
  const features = [];
  const projection = crs === 'EPSG:3825' ? TWD97_119 : crs === 'EPSG:3826' ? TWD97_121 : null;
  for (let i=1; i<lines.length && features.length < 10000; i++) {
    const values = lines[i].trim().split(/[,\s]+/);
    const x = Number(values[ix]); const y = Number(values[iy]); const height = Number(values[ih]);
    if (![x,y,height].every(Number.isFinite)) continue;
    const [lon, lat] = projection ? proj4(projection, 'EPSG:4326', [x,y]) : [x,y];
    if (lon < 117 || lon > 123 || lat < 20 || lat > 27) continue;
    features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{ height, sourceFile:file.name, sourceCrs:crs } });
  }
  if (!features.length) throw new Error('沒有可用的台灣 DTM 點；請確認欄位、坐標系統與檔案格式');
  const layer = await addGeoJSON({ type:'FeatureCollection', features }, `DTM：${file.name}`, viewer,
    { kind:'dtm', stroke:'#edd27b', fill:'#edd27b', alpha:0.7, circleRadius:2, renderFeatureLimit:600, flyTo:false, metadata:{sourceKey,sourceFile:file.name,source:'使用者匯入；官方來源請自行核對檔案'} });
  return { layer, truncated:lines.length - 1 > 10000 };
}

export async function loadBundledDtm(viewer, { signal, bbox:requestedBbox } = {}) {
  const limits = { west:119.8, south:21.8, east:122.2, north:25.6 };
  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  const view = rect ? {
    west:Cesium.Math.toDegrees(rect.west), south:Cesium.Math.toDegrees(rect.south),
    east:Cesium.Math.toDegrees(rect.east), north:Cesium.Math.toDegrees(rect.north),
  } : limits;
  // County bounds can include distant islands (e.g. Yilan). Intersect with
  // the official main-island raster without altering the administrative data.
  const desired=requestedBbox || view;
  const bbox={west:Math.max(desired.west,limits.west),south:Math.max(desired.south,limits.south),east:Math.min(desired.east,limits.east),north:Math.min(desired.north,limits.north)};
  if (bbox.west >= bbox.east || bbox.south >= bbox.north) {
    if(requestedBbox)throw new Error('所選範圍不在官方本島 DTM 格網涵蓋範圍；無資料不代表高程為零');
    Object.assign(bbox,limits);
  }
  const query = new URLSearchParams(bbox).toString();
  const response = await fetch(`/api/taiwan/dtm-2025?${query}`, { cache:'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `DTM HTTP ${response.status}`);
  if (!result.points?.length) throw new Error('此範圍沒有可用 DTM 格網點');
  signal?.throwIfAborted();
  const geojson = { type:'FeatureCollection', features:result.points.map(([lon,lat,height]) => ({
    type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] },
    properties:{ height, source:'內政部地政司 2025 全臺 20 公尺 DTM', sourceCrs:'EPSG:3826' },
  })) };
  const layer = await addGeoJSON(geojson,'2025 全臺 20 公尺 DTM（所選範圍樣點）',viewer,
    { kind:'dtm', stroke:'#edd27b', fill:'#edd27b', alpha:0.65, circleRadius:2, renderFeatureLimit:600, flyTo:false,
      metadata:{ source:'內政部地政司開放資料；20m 原始格網按所選範圍抽樣', sourceKey:'official-dtm-2025', sampledSpacingMeters:result.sampledSpacingMeters } });
  for (const old of listLayers().filter(item => item.id !== layer.id && item.kind === 'dtm' && item.name.startsWith('2025 全臺'))) removeLayer(old.id);
  return { layer, sampledSpacingMeters:result.sampledSpacingMeters };
}

export async function loadNlscBuildings(url, viewer, { name='NLSC 3D 建物', flyTo=true, nationwideAuto=false, signal } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/(^|\.)nlsc\.gov\.tw$/.test(parsed.hostname)) throw new Error('請貼上國土測繪中心核發的 HTTPS 3D Tiles 服務網址');
  signal?.throwIfAborted();
  await prepareBuildingSurface(viewer,{signal});
  let timeout; let abortListener; let discarded = false; let tileset;
  const loading = Cesium.Cesium3DTileset.fromUrl(parsed.href,{maximumScreenSpaceError:8,cacheBytes:268435456,maximumCacheOverflowBytes:134217728});
  loading.then(value=>{ if (discarded && !value.isDestroyed()) value.destroy(); },()=>{});
  try {
    tileset = await Promise.race([loading,
      new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('NLSC 建物根索引超過 45 秒未完成；請檢查連線後重試')),45000);}),
      new Promise((_,reject)=>{ if (signal) { abortListener=()=>reject(new DOMException('已停止載入','AbortError')); signal.addEventListener('abort',abortListener,{once:true}); } }),
    ]);
    signal?.throwIfAborted();
  } catch (error) { discarded = true; if (tileset && !tileset.isDestroyed()) tileset.destroy(); throw error; }
  finally { clearTimeout(timeout); if (abortListener) signal.removeEventListener('abort',abortListener); }
  viewer.scene.primitives.add(tileset);
  const layer = registerLayer({ name, kind:'3d-tiles', source:'國土測繪中心免申請 3D Tiles', serviceUrl:parsed.href, nationwideAuto, tileset, viewer });
  configureBuildingTileset(layer);
  if (flyTo) await viewer.zoomTo(tileset);
  return layer;
}

export function loadNationalReferenceMap(viewer,{bbox}={}) {
  const existing = listLayers().find(layer => layer.kind === 'national-wms');
  if(existing && !bbox){existing.imageryLayer.show=true;existing.visible=true;return existing;}
  if(existing)removeLayer(existing.id);
  // EMAP2 is the official transparent national map. It shows roads, rail,
  // waterways and labels at the available scale without downloading vectors.
  const provider = new Cesium.WebMapServiceImageryProvider({
    url:'https://wms.nlsc.gov.tw/wms',
    layers:'EMAP2',
    ...(bbox ? {rectangle:Cesium.Rectangle.fromDegrees(bbox.west,bbox.south,bbox.east,bbox.north)} : {}),
    parameters:{ service:'WMS', version:'1.1.1', format:'image/png', transparent:true },
    credit:'內政部國土測繪中心｜臺灣通用電子地圖',
  });
  const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
  imageryLayer.alpha = 0.9;
  return registerLayer({ name:'全臺國土測繪參考圖（道路、鐵路、水系）', kind:'national-wms',
    source:'NLSC EMAP2 WMS；僅供顯示，非分析向量',scopeManaged:true, imageryLayer, viewer });
}
