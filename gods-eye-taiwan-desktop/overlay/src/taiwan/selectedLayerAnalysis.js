import {categorizeAnalysisGaps,analysisGapsMarkdown} from './analysisGaps.js';
import {runSpatialEngine,compactSpatialResult} from './spatialAnalysisEngine.js';

const cell=v=>String(v??'未提供').replaceAll('|','／').replace(/\r?\n/g,' ');
export const markdownTable=(headers,rows)=>[headers,headers.map(()=> '---'),...rows].map(r=>'| '+r.map(cell).join(' | ')+' |').join('\n');
export function visibleAnalysisLayers(layers){
  const byId=new Map(layers.map(l=>[l.id,l]));
  return layers.filter(l=>{const seen=new Set();for(let p=l;p;p=byId.get(p.bufferSourceId)||layers.find(l=>p.parentSourceKey&&(l.sourceKey||l.sourceProjectKey)===p.parentSourceKey)){if(p.visible===false||seen.has(p.id))return false;seen.add(p.id);}return true;});
}
/** The UI never calculates per feature or asks the LLM to perform geometry operations. */
export async function analyzeSelectedLayers(all,{signal,onProgress=()=>{},corridorMeters=30,buildingQuery,config}={}){
  const layers=visibleAnalysisLayers(all).map(l=>({id:l.id,name:l.name,kind:l.kind,geojson:l.geojson,serviceUrl:l.serviceUrl,source:l.source,dataMetadata:{partial:l.dataMetadata?.partial,loading:l.dataMetadata?.loading,sourceTimestamp:l.dataMetadata?.sourceTimestamp}}));
  if(!layers.length)throw Error('請先開啟要分析的圖資。');
  const polygons=layers.filter(l=>l.geojson?.features?.some(f=>/^(Multi)?Polygon$/.test(f.geometry?.type))),preferred=polygons.filter(l=>/高改善潛力/.test(l.name));
  const targets=(preferred.length?preferred:polygons).map(l=>({id:l.id,name:l.name,areas:l.geojson.features.filter(f=>/^(Multi)?Polygon$/.test(f.geometry?.type))}));
  const buildingLayers=layers.filter(l=>l.kind==='3d-tiles'&&/建物|building/i.test(l.name)),tileSources=[...new Set(buildingLayers.map(l=>l.serviceUrl).filter(Boolean))],warnings=[];
  if(!targets.length)warnings.push('沒有勾選面圖資；不能計算範圍內數量。');
  if(tileSources.length>4)warnings.push('官方建物來源超過四項，本次僅處理前四项，結果為部分資料。');
  if(buildingLayers.some(l=>!l.serviceUrl))warnings.push('部分建物圖層缺少官方來源，無法統計該來源。');
  const query=buildingQuery|| (async geometry=>{const r=await fetch('/api/taiwan/nlsc-buildings/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry,serviceUrls:tileSources.slice(0,4)}),signal});const data=await r.json();if(!r.ok)throw Error(data.error||'官方建物統計失敗');return data;});
  const batch=await runSpatialEngine({layers,targets,tileSources:tileSources.slice(0,4),buildingQuery:query,corridorMeters,signal,onProgress,config});
  const metadata=layers.map(l=>({id:l.id,name:l.name,kind:l.kind,source:l.source||l.serviceUrl||'來源未註記',features:l.geojson?.features?.length??null,sourceTimestamp:l.dataMetadata?.sourceTimestamp,partial:!!(l.dataMetadata?.partial||l.dataMetadata?.loading)}));
  for(const m of metadata)if(!m.features&&m.kind!=='3d-tiles')warnings.push(`${m.name} 為服務參照，沒有可分析向量；不能從畫面推算數量。`);
  const incomplete=tileSources.length>4||buildingLayers.some(l=>!l.serviceUrl);
  if(incomplete){batch.buildingComplete=false;for(const row of batch.rows)if(row.officialBuildings)row.partial=true;}
  const result={...batch,calculatedAt:new Date().toISOString(),corridorMeters,metadata,warnings:[...warnings,...batch.warnings],targetNames:targets.map(t=>t.name)};
  result.gaps=categorizeAnalysisGaps(result.warnings);result.compact=compactSpatialResult(result);result.markdown=spatialAnalysisMarkdown(result);return result;
}
export function spatialAnalysisMarkdown(r){return `## 勾選圖資整合分析\n\n摘要：本次納入 ${r.metadata.length} 個顯示圖層；範圍採${r.targetNames.join('、')||'未勾選面圖資'}。\n\n${markdownTable(['分析範圍','圖資／條件','數量','單位','涵蓋'],r.rows.map(x=>[x.target,x.layer,x.count??'未知',x.unit,x.partial?'部分資料／待查核':'已載入來源範圍']))}\n\n### 計算依據\n\n- 點、線、面圖徵以範圍相交計算，依來源識別碼／幾何去重；線圖徵數不等於營運路線數，站點群不等於站牌數。\n- NLSC 建物以官方 BUILD_ID 去重及建物中心落在範圍內計數，非屋頂或建物足跡相交；只代表該模型版本。\n- 自行車道兩側各 ${r.corridorMeters} 公尺，以範圍內建物中心至所選線圖徵的地表距離判定，非道路工程安全結論。\n- 計算時間：${r.calculatedAt}。\n- 批次引擎：${r.engine?.method}；${r.engine?.polygonCount} 個分區、${r.engine?.featureCount} 筆圖徵；候選 ${r.stats?.candidates} 筆、精確核對 ${r.stats?.exactChecks} 次。官方網格 ${r.engine?.uniqueQueryCells} 個、網路查詢 ${r.engine?.networkQueries} 次、快取 ${r.engine?.cacheHits} 次${r.cacheHit?"；重用完整計算快取":""}。\n\n### 圖資來源\n\n${r.buildingSources?.length?'官方分棟統計實際來源：'+r.buildingSources.map((u,i)=>`[NLSC 分棟來源 ${i+1}](${u})`).join('、')+'。模型屬性版本日期：'+(r.buildingVersions?.join('、')||'官方未提供')+'。\n\n':''}${markdownTable(['圖資','來源','已載入圖徵'],r.metadata.map(m=>[m.name,m.source,m.features??'服務參照']))}\n\n${analysisGapsMarkdown(r.gaps||categorizeAnalysisGaps(r.warnings))}`;
}
