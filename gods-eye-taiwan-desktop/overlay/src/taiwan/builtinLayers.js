import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';
import { listLayers, removeLayer } from './layerRegistry.js';

export const BUILTIN_LAYER_CATALOG = Object.freeze([
  {
    id:'osm-roads',
    group:'交通',
    name:'道路中心線',
    description:'主要與一般道路；由目前視窗範圍的 OSM highway 即時拆分。',
    source:'OpenStreetMap / Overpass',
    query:'way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road"]',
    geometry:'line',
    style:{ stroke:'#8fd3ff', strokeWidth:1.35, clampToGround:false },
    officialAlternative:'NLSC WFS:EMAP_ROAD（需申請）',
  },
  {
    id:'osm-rail',
    group:'交通',
    name:'鐵路',
    description:'台鐵、高鐵、捷運、輕軌等線形；由 OSM railway 即時拆分。',
    source:'OpenStreetMap / Overpass',
    query:'way["railway"~"rail|light_rail|subway|tram|narrow_gauge"]',
    geometry:'line',
    style:{ stroke:'#f2c572', strokeWidth:1.7, clampToGround:false },
    officialAlternative:'NLSC WFS:EMAP_RAIL / EMAP_HSRAIL / EMAP_MRT（需申請）',
  },
  {
    id:'osm-waterways',
    group:'水文',
    name:'河川／水系中心線',
    description:'河川、溪流、渠道；由 OSM waterway 即時拆分。',
    source:'OpenStreetMap / Overpass',
    query:'way["waterway"~"river|stream|canal|drain"]',
    geometry:'line',
    style:{ stroke:'#55d6e8', strokeWidth:1.45, clampToGround:false },
    officialAlternative:'NLSC WFS:EMAP_RIVERL（需申請）',
  },
  {
    id:'osm-water',
    group:'水文',
    name:'面狀水域',
    description:'湖泊、水庫、池塘等閉合水域；由 OSM natural=water / water 拆分。',
    source:'OpenStreetMap / Overpass',
    query:'way["natural"="water"];way["water"]',
    geometry:'polygon',
    style:{ stroke:'#4db7d3', fill:'#4db7d3', alpha:0.16, strokeWidth:1, clampToGround:false },
    officialAlternative:'NLSC WFS:EMAP_WATERA / EMAP_RIVERA（需申請）',
  },
  {
    id:'osm-coastline',
    group:'水文',
    name:'海岸線',
    description:'OSM natural=coastline，按目前視窗範圍載入。',
    source:'OpenStreetMap / Overpass',
    query:'way["natural"="coastline"]',
    geometry:'line',
    style:{ stroke:'#8be0eb', strokeWidth:1.2, clampToGround:false },
    officialAlternative:'NLSC WFS:EMAP_COASTLINE（需申請）',
  },
]);

export const OFFICIAL_TAIWAN_VECTOR_REFERENCES = Object.freeze([
  ['道路中心線','WFS:EMAP_ROAD'],
  ['台鐵','WFS:EMAP_RAIL'],
  ['高鐵','WFS:EMAP_HSRAIL'],
  ['捷運','WFS:EMAP_MRT'],
  ['河川','WFS:EMAP_RIVERA'],
  ['河川中線','WFS:EMAP_RIVERL'],
  ['面狀水域','WFS:EMAP_WATERA'],
  ['海岸線','WFS:EMAP_COASTLINE'],
]);

export async function loadBuiltinLayer(id, viewer, { replace=true } = {}) {
  const item = BUILTIN_LAYER_CATALOG.find(x => x.id === id);
  if (!item) throw new Error('找不到內建圖層');
  const bbox = currentBbox(viewer);
  enforceLightweightExtent(bbox);
  const budget = currentBudget();
  const payload = await queryOverpass(item, bbox);
  let geojson = overpassToGeoJSON(payload, item.geometry);

  if (geojson.features.length > budget.maxFeatures) {
    geojson.features = geojson.features.slice(0, budget.maxFeatures);
  }
  if (budget.simplifyTolerance > 0 && geojson.features.length) {
    geojson = turf.simplify(geojson, {
      tolerance:budget.simplifyTolerance,
      highQuality:false,
      mutate:false,
    });
  }
  if (!geojson.features.length) throw new Error('目前視窗範圍沒有此類圖資');

  if (replace) {
    for (const layer of listLayers().filter(l => l.builtinId === item.id)) removeLayer(layer.id);
  }

  return addGeoJSON(geojson, item.name, viewer, {
    ...item.style,
    flyTo:false,
    kind:'builtin-osm',
    metadata:{
      builtinId:item.id,
      source:item.source,
      officialAlternative:item.officialAlternative,
      bbox,
      fetchedAt:new Date().toISOString(),
      featureCount:geojson.features.length,
      lightweight:true,
    },
  });
}

export function currentBuiltinStatus() {
  const loaded = new Map(listLayers().filter(l => l.builtinId).map(l => [l.builtinId, l]));
  return BUILTIN_LAYER_CATALOG.map(item => ({
    ...item,
    loaded:loaded.has(item.id),
    layer:loaded.get(item.id) || null,
  }));
}

function currentBbox(viewer) {
  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rect) throw new Error('目前無法判斷視窗範圍，請先移動到要載入圖資的位置');
  const west = Cesium.Math.toDegrees(rect.west);
  const south = Cesium.Math.toDegrees(rect.south);
  const east = Cesium.Math.toDegrees(rect.east);
  const north = Cesium.Math.toDegrees(rect.north);
  if (![west,south,east,north].every(Number.isFinite) || east <= west) {
    throw new Error('目前視角跨越日期變更線，請縮放到較小範圍再載入');
  }
  return { west, south, east, north };
}

function enforceLightweightExtent(bbox) {
  const width = bbox.east - bbox.west;
  const height = bbox.north - bbox.south;
  const area = width * height;
  if (width > 2.2 || height > 2.2 || area > 2.5) {
    throw new Error('為避免 RAM/GPU 負擔，請先放大到縣市或更小範圍，再載入獨立道路／鐵路／水系圖層');
  }
}

function currentBudget() {
  let name = 'balanced';
  try { name = JSON.parse(localStorage.getItem('gev.tw.resourceProfile') || '{}').name || 'balanced'; } catch {}
  if (name === 'eco') return { maxFeatures:4500, simplifyTolerance:0.00012 };
  if (name === 'performance') return { maxFeatures:16000, simplifyTolerance:0.000025 };
  return { maxFeatures:9000, simplifyTolerance:0.00006 };
}

async function queryOverpass(item, bbox) {
  const box = [bbox.south,bbox.west,bbox.north,bbox.east].map(n => n.toFixed(6)).join(',');
  const clauses = item.query.split(';').map(x => x.trim()).filter(Boolean);
  const query = `[out:json][timeout:25];(\n${clauses.map(c => `  ${c}(${box});`).join('\n')}\n);out tags geom;`;
  const response = await fetch('/api/overpass', {
    method:'POST',
    cache:'no-store',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:`data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.elements)) throw new Error('Overpass 回傳格式不正確');
  return payload;
}

function overpassToGeoJSON(payload, geometryMode) {
  const features = [];
  for (const el of payload.elements || []) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const coords = el.geometry
      .map(p => [Number(p.lon), Number(p.lat)])
      .filter(([x,y]) => Number.isFinite(x) && Number.isFinite(y));
    if (coords.length < 2) continue;

    let geometry;
    if (geometryMode === 'polygon' && coords.length >= 4 && samePoint(coords[0], coords.at(-1))) {
      geometry = { type:'Polygon', coordinates:[coords] };
    } else if (geometryMode === 'polygon') {
      continue;
    } else {
      geometry = { type:'LineString', coordinates:coords };
    }
    features.push({
      type:'Feature',
      id:`osm-way-${el.id}`,
      properties:{ osmId:el.id, ...(el.tags || {}) },
      geometry,
    });
  }
  return { type:'FeatureCollection', features };
}

function samePoint(a,b) {
  return !!a && !!b && Math.abs(a[0]-b[0]) < 1e-10 && Math.abs(a[1]-b[1]) < 1e-10;
}
