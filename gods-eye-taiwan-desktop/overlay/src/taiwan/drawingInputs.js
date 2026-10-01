import * as turf from '@turf/turf';
import { addGeoJSON } from './dataImport.js';
import { getLayer,listLayers,removeLayer } from './layerRegistry.js';
import { sampleGlobalTerrain } from './terrainAnalysis.js';
export function drawingInputs(id){return listLayers().filter(l=>l.kind==='drawing-input'&&l.bufferSourceId===id&&l.dataMetadata?.input);}
export function invalidateDrawing(id){
  const l=getLayer(id);if(l?.kind!=='annotation')return;const m=l.dataMetadata?.measurement||{};
  const result=Object.fromEntries(['mode','name','lengthMeters','areaM2','radiusMeters','center'].filter(k=>k in m).map(k=>[k,m[k]]));
  result.analysisStatus='請確認圖資後再分析';l.dataMetadata={...l.dataMetadata,measurement:result,analysisInputsConfirmed:false};l.geojson.features[0].properties={...result};l.aiReports=[];
  for(const old of listLayers().filter(c=>c.kind==='building-analysis' && c.bufferSourceId===id))removeLayer(old.id);
  for(const input of drawingInputs(id))for(const child of listLayers().filter(c=>c.bufferSourceId===input.id))removeLayer(child.id);
}
export async function attachDrawingInput(id,source,viewer,{signal}={}){
  const parent=getLayer(id);if(!parent?.geojson?.features[0])throw new Error('找不到繪製範圍');
  if(drawingInputs(id).some(l=>l.dataMetadata.input.sourceId===source.id || (source.serviceUrl && l.dataMetadata.input.serviceUrl===source.serviceUrl)))return;
  signal?.throwIfAborted();const f=parent.geojson.features[0],area=f.geometry.type==='LineString'?turf.buffer(f,30,{units:'meters'}):f,box=turf.bbox(area);
  let selected=0,partial=!!source.dataMetadata?.partial;
  const fc=source.geojson?{...source.geojson,features:source.geojson.features.filter(item=>{try{const b=item.bbox||turf.bbox(item);if(b[2]<box[0]||b[0]>box[2]||b[3]<box[1]||b[1]>box[3]||!turf.booleanIntersects(item,area))return false;if(++selected>20000){partial=true;return false;}return true;}catch{partial=true;return false;}})}:null;
  const input={sourceId:source.id,sourceFeatureCount:source.geojson?.features?.length ?? null,kind:source.kind,serviceUrl:source.serviceUrl||null,sourceKey:source.sourceKey||null,name:source.name,confirmedAt:new Date().toISOString(),partial,selectionRule:source.sourceKey==='official-dtm-2025'?'官方20m原始格網分析；畫面樣點僅作參照':fc?'相交圖徵選取，保留原始幾何；路徑使用30m走廊':'已載入服務參照；影像不是分析向量',sourceMetadata:source.dataMetadata||{}};
  const metadata={bufferSourceId:id,source:source.source||'已載入圖資',description:input.selectionRule,dataMetadata:{input}};
  const child=await addGeoJSON(fc || {type:'FeatureCollection',features:[]},source.name,viewer,{...source.style,kind:'drawing-input',flyTo:false,metadata});
  if(source.kind==='world-terrain')child.referenceTerrainProvider=source.terrainProvider;
  if(signal?.aborted || getLayer(id)!==parent){removeLayer(child.id);signal?.throwIfAborted();throw new Error('繪製範圍已變更');}invalidateDrawing(id);return child;
}
export function confirmDrawingInputs(id){const l=getLayer(id),inputs=drawingInputs(id).filter(c=>c.visible!==false);if(!l||!inputs.length)throw new Error('請加入至少一項圖資並開啟');l.dataMetadata={...l.dataMetadata,analysisInputsConfirmed:true};l.dataMetadata.measurement={...l.dataMetadata.measurement,analysisStatus:'圖資已確認，尚未計算',inputs:inputs.map(c=>({id:c.id,name:c.name,kind:c.dataMetadata.input.kind,source:c.source,featureCount:['3d-tiles','basemap','national-wms','world-terrain','live-reference'].includes(c.dataMetadata.input.kind) || c.dataMetadata.input.sourceKey==='official-dtm-2025' ? null : c.geojson?.features.length??null}))};}
export async function analyzeDrawingInputs(id,viewer,{signal,onProgress=()=>{}}={}){
  const parent=getLayer(id);if(!parent?.dataMetadata?.analysisInputsConfirmed)throw new Error('請先確認這個繪製圖層下的分析圖資');
  const inputs=drawingInputs(id).filter(l=>l.visible!==false),f=parent.geojson.features[0],dtm=inputs.filter(l=>l.dataMetadata.input.kind==='dtm'),tiles=inputs.filter(l=>l.dataMetadata.input.kind==='3d-tiles');
  if(!inputs.length)throw new Error('請開啟至少一項分析圖資並重新確認');
  let elevation={dtmSamples:0,dtmWarning:dtm.length?null:'未加入DTM，未進行高程計算'};
  if(dtm.some(l=>l.dataMetadata.input.sourceKey==='official-dtm-2025')){
    onProgress('正在讀取已確認的官方20m DTM…');const r=await fetch('/api/taiwan/dtm-2025/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry:f.geometry}),signal});elevation=await r.json();if(!r.ok)throw new Error(elevation.error||'DTM計算失敗');
  }else if(dtm.length){
    const area=f.geometry.type==='LineString'?turf.buffer(f,30,{units:'meters'}):f,unique=new Map();
    for(const l of dtm)for(const s of l.geojson?.features||[])if(s.geometry?.type==='Point'&&s.properties?.height!=null&&Number.isFinite(Number(s.properties.height))&&turf.booleanPointInPolygon(s,area))unique.set(s.geometry.coordinates.join(','),Number(s.properties.height));
    const h=[...unique.values()];elevation={dtmSamples:h.length,minHeightMeters:h.length?Math.min(...h):null,maxHeightMeters:h.length?Math.max(...h):null,meanHeightMeters:h.length?h.reduce((a,b)=>a+b,0)/h.length:null,heightSource:'手動確認的匯入DTM樣點',dtmWarning:'僅計已加入樣點，非完整格網'};
  }else if(inputs.some(l=>l.dataMetadata.input.kind==='world-terrain')){
    onProgress('正在取樣已確認的全球地形高程…');
    const source=inputs.find(l=>l.dataMetadata.input.kind==='world-terrain');
    elevation=await sampleGlobalTerrain(viewer,f,{signal,provider:source.referenceTerrainProvider||viewer.terrainProvider});
  }
  let building={buildingCount:null,buildingCountComplete:false,buildingWarning:'未加入可計數的建物圖資，棟數未知'},geojson;
  if(f.geometry.type==='Polygon'&&tiles.length){
    onProgress('正在計算手動確認的NLSC分棟建物…');const r=await fetch('/api/taiwan/nlsc-buildings/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry:f.geometry,serviceUrls:tiles.map(l=>l.dataMetadata.input.serviceUrl).filter(Boolean).slice(0,4)}),signal});const value=await r.json();if(!r.ok)throw new Error(value.error||'建物計算失敗');({geojson,...building}=value);
  }else if(f.geometry.type==='Polygon'){
    const vector=inputs.filter(l=>l.geojson&&/建物|building/i.test(`${l.name} ${l.dataMetadata.input.kind}`));
    if(vector.some(l=>l.dataMetadata.input.sourceFeatureCount>0 || l.geojson.features.length>0)){const unique=new Set();for(const l of vector)for(const item of l.geojson.features)try{if(turf.booleanIntersects(item,f))unique.add(String(item.properties?.BUILD_ID||item.properties?.buildingId||item.properties?.osmId||`${l.dataMetadata.input.sourceId}:${JSON.stringify(item.geometry)}`));}catch{}
      building={buildingCount:unique.size,buildingCountComplete:!vector.some(l=>l.dataMetadata.input.partial),buildingSource:vector.map(l=>l.name).join('、'),buildingCountRule:'已加入向量與範圍相交、依識別碼去重',buildingCoverage:'僅代表已加入圖資涵蓋',buildingWarning:null};}
  }
  signal?.throwIfAborted();if(getLayer(id)!==parent||!parent.dataMetadata.analysisInputsConfirmed)throw new Error('分析圖資已變更，請重新確認');
  for(const l of inputs)for(const c of listLayers().filter(c=>c.bufferSourceId===l.id))removeLayer(c.id);
  if(geojson?.features.length){const l=await addGeoJSON(geojson,'範圍內建物中心（NLSC去重）',viewer,{stroke:'#c4b5fd',fill:'#c4b5fd',circleRadius:2,flyTo:false,kind:'building-analysis',metadata:{bufferSourceId:tiles[0].id,source:building.buildingSource,dataMetadata:{countRule:building.buildingCountRule,coverage:building.buildingCoverage}}});if(signal?.aborted || getLayer(id)!==parent || !parent.dataMetadata.analysisInputsConfirmed || !getLayer(tiles[0].id)){removeLayer(l.id);signal?.throwIfAborted();throw new Error('分析圖資已變更，請重新確認');}}
  signal?.throwIfAborted();if(getLayer(id)!==parent || !parent.dataMetadata.analysisInputsConfirmed)throw new Error('分析圖資已變更，請重新確認');
  const result={...parent.dataMetadata.measurement,...elevation,...building,analysisStatus:'已依確認圖資完成計算',status:'計算完成',calculatedAt:new Date().toISOString()};parent.dataMetadata.measurement=result;f.properties={...result};return {...result,layerId:id};
}
