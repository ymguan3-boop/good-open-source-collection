import {categorizeAnalysisGaps} from './analysisGaps.js';
import * as turf from '@turf/turf';
import {SpatialIndex,safeBox,computeSpatialBatch} from './spatialBatchCore.js';
const cellCache=new Map(),resultCache=new Map();
export const SPATIAL_DEFAULTS={workerFeatureThreshold:5000,workerPolygonThreshold:200,cellMeters:900,concurrency:3,cacheTtlMs:1800000,maxCachedCells:1024,maxQueryCells:20000,maxSummaryCharacters:18000};
export function spatialSettings(){try{return {...SPATIAL_DEFAULTS,...JSON.parse(localStorage.getItem('gev.tw.spatialAnalysis')||'{}')};}catch{return {...SPATIAL_DEFAULTS};}}
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
let retainedWorker=null,workerIdleTimer=null;
function workerBatch(payload,signal,progress){return new Promise((resolve,reject)=>{clearTimeout(workerIdleTimer);const worker=retainedWorker||new Worker(new URL('./spatialAnalysisWorker.js',import.meta.url),{type:'module'});retainedWorker=worker;
  const finish=(value,error)=>{signal?.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null;if(error){worker.terminate();if(retainedWorker===worker)retainedWorker=null;}else workerIdleTimer=setTimeout(()=>{if(retainedWorker===worker){worker.terminate();retainedWorker=null;}},120000);error?reject(error):resolve(value);};
  const abort=()=>finish(null,new DOMException('分析已停止','AbortError'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();worker.onmessage=({data})=>data.progress?progress(data.progress):finish(data.result,data.error?Error(data.error):null);worker.onerror=e=>finish(null,Error(e.message));worker.postMessage(payload);});}
/** Shared cell retrieval, indexed candidate filtering, bounded concurrency, one batch overlay. */
export async function runSpatialEngine({layers,targets,tileSources,buildingQuery,corridorMeters=30,signal,onProgress=()=>{},config={}}){
  const settings={...spatialSettings(),...config},started=performance.now();signal?.throwIfAborted();
  const sourceHash=await hash({version:1,layers:layers.map(l=>({id:l.id,name:l.name,geometry:l.geojson,source:l.serviceUrl,metadata:l.dataMetadata})),targets:targets.map(t=>t.id)}),cacheKey=sourceHash+':'+corridorMeters;
  const cached=resultCache.get(cacheKey);if(cached&&Date.now()-cached.at<settings.cacheTtlMs){onProgress({stage:'快取',completed:1,total:1,message:'來源與參數未變更，已重用完整批次結果。'});return {...structuredClone(cached.result),cacheHit:true,elapsedMs:performance.now()-started};}
  onProgress({stage:'空間索引',completed:0,total:1,message:'建立範圍索引；合併重疊查詢網格，同一網格只讀取一次。'});
  const areas=targets.flatMap(t=>t.areas),areaIndex=new SpatialIndex(areas),cells=new Map(),dy=Math.max(100,Math.min(1200,Number(settings.cellMeters)||900))/111320,dx=dy/Math.cos(24*Math.PI/180);
  let scannedCells=0;
  if(tileSources.length)for(const area of areas){const box=safeBox(area);if(!box)continue;for(let iy=Math.floor(box[1]/dy);iy<=Math.floor(box[3]/dy);iy++)for(let ix=Math.floor(box[0]/dx);ix<=Math.floor(box[2]/dx);ix++){
    if(++scannedCells%256===0){signal?.throwIfAborted();await new Promise(r=>setTimeout(r,0));}const key=ix+':'+iy;if(cells.has(key))continue;const b=[ix*dx,iy*dy,(ix+1)*dx,(iy+1)*dy],polygon=turf.bboxPolygon(b);
    const pieces=[];for(const candidate of areaIndex.search(b)){try{const clipped=turf.intersect(turf.featureCollection([candidate.feature,polygon]));if(clipped)pieces.push(clipped);}catch{/* Invalid zones are reported by the overlay stage. */}}
    if(pieces.length){let geometry;try{geometry=pieces.length===1?pieces[0].geometry:turf.union(turf.featureCollection(pieces)).geometry;}catch{geometry=polygon.geometry;}
      // Query only the selected union inside each shared cell, avoiding unrelated dense city tiles.
      if(JSON.stringify(geometry).length>48000)geometry=polygon.geometry;cells.set(key,geometry);}
    if(cells.size>settings.maxQueryCells)throw Error(`查詢範圍超過 ${settings.maxQueryCells} 個網格；請縮小勾選範圍。已保留原圖資。`);
  }}
  onProgress({stage:'空間索引',completed:1,total:1,message:`範圍索引完成，${areas.length} 個分區合併成 ${cells.size} 個唯一查詢網格。`});
  const geometries=[...cells.values()],buildings=new Map(),warnings=[],sources=new Set(),versions=new Set();let completed=0,complete=true,known=false,cacheHits=0,networkQueries=0,next=0;
  const progress=()=>onProgress({stage:'官方建物批次取得',completed,total:geometries.length,message:`共 ${geometries.length} 個合併網格，已完成 ${completed}，剩餘 ${geometries.length-completed}；快取命中 ${cacheHits}。`});progress();
  await Promise.all(Array.from({length:Math.min(Math.max(1,Math.min(4,settings.concurrency)),geometries.length)},async()=>{while(next<geometries.length){signal?.throwIfAborted();const geometry=geometries[next++],key=JSON.stringify([tileSources,geometry]);try{let entry=cellCache.get(key);if(!entry||Date.now()-entry.at>=settings.cacheTtlMs){networkQueries++;const value=await buildingQuery(geometry);entry={at:Date.now(),value};if(value.buildingCountComplete){cellCache.set(key,entry);if(cellCache.size>settings.maxCachedCells)cellCache.delete(cellCache.keys().next().value);}}else cacheHits++;
    const data=entry.value;complete&&=data.buildingCountComplete===true;known||=Number.isFinite(data.buildingCount);for(const f of data.geojson?.features||[])if(f.geometry?.type==='Point'&&f.properties?.buildingId){buildings.set(String(f.properties.buildingId),f);if(f.properties.modelDate)versions.add(f.properties.modelDate);}for(const url of data.sourceUrls||[])sources.add(url);if(data.buildingWarning)warnings.push(data.buildingWarning);
  }catch(error){signal?.throwIfAborted();complete=false;warnings.push(error.message);}completed++;progress();}}));
  signal?.throwIfAborted();const featureCount=layers.reduce((n,l)=>n+(l.geojson?.features?.length||0),0)+buildings.size,polygonCount=areas.length,useWorker=featureCount>=settings.workerFeatureThreshold||polygonCount>=settings.workerPolygonThreshold;
  onProgress({stage:'批次套疊',completed:0,total:targets.length,message:`資料共 ${featureCount} 筆、${polygonCount} 個分區；${useWorker?'由背景 Worker':'由本機引擎'}執行索引候選篩選與精確套疊。`});
  const payload={layers,targets,buildings:[...buildings.values()],corridorMeters,sourceHash};
  const batch=useWorker?await workerBatch(payload,signal,onProgress):await computeSpatialBatch(payload,onProgress,signal);
  batch.rows=batch.rows.filter(r=>!r.officialBuildings||tileSources.length).map(r=>r.officialBuildings?{...r,count:known?r.count:null,partial:!complete}:r);
  const result={...batch,warnings:[...warnings,...batch.warnings],buildingKnown:known,buildingComplete:complete,buildingCenters:buildings.size,buildingSources:[...sources],buildingVersions:[...versions].sort(),sourceHash,cacheHit:false,engine:{worker:useWorker,polygonCount,featureCount,networkQueries,cacheHits,uniqueQueryCells:geometries.length,method:'packed-bbox-index / exact-overlay / BUILD_ID-dedup',elapsedMs:performance.now()-started}};
  onProgress({stage:'彙整完成',completed:targets.length,total:targets.length,message:`批次套疊與 BUILD_ID 去重完成；精確核對 ${batch.stats.exactChecks} 次，取得 ${batch.rows.length} 項彙整統計。`});
  if(complete&&!batch.stats.invalid){resultCache.set(cacheKey,{at:Date.now(),result:structuredClone(result)});if(resultCache.size>4)resultCache.delete(resultCache.keys().next().value);}return result;
}
export function compactSpatialResult(result,maxCharacters=18000){const summary={calculatedAt:result.calculatedAt,sourceHash:result.sourceHash,corridorMeters:result.corridorMeters,engine:result.engine,cacheHit:result.cacheHit,statisticRules:'rows.count 是去重後相交圖徵數；sources.features 是載入總量，不能替代相交數。沒有官方建物來源時不提供建物計数。',rows:result.rows.slice(0,60),omittedRows:Math.max(0,result.rows.length-60),sources:result.metadata.slice(0,30).map(m=>({name:m.name.slice(0,100),source:String(m.source).slice(0,1000),features:m.features,partial:m.partial})),omittedSources:Math.max(0,result.metadata.length-30),dataGaps:result.gaps||categorizeAnalysisGaps(result.warnings),buildingStatus:result.buildingKnown?(result.buildingComplete?'官方模型範圍查核完整':'官方建物資料部分取得'):'未取得官方建物統計，不可宣稱為零棟'};while(JSON.stringify(summary).length>maxCharacters&&summary.rows.length)summary.rows.pop(),summary.omittedRows++;return summary;}
