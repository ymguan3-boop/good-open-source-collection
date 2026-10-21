import {categorizeAnalysisGaps,analysisGapsMarkdown} from './analysisGaps.js';
import {runSpatialEngine,compactSpatialResult} from './spatialAnalysisEngine.js';
import * as turf from '@turf/turf';

// 高程：DTM 圖層的每個樣點都帶有 height 屬性（公尺）。逐範圍統計後放進成果快照，AI 追問才能回答實際高程值。
const HEIGHT_FIELDS=['height','elevation','elev','h','z'];
const heightOf=feature=>{const p=feature.properties||{};for(const key of HEIGHT_FIELDS){if(p[key]===undefined||p[key]===null||p[key]==='')continue;const value=Number(p[key]);if(Number.isFinite(value))return value;}return null;};
const round1=value=>Math.round(value*10)/10;
export function elevationStats(layers,targets){
  const rows=[];
  for(const layer of layers.filter(l=>l.kind==='dtm'||/DTM|DEM|高程/i.test(l.name||''))){
    const points=(layer.geojson?.features||[]).filter(f=>f.geometry?.type==='Point').map(f=>({coordinates:f.geometry.coordinates,height:heightOf(f)})).filter(p=>p.height!==null);
    if(!points.length)continue;
    const fields=Object.keys(layer.geojson.features.find(f=>f.properties)?.properties||{}).slice(0,12),spacing=layer.dataMetadata?.sampledSpacingMeters??null;
    const groups=targets.length?targets.map(target=>{
      const areas=target.areas.map(area=>({area,box:turf.bbox(area)}));
      return {name:target.name,points:points.filter(p=>areas.some(({area,box})=>p.coordinates[0]>=box[0]&&p.coordinates[0]<=box[2]&&p.coordinates[1]>=box[1]&&p.coordinates[1]<=box[3]&&turf.booleanPointInPolygon(p.coordinates,area)))};
    }):[{name:'整個已載入範圍',points}];
    for(const group of groups){
      const values=group.points.map(p=>p.height).sort((a,b)=>a-b);
      if(!values.length){rows.push({layer:layer.name,target:group.name,count:0,fields,sampledSpacingMeters:spacing});continue;}
      const mean=values.reduce((sum,value)=>sum+value,0)/values.length,middle=Math.floor(values.length/2),median=values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
      rows.push({layer:layer.name,target:group.name,count:values.length,minM:round1(values[0]),maxM:round1(values.at(-1)),meanM:round1(mean),medianM:round1(median),fields,sampledSpacingMeters:spacing,
        samples:group.points.slice(0,5).map(p=>({lon:Number(p.coordinates[0].toFixed(6)),lat:Number(p.coordinates[1].toFixed(6)),heightM:round1(p.height)}))});
    }
  }
  return rows;
}
const buildingDetailMarkdown=d=>d?`\n\n### 建物明細與 DTM 地面高程\n\n${markdownTable(['項目','內容'],[['範圍內建物（本機建物主檔）',d.totalInArea],['符合條件的建物',d.matched+(d.markFilter?.length?`（條件：具${d.markFilter.map(k=>({lvr:'實價登錄',cadastre:'地籍',permit:'建管'})[k]).join('＋')}標示）`:'')],['取得 DTM 地面高程的建物',d.withGround],['地面高程 最低／最高／平均／中位數(m)',d.stats?`${d.stats.minM}／${d.stats.maxM}／${d.stats.meanM}／${d.stats.medianM}`:'無']])}\n\n${d.matched?`${markdownTable(d.header,d.rowTable)}\n\n- 表內只列前 ${d.shownRows} 棟；全部 ${d.matched} 棟請按下方「匯出 Excel」（另有「建物明細與DTM高程」工作表）。`:'沒有符合條件的建物。'}\n- 來源：${d.source}\n${d.note?`- ${d.note}\n`:''}- 屋頂海拔概估 = DTM 地面高程 + 模型高度，僅供參考；DTM 是 20 公尺格網，建物在坡地或格網邊緣時會有誤差。\n`:'';
const zonalDtmMarkdown=z=>z?.rows?.length?`\n\n### 行政區 DTM 高程統計（${z.source}）\n\n${markdownTable(['範圍','面積(km²)','格網數','取樣間距(m)','最低(m)','最高(m)','平均(m)','中位數(m)'],z.rows.map(r=>[r.name,r.areaKm2??'—',r.count,r.sampledSpacingMeters??'—',r.minM??(r.error||'—'),r.maxM??'—',r.meanM??'—',r.medianM??'—']))}\n\n- 每一格取 20 公尺格網中心點高程，中心點落在範圍內才計入；取樣間距大於 20 公尺表示面積太大而隔格取樣。\n- 範圍：${z.scope}。高程為原始 EPSG:3826 高程，非工程測量；無資料不代表高程為零。\n`:'';const elevationMarkdown=rows=>rows.length?`\n\n### 高程統計（DTM 樣點的 height 屬性，單位公尺）\n\n${markdownTable(['圖資','分析範圍','樣點數','最低','最高','平均','中位數'],rows.map(r=>[r.layer,r.target,r.count,r.minM??'—',r.maxM??'—',r.meanM??'—',r.medianM??'—']))}\n\n- 高程值取自 DTM 樣點的 height 屬性（欄位：${rows[0].fields.join('、')}），原始 EPSG:3826 高程。${rows.some(r=>r.sampledSpacingMeters)?`樣點是官方 20 公尺格網依所選範圍抽樣（約每 ${rows.find(r=>r.sampledSpacingMeters).sampledSpacingMeters} 公尺一點），不是完整格網。`:''}\n`:'';
const cell=v=>String(v??'未提供').replaceAll('|','／').replace(/\r?\n/g,' ');
export const markdownTable=(headers,rows)=>[headers,headers.map(()=> '---'),...rows].map(r=>'| '+r.map(cell).join(' | ')+' |').join('\n');
export function visibleAnalysisLayers(layers){
  const byId=new Map(layers.map(l=>[l.id,l]));
  return layers.filter(l=>{const seen=new Set();for(let p=l;p;p=byId.get(p.bufferSourceId)||layers.find(l=>p.parentSourceKey&&(l.sourceKey||l.sourceProjectKey)===p.parentSourceKey)){if(p.visible===false||seen.has(p.id))return false;seen.add(p.id);}return true;});
}
/** The UI never calculates per feature or asks the LLM to perform geometry operations. */
export async function analyzeSelectedLayers(all,{signal,onProgress=()=>{},corridorMeters=30,buildingQuery,config,prompt='',detailQuery,digestQuery,zonalQuery}={}){
  const layers=visibleAnalysisLayers(all).map(l=>({id:l.id,name:l.name,kind:l.kind,infoLayer:!!l.infoLayer,infoTown:l.infoTown,infoTownName:l.infoTownName,geojson:l.geojson,serviceUrl:l.serviceUrl,source:l.source,dataMetadata:{partial:l.dataMetadata?.partial,loading:l.dataMetadata?.loading,sourceTimestamp:l.dataMetadata?.sourceTimestamp,sampledSpacingMeters:l.dataMetadata?.sampledSpacingMeters}}));
  if(!layers.length)throw Error('請先開啟要分析的圖資。');
  const polygons=layers.filter(l=>l.geojson?.features?.some(f=>/^(Multi)?Polygon$/.test(f.geometry?.type))),preferred=polygons.filter(l=>/高改善潛力/.test(l.name));
  const targets=(preferred.length?preferred:polygons).map(l=>({id:l.id,name:l.name,areas:l.geojson.features.filter(f=>/^(Multi)?Polygon$/.test(f.geometry?.type))}));
  const allBuildingLayers=layers.filter(l=>l.kind==='3d-tiles'&&/建物|building/i.test(l.name)),localLayers=allBuildingLayers.filter(l=>l.infoLayer),localMode=localLayers.length>0,buildingLayers=localMode?localLayers:allBuildingLayers,tileSources=localMode?['local']:[...new Set(buildingLayers.map(l=>l.serviceUrl).filter(Boolean))],warnings=[];
  if(localMode&&allBuildingLayers.length>localLayers.length)warnings.push('已改用本機建物主檔統計建物；同時勾選的 NLSC 線上建物圖層未另外統計，避免重複計算。');
  if(!targets.length)warnings.push('沒有勾選面圖資；不能計算範圍內數量。');
  if(tileSources.length>4)warnings.push('官方建物來源超過四項，本次僅處理前四项，結果為部分資料。');
  if(!localMode&&buildingLayers.some(l=>!l.serviceUrl))warnings.push('部分建物圖層缺少官方來源，無法統計該來源。');
  const localSlugs=[...new Set(localLayers.map(l=>l.infoTown).filter(Boolean))],query=buildingQuery|| (localMode?async geometry=>{const r=await fetch('/api/taiwan/nlsc-buildings/info/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry,slugs:localSlugs}),signal});const data=await r.json();if(!r.ok)throw Error(data.error||'本機建物統計失敗');return data;}:async geometry=>{const r=await fetch('/api/taiwan/nlsc-buildings/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry,serviceUrls:tileSources.slice(0,4)}),signal});const data=await r.json();if(!r.ok)throw Error(data.error||'官方建物統計失敗');return data;});
  const batch=await runSpatialEngine({layers,targets,tileSources:tileSources.slice(0,4),buildingQuery:query,corridorMeters,signal,onProgress,config,localBuildings:localMode});
  // 行政區等面圖資 × 官方 2025 20 公尺 DTM：逐區統計格網高程（不需要先載入 DTM 圖層）。
  let zonalDtm=null;
  if(targets.length&&/DTM|高程|海拔|地勢/i.test(prompt)){
    try{
      onProgress({stage:'DTM 分區統計',completed:0,total:1,message:'依行政區範圍統計官方 2025 全臺 20 公尺 DTM 的格網高程…'});
      const nameOf=(feature,fallback)=>{const p=feature.properties||{};for(const key of ['TOWNNAME','VILLNAME','COUNTYNAME','name','NAME','名稱'])if(p[key])return String(p[key]);return fallback;};
      const all=targets.flatMap(target=>target.areas.map((feature,index)=>({name:nameOf(feature,`${target.name} #${index+1}`),geometry:feature.geometry})));
      const merged=new Map();for(const area of all){const polygons=area.geometry.type==='Polygon'?[area.geometry.coordinates]:area.geometry.type==='MultiPolygon'?area.geometry.coordinates:[];if(!polygons.length)continue;const entry=merged.get(area.name)||{name:area.name,geometry:{type:'MultiPolygon',coordinates:[]}};entry.geometry.coordinates.push(...polygons);merged.set(area.name,entry);}
      const wanted=[...merged.values()].filter(area=>prompt.includes(area.name)),areas=(wanted.length?wanted:[...merged.values()]).slice(0,40);
      const query=zonalQuery?await zonalQuery({areas}):await (async()=>{const r=await fetch('/api/taiwan/dtm-2025/zonal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({areas}),signal});const data=await r.json();if(!r.ok)throw Error(data.error||'DTM 分區統計失敗');return data;})();
      zonalDtm={source:query.source,cellMeters:query.cellMeters,rows:query.areas,scope:wanted.length?'依你指定的行政區':'全部面圖徵（最多 40 個）'};
    }catch(error){signal?.throwIfAborted();warnings.push('行政區 DTM 統計未取得：'+error.message);}
  }  // 追問「建物明細＋高程」：本機建物主檔（可只取有實價登錄／地籍／建管標示者）＋官方 DTM 地面高程，逐棟列出。
  let buildingDetail=null,detailTables=[];
  if(localMode&&targets.length&&/建物/.test(prompt)&&/DTM|高程|海拔|地面/i.test(prompt)){
    try{
      onProgress({stage:'建物明細',completed:0,total:1,message:'依你的條件逐棟取得建物明細與官方 DTM 地面高程…'});
      const named=[...new Set(localLayers.filter(l=>l.infoTownName&&prompt.includes(l.infoTownName)).map(l=>l.infoTown))],slugs=named.length?named:localSlugs;
      const marks=[/實價/.test(prompt)?'lvr':null,/地籍/.test(prompt)?'cadastre':null,/建管/.test(prompt)?'permit':null].filter(Boolean);
      const townNames=named.length?localLayers.filter(l=>named.includes(l.infoTown)).map(l=>l.infoTownName):[],allAreas=targets.flatMap(target=>target.areas),townAreas=townNames.length?allAreas.filter(a=>townNames.some(name=>Object.values(a.properties||{}).includes(name))):[],polygons=(townAreas.length?townAreas:allAreas).flatMap(a=>a.geometry?.type==='Polygon'?[a.geometry.coordinates]:a.geometry?.type==='MultiPolygon'?a.geometry.coordinates:[]);
      const body={geometry:{type:'MultiPolygon',coordinates:polygons},slugs,marks};
      const detail=detailQuery?await detailQuery(body):await (async()=>{const r=await fetch('/api/taiwan/nlsc-buildings/info/building-elevation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});const data=await r.json();if(!r.ok)throw Error(data.error||'建物高程明細失敗');return data;})();
      const {rows,...summary}=detail;buildingDetail={...summary,slugs,scope:townAreas.length?townNames.join('、')+'行政區界內':named.length?named.join('、'):'已載入的本機建物圖層',sampleRows:rows.slice(0,20)};
      const header=['BUILD_ID','經度','緯度','層數欄位','模型高度(m)','DTM地面高程(m)','屋頂海拔概估(m)','資料標示'];
      detailTables=[{title:'建物明細與DTM高程',header,rows:rows.map(r=>[r.buildId,r.lon,r.lat,r.floors??'',r.modelHeightM??'',r.groundM??'',r.groundM!==null&&r.modelHeightM!==null?Number((r.groundM+r.modelHeightM).toFixed(1)):'',r.marks||''])}];
      buildingDetail.shownRows=Math.min(200,rows.length);buildingDetail.rowTable=detailTables[0].rows.slice(0,200);buildingDetail.header=header;
    }catch(error){signal?.throwIfAborted();warnings.push('建物明細與高程未取得：'+error.message);}
  }  // 本機資料庫的統計概況（建物高度／層數／DTM 高程、實價登錄價格與屋齡分布…），讓 AI 能回答各種問題，而不只看到「幾棟」。
  let digest=null;
  if(localMode){
    try{
      const slugs=localSlugs;
      digest=digestQuery?await digestQuery(slugs):await (async()=>{const r=await fetch('/api/taiwan/nlsc-buildings/info/digest?slugs='+encodeURIComponent(slugs.join(',')),{signal});const data=await r.json();if(!r.ok)throw Error(data.error||'資料概況取得失敗');return data;})();
    }catch(error){signal?.throwIfAborted();warnings.push('本機資料概況未取得：'+error.message);}
  }  const metadata=layers.map(l=>({id:l.id,name:l.name,kind:l.kind,source:l.source||l.serviceUrl||'來源未註記',features:l.geojson?.features?.length??null,sourceTimestamp:l.dataMetadata?.sourceTimestamp,partial:!!(l.dataMetadata?.partial||l.dataMetadata?.loading)}));
  for(const m of metadata)if(!m.features&&m.kind!=='3d-tiles')warnings.push(`${m.name} 為服務參照，沒有可分析向量；不能從畫面推算數量。`);
  const incomplete=!localMode&&(tileSources.length>4||buildingLayers.some(l=>!l.serviceUrl));
  if(incomplete){batch.buildingComplete=false;for(const row of batch.rows)if(row.officialBuildings)row.partial=true;}
  const elevation=elevationStats(layers,targets),result={...batch,elevation,zonalDtm,localDigest:digest,buildingDetail,extraTables:detailTables,localBuildingDatabase:localMode,calculatedAt:new Date().toISOString(),corridorMeters,metadata,warnings:[...warnings,...batch.warnings],targetNames:targets.map(t=>t.name)};
  result.gaps=categorizeAnalysisGaps(result.warnings);result.compact=compactSpatialResult(result);result.markdown=spatialAnalysisMarkdown(result);return result;
}
export function spatialAnalysisMarkdown(r){return `## 勾選圖資整合分析\n\n摘要：本次納入 ${r.metadata.length} 個顯示圖層；範圍採${r.targetNames.join('、')||'未勾選面圖資'}。\n\n${markdownTable(['分析範圍','圖資／條件','數量','單位','涵蓋'],r.rows.map(x=>[x.target,x.layer,x.count??'未知',x.unit,x.partial?'部分資料／待查核':'已載入來源範圍']))}${elevationMarkdown(r.elevation||[])}${zonalDtmMarkdown(r.zonalDtm)}${buildingDetailMarkdown(r.buildingDetail)}\n\n### 計算依據\n\n- 點、線、面圖徵以範圍相交計算，依來源識別碼／幾何去重；線圖徵數不等於營運路線數，站點群不等於站牌數。\n- NLSC 建物以官方 BUILD_ID 去重及建物中心落在範圍內計數，非屋頂或建物足跡相交；只代表該模型版本。\n${r.localBuildingDatabase?"- 建物棟數直接查詢已匯入的本機建物主檔（不下載官方圖磚）；本機資料沒有屋齡，屋齡請看實價登錄「建築完成年月」的專項查詢。\n":""}- 自行車道兩側各 ${r.corridorMeters} 公尺，以範圍內建物中心至所選線圖徵的地表距離判定，非道路工程安全結論。\n- 計算時間：${r.calculatedAt}。\n- 批次引擎：${r.engine?.method}；${r.engine?.polygonCount} 個分區、${r.engine?.featureCount} 筆圖徵；候選 ${r.stats?.candidates} 筆、精確核對 ${r.stats?.exactChecks} 次。官方網格 ${r.engine?.uniqueQueryCells} 個、網路查詢 ${r.engine?.networkQueries} 次、快取 ${r.engine?.cacheHits} 次${r.cacheHit?"；重用完整計算快取":""}。\n\n### 圖資來源\n\n${r.buildingSources?.length?'官方分棟統計實際來源：'+r.buildingSources.map((u,i)=>`[NLSC 分棟來源 ${i+1}](${u})`).join('、')+'。模型屬性版本日期：'+(r.buildingVersions?.join('、')||'官方未提供')+'。\n\n':''}${markdownTable(['圖資','來源','已載入圖徵'],r.metadata.map(m=>[m.name,m.source,m.features??'服務參照']))}\n\n${analysisGapsMarkdown(r.gaps||categorizeAnalysisGaps(r.warnings))}`;
}
