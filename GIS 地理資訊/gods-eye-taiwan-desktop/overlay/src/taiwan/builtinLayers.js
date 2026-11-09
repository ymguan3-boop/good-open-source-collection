import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';
import { attachViewportLines } from './viewportLines.js';
import { listLayers, removeLayer } from './layerRegistry.js';
import { ensureCounties,dataScope,scopeLabel,scopeGeometry,scopeBounds,countyNames,filterToCounty,filterToCountyAsync } from './dataScope.js';
import nationalSnapshot from './data/osm-national-metadata.json';
const nationalFiles={
  'osm-roads':new URL('./data/osm-roads-national.geojson.gz',import.meta.url),
  'osm-waterways':new URL('./data/osm-waterways-national.geojson.gz',import.meta.url),
  'osm-water':new URL('./data/osm-water-national.geojson.gz',import.meta.url),
  'osm-coastline':new URL('./data/osm-coastline-national.geojson.gz',import.meta.url),
};

export const BUILTIN_LAYER_CATALOG = Object.freeze([
  {id:'admin-counties',group:'行政區界',name:'縣市界',description:'國土測繪中心22縣市行政界，含外島；可選縣市或全台，框線可改色。非地籍界址。',source:'國土測繪中心開放資料 · 縣市界2020/8版',geometry:'polygon',style:{stroke:'#ffdf66',fill:'#ffdf66',alpha:0,strokeWidth:2,clampToGround:true}},
  {id:'admin-towns',group:'行政區界',name:'鄉鎮市區界',description:'國土測繪中心鄉鎮市區行政界；可選縣市或全台，框線可改色。非地籍界址。',source:'國土測繪中心開放資料 · 鄉鎮市區界2023/3/23版',geometry:'polygon',style:{stroke:'#ce8dff',fill:'#ce8dff',alpha:0,strokeWidth:1.5,clampToGround:true}},
  {
    id:'osm-roads',
    group:'交通',
    name:'道路中心線',
    description:'內建全臺道路與交流道匝道固定版；可按縣市或全臺載入，更新時查詢線上來源。',
    source:'OpenStreetMap / Geofabrik 固定版；Overpass 線上更新',
    query:'way["highway"~"motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|service|road"]',
    geometry:'line',
    style:{ stroke:'#ff875e', strokeWidth:1.8, clampToGround:true },
    officialAlternative:'NLSC WFS:EMAP_ROAD（需申請）',
  },
  {
    id:'osm-rail',
    group:'交通',
    name:'鐵路',
    description:'台鐵、高鐵、捷運、輕軌官方線型；已內建全臺固定版本，可離線載入。',
    source:'國土測繪中心開放資料（2026-09-30 下載）',
    query:'way["railway"~"rail|light_rail|subway|tram|narrow_gauge"]',
    geometry:'line',
    style:{ stroke:'#f6cb4f', strokeWidth:2, clampToGround:true },
    officialAlternative:'RAIL／MRT／LRT 1150409；高鐵 1130417（固定版本、非即時營運資訊）',
  },
  {
    id:'osm-waterways',
    group:'水文',
    name:'河川／水系中心線',
    description:'內建全臺河川、溪流與渠道固定版；可按縣市或全臺載入，更新時查詢線上來源。',
    source:'OpenStreetMap / Geofabrik 固定版；Overpass 線上更新',
    query:'way["waterway"~"river|stream|canal|drain"]',
    geometry:'line',
    style:{ stroke:'#23b9ef', strokeWidth:1.8, clampToGround:true },
    officialAlternative:'NLSC WFS:EMAP_RIVERL（需申請）',
  },
  {
    id:'osm-water',
    group:'水文',
    name:'面狀水域',
    description:'內建湖泊、水庫與池塘固定版，含多重多邊形及孔洞；可按縣市或全臺載入。',
    source:'OpenStreetMap / Geofabrik 固定版；Overpass 線上更新',
    query:'way["natural"="water"];way["water"]',
    geometry:'polygon',
    style:{ stroke:'#356df3', fill:'#356df3', alpha:0.28, strokeWidth:1.4, clampToGround:true },
    officialAlternative:'NLSC WFS:EMAP_WATERA / EMAP_RIVERA（需申請）',
  },
  {
    id:'osm-coastline',
    group:'水文',
    name:'海岸線',
    description:'內建全臺及外島海岸線固定版；保留原始線型，與縣市界比對採約百公尺海岸容差。',
    source:'OpenStreetMap / Geofabrik 固定版；Overpass 線上更新',
    query:'way["natural"="coastline"]',
    geometry:'line',
    style:{ stroke:'#b788ff', strokeWidth:1.7, clampToGround:true },
    officialAlternative:'NLSC WFS:EMAP_COASTLINE（需申請）',
  },
]);

const YILAN_COAST_BBOX = Object.freeze({ west:121.45, south:24.28, east:122.12, north:25.05 });

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

export async function loadBuiltinLayer(id, viewer, { replace=true, signal, bbox:requestedBbox } = {}) {
  const item = BUILTIN_LAYER_CATALOG.find(x => x.id === id);
  if (!item) throw new Error('找不到內建圖層');
  if(id.startsWith('admin-'))return loadScopedBuiltinLayer(id,viewer,{signal});
  if (id === 'osm-rail') {
    const response = await fetch(new URL('./data/taiwan-rail.geojson',import.meta.url), { signal });
    if (!response.ok) throw new Error(`內建官方鐵路檔案載入失敗：${response.status}`);
    const geojson = await response.json();
    signal?.throwIfAborted();
    if (replace) for (const layer of listLayers().filter(l=>l.builtinId===id)) removeLayer(layer.id);
    return addGeoJSON(geojson,item.name,viewer,{...item.style,flyTo:false,kind:'builtin-official',metadata:{
      builtinId:id,source:item.source,description:item.description,sourceKey:'nlsc-national-rail',
      dataMetadata:geojson.metadata,featureCount:geojson.features.length,fetchedAt:geojson.metadata.downloadedAt,
    }});
  }
  const viewBbox = requestedBbox || currentBbox(viewer);
  const bbox = id === 'osm-coastline' && viewBbox.east - viewBbox.west < 0.8
    && viewBbox.north - viewBbox.south < 0.8 && intersects(viewBbox, YILAN_COAST_BBOX)
    ? YILAN_COAST_BBOX : viewBbox;
  enforceLightweightExtent(bbox);
  const budget = currentBudget();
  const payload = await queryOverpass(item, bbox, signal);
  signal?.throwIfAborted();
  return addBuiltinResult(item, viewer, bbox, budget, payload, { replace });
}

export async function loadScopedBuiltinLayer(id,viewer,{signal,onProgress=()=>{},fresh=false}={}) {
  await ensureCounties();const selection=dataScope();const names=selection.mode === 'taiwan' ? countyNames().sort((a,b)=>Number(['連江縣','金門縣','澎湖縣'].includes(a))-Number(['連江縣','金門縣','澎湖縣'].includes(b))) : [selection.county];
  const item=BUILTIN_LAYER_CATALOG.find(entry=>entry.id === id);if(!item)throw new Error('找不到圖資');
  if(id.startsWith('admin-')){
    const url=id==='admin-counties'?new URL('./data/taiwan-counties.geojson',import.meta.url):new URL('./data/taiwan-towns.geojson.gz',import.meta.url);
    const response=await fetch(url,{signal});if(!response.ok)throw new Error('內建行政界讀取失敗');
    const stream=id==='admin-towns'&&!/gzip/i.test(response.headers.get('content-encoding')||'')?response.body.pipeThrough(new DecompressionStream('gzip')):response.body;
    let fc=await new Response(stream).json();signal?.throwIfAborted();
    if(selection.mode==='county')fc={...fc,features:fc.features.filter(f=>f.properties.COUNTYNAME===selection.county)};
    return addGeoJSON(fc,`${item.name}｜${scopeLabel()}`,viewer,{...item.style,customized:true,flyTo:false,kind:'builtin-official',metadata:{builtinId:id,sourceKey:id,source:item.source,description:item.description,scopeManaged:true,dataMetadata:{...fc.metadata,scope:selection}}});
  }
  if(id === 'osm-rail') {
    const response=await fetch(new URL('./data/taiwan-rail.geojson',import.meta.url),{signal});if(!response.ok)throw new Error('官方鐵路檔案讀取失敗');
    let fc=await response.json();if(selection.mode === 'county')fc=filterToCounty(fc,selection.county);
    const layer=await addGeoJSON(fc,`${item.name}｜${scopeLabel()}`,viewer,{...item.style,flyTo:false,kind:'builtin-official',metadata:{builtinId:id,sourceKey:'nlsc-national-rail',source:item.source,description:item.description,scopeManaged:true,dataMetadata:{...fc.metadata,scope:selection}}});
    if(signal?.aborted){removeLayer(layer.id);signal.throwIfAborted();}
    for(const old of listLayers().filter(old=>old.id !== layer.id && old.builtinId === id))removeLayer(old.id);
    return layer;
  }
  if(nationalFiles[id]&&!fresh){
    onProgress(`${item.name}：讀取內建全臺固定版（${nationalSnapshot.sourceTimestamp}），不需金鑰或線上分區查詢…`);
    const response=await fetch(nationalFiles[id],{signal});if(!response.ok)throw new Error('內建全臺圖資讀取失敗，請重新安裝圖資檔案');
    const stream=/gzip/i.test(response.headers.get('content-encoding')||'')?response.body:response.body.pipeThrough(new DecompressionStream('gzip'));
    let fc=await new Response(stream).json();signal?.throwIfAborted();
    if(selection.mode==='county')fc={...fc,features:fc.features.filter(feature=>feature.properties.snapshotCounties.includes(selection.county))};
    if(!fc.features.length)throw new Error('此縣市的固定版來源沒有這類圖徵');
    const layer=await addGeoJSON(fc,`${item.name}｜${scopeLabel()}`,viewer,{...item.style,flyTo:false,signal,viewportLines:item.geometry==='line',renderFeatureLimit:item.geometry==='line'?undefined:currentBudget().maxFeatures,kind:'builtin-osm',metadata:{builtinId:id,sourceKey:id,source:'OpenStreetMap / Geofabrik 全臺固定版',description:item.description,scopeManaged:true,dataMetadata:{...nationalSnapshot,layers:undefined,layerVersion:nationalSnapshot.layers[id],scope:selection,partial:false,loading:false,renderingNote:'保留完整固定版向量；線型依視野與道路／水系分類載入，街區視野顯示所有相交線段，不均勻抽樣'}}});
    if(signal?.aborted){removeLayer(layer.id);signal.throwIfAborted();}
    return layer;
  }
  const unique=new Map(),errors=[],jobs=new Map();
  // Split each land polygon, rather than using a county bbox spanning remote islands.
  // All counties are scheduled; no global feature cap ends the run at an early county.
  for(const county of names){const span=['連江縣','金門縣','澎湖縣'].includes(county) ? .08 : id==='osm-roads' ? .35 : .65;const region=scopeGeometry(county),parts=region.geometry.type==='MultiPolygon'?region.geometry.coordinates:[region.geometry.coordinates];
    for(const coordinates of parts){const polygon=turf.polygon(coordinates),box=turf.bbox(polygon);
      for(let west=Math.floor(box[0]/span)*span;west<box[2];west+=span)for(let south=Math.floor(box[1]/span)*span;south<box[3];south+=span){const bbox={west:+Math.max(west,box[0]).toFixed(5),south:+Math.max(south,box[1]).toFixed(5),east:+Math.min(west+span,box[2]).toFixed(5),north:+Math.min(south+span,box[3]).toFixed(5)};
        if(bbox.east<=bbox.west || bbox.north<=bbox.south)continue;
        if(!turf.booleanIntersects(turf.bboxPolygon([bbox.west,bbox.south,bbox.east,bbox.north]),polygon))continue;
        const key=[west.toFixed(5),south.toFixed(5),span].join(',');if(!jobs.has(key))jobs.set(key,{bbox,counties:new Set()});else {const target=jobs.get(key).bbox;target.west=Math.min(target.west,bbox.west);target.south=Math.min(target.south,bbox.south);target.east=Math.max(target.east,bbox.east);target.north=Math.max(target.north,bbox.north);}jobs.get(key).counties.add(county);
      }
    }
  }
  let completed=0,finished=0,timestamp=null,stalePartitions=0,layer=null,commit=Promise.resolve(),removed=false;
  const notify=()=>window.dispatchEvent(new CustomEvent('gev-tw:layers-changed',{detail:listLayers()}));
  const checkActive=()=>{signal?.throwIfAborted();if(removed || (layer&&!listLayers().includes(layer))){removed=true;throw new DOMException('圖層已刪除，停止載入','AbortError');}};
  const renderedIds=new Set(),renderLimit=Math.min(currentBudget().maxFeatures,12000),quota=Math.max(1,Math.floor(renderLimit/jobs.size));
  const metadata=(done=false)=>({scope:selection,partial:!done||!!errors.length,loading:!done,totalPartitions:jobs.size,completedPartitions:finished-errors.length,stalePartitions,warnings:[...errors],sourceTimestamp:timestamp,fetchedAt:new Date().toISOString(),renderingNote:`保留完整取得向量；畫面每分區均勻繪出，總預算${renderLimit}筆`});
  async function displayChunk(features){
    commit=commit.catch(()=>{}).then(async()=>{
      checkActive();if(!unique.size)return;
      if(!layer){layer=await addGeoJSON({type:'FeatureCollection',features:[]},`${item.name}｜${scopeLabel()}`,viewer,{...item.style,flyTo:false,kind:'builtin-osm',metadata:{builtinId:id,sourceKey:id,source:item.source,description:item.description,scopeManaged:true,dataMetadata:metadata()}});
        if(signal?.aborted){removeLayer(layer.id);layer=null;signal.throwIfAborted();}
        for(const old of listLayers().filter(old=>old.id!==layer.id&&old.builtinId===id))removeLayer(old.id);
      }
      const fresh=features.filter(f=>!renderedIds.has(f.properties.osmId)),stride=Math.max(1,Math.ceil(fresh.length/quota));
      const sample=fresh.filter((_,index)=>index%stride===0).slice(0,Math.max(0,renderLimit-renderedIds.size));
      if(sample.length){const ds=await Cesium.GeoJsonDataSource.load({type:'FeatureCollection',features:sample},{clampToGround:true,stroke:Cesium.Color.fromCssColorString(item.style.stroke),fill:Cesium.Color.fromCssColorString(item.style.fill||item.style.stroke).withAlpha(item.style.alpha??.18),strokeWidth:item.style.strokeWidth});checkActive();
        layer.dataSource.entities.suspendEvents();try{for(const entity of [...ds.entities.values])if(!layer.dataSource.entities.getById(entity.id)){ds.entities.remove(entity);layer.dataSource.entities.add(entity);}}finally{layer.dataSource.entities.resumeEvents();}
        sample.forEach(f=>renderedIds.add(f.properties.osmId));
      }
      layer.geojson={type:'FeatureCollection',features:[...unique.values()]};layer.dataMetadata=metadata();layer.renderedFeatureCount=renderedIds.size;viewer.scene.requestRender();notify();
    });return commit;
  }
  const queue=[...jobs.values()];
  async function worker(){for(;;){const job=queue.shift();if(!job)return;
    checkActive();let counted=false;onProgress(`${item.name}：分區 ${++completed}/${jobs.size}，已取得 ${unique.size} 筆；${errors.length} 區未完成`);
    try{
      const payload=await queryOverpass(item,job.bbox,signal);
      if(payload.remark)throw new Error(`來源查詢不完整：${payload.remark}`);
      timestamp=payload.osm3s?.timestamp_osm_base||timestamp;if(payload.gevCache==='STALE')stalePartitions++;
      const all=overpassToGeoJSON(payload,item.geometry,el=>matchesBuiltin(id,el.tags||{}));
      const chunk=new Map();for(const county of job.counties){const selected=await filterToCountyAsync(all,county,{bbox:job.bbox,signal});for(const feature of selected.features){const key=feature.properties.osmId||JSON.stringify(feature.geometry);unique.set(key,feature);chunk.set(key,feature);}}
      finished++;counted=true;await displayChunk([...chunk.values()]);
    }catch(error){checkActive();if(!counted)finished++;errors.push(`${[...job.counties].join('、')}分區 ${Object.values(job.bbox).join(',')}：${error.message}`);}
  }
  }
  try{
    await Promise.all([worker(),worker()]);await commit;signal?.throwIfAborted();
    if(!layer)throw new Error(`全範圍 ${jobs.size} 個分區均未取得可用資料。${errors.slice(0,3).join('；')}`);
    layer.dataMetadata=metadata(true);
    if(item.geometry==='line'){layer.dataSource.entities.removeAll();await attachViewportLines(layer,{signal});layer.dataMetadata.renderingNote='線上已取得的完整線段依視野顯示；街區顯示所有相交線段，來源失敗分區仍標示缺漏。';}
    notify();return layer;
  }catch(error){if(layer&&!removed){layer.geojson={type:'FeatureCollection',features:[...unique.values()]};layer.dataMetadata={...metadata(),loading:false,stopped:signal?.aborted===true};notify();}throw error;}

}

export async function loadAllBuiltinLayers(viewer, { bbox=currentBbox(viewer), signal, onProgress } = {}) {
  const results = [];
  for (const [index,item] of BUILTIN_LAYER_CATALOG.entries()) {
    signal?.throwIfAborted();
    onProgress?.({ phase:'loading', id:item.id, name:item.name, index:index+1, total:BUILTIN_LAYER_CATALOG.length });
    try {
      // Dense combined Overpass queries commonly return 502. Fetch categories
      // independently so one unavailable service does not discard the others.
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(35000)].filter(Boolean));
      const layer = await loadBuiltinLayer(item.id, viewer, { bbox, signal:requestSignal });
      results.push({ id:item.id, name:item.name, count:layer.geojson?.features?.length ?? 0 });
    } catch (error) {
      signal?.throwIfAborted();
      results.push({ id:item.id, name:item.name, error:error?.name === 'TimeoutError' ? '公開來源超過 35 秒未回應' : error?.message || String(error) });
    }
    onProgress?.({ phase:'complete', ...results.at(-1), index:index+1, total:BUILTIN_LAYER_CATALOG.length });
  }
  return results;
}

async function addBuiltinResult(item, viewer, bbox, budget, payload, { replace=true } = {}) {
  let geojson = overpassToGeoJSON(payload, item.geometry, el => matchesBuiltin(item.id, el.tags || {}));

  if (!geojson.features.length) throw new Error('目前視窗範圍沒有此類圖資');

  if (replace) {
    for (const layer of listLayers().filter(l => l.builtinId === item.id)) removeLayer(layer.id);
  }

  return addGeoJSON(geojson, item.name, viewer, {
    ...item.style,
    flyTo:false,
    viewportLines:item.geometry==='line',
    renderFeatureLimit:item.geometry==='line'?undefined:budget.maxFeatures,
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

function matchesBuiltin(id, tags) {
  if (id === 'osm-roads') return /^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|service|road)$/.test(tags.highway || '');
  if (id === 'osm-rail') return /^(rail|light_rail|subway|tram|narrow_gauge)$/.test(tags.railway || '');
  if (id === 'osm-waterways') return /^(river|stream|canal|drain)$/.test(tags.waterway || '');
  if (id === 'osm-water') return tags.natural === 'water' || Boolean(tags.water);
  if (id === 'osm-coastline') return tags.natural === 'coastline';
  return false;
}

export function currentBuiltinStatus() {
  const loaded = new Map(listLayers().filter(l => l.builtinId).map(l => [l.builtinId, l]));
  return BUILTIN_LAYER_CATALOG.map(item => ({
    ...item,
    loaded:loaded.has(item.id),
    layer:loaded.get(item.id) || null,
  }));
}

export function assertBuiltinLoadExtent(viewer) {
  enforceLightweightExtent(currentBbox(viewer));
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

async function queryOverpass(item, bbox, signal, splitAttempt=false) {
  const box = [bbox.south,bbox.west,bbox.north,bbox.east].map(n => n.toFixed(6)).join(',');
  const clauses = item.query.split(';').map(x => x.trim()).filter(Boolean);
  const query = `[out:json][timeout:25];(\n${clauses.map(c => `  ${c}(${box});`).join('\n')}\n);out tags geom;`;
  const response = await fetch('/api/overpass', {
    method:'POST',
    cache:'no-store',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'X-GEV-Force-Refresh':'1' },
    body:`data=${encodeURIComponent(query)}`,
    signal:AbortSignal.any([signal,AbortSignal.timeout(120000)].filter(Boolean)),
  });
  if (!response.ok) {
    // Busy public mirrors often refuse a dense viewport. Retry once as four
    // smaller requests, preserving the exact requested extent and OSM IDs.
    if (!splitAttempt && [413].includes(response.status) &&
        bbox.east - bbox.west > 0.04 && bbox.north - bbox.south > 0.04) {
      const midLon = (bbox.west + bbox.east) / 2;
      const midLat = (bbox.south + bbox.north) / 2;
      const tiles = [
        { west:bbox.west, east:midLon, south:bbox.south, north:midLat },
        { west:midLon, east:bbox.east, south:bbox.south, north:midLat },
        { west:bbox.west, east:midLon, south:midLat, north:bbox.north },
        { west:midLon, east:bbox.east, south:midLat, north:bbox.north },
      ];
      const elements = new Map();
      for (const tile of tiles) {
        signal?.throwIfAborted();
        const payload = await queryOverpass(item, tile, signal, true);
        for (const element of payload.elements) elements.set(`${element.type}/${element.id}`, element);
      }
      return { elements:[...elements.values()] };
    }
    const hint = [406,429,502,503,504].includes(response.status)
      ? '；公開來源暫時拒絕，請縮小視窗或稍後按更新'
      : '';
    throw new Error(`Overpass HTTP ${response.status}${hint}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.elements)) throw new Error('Overpass 回傳格式不正確');
  payload.gevCache=response.headers.get('X-Overpass-Cache');
  return payload;
}

function overpassToGeoJSON(payload, geometryMode, matches=()=>true) {
  const features = [];
  for (const el of payload.elements || []) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    if (!matches(el)) continue;
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

function intersects(a,b) {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}
