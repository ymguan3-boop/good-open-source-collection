import * as turf from '@turf/turf';

const cell=v=>String(v??'未提供').replaceAll('|','／').replace(/\r?\n/g,' ');
export const markdownTable=(headers,rows)=>[headers,headers.map(()=> '---'),...rows].map(r=>'| '+r.map(cell).join(' | ')+' |').join('\n');
export function visibleAnalysisLayers(layers){
  const byId=new Map(layers.map(l=>[l.id,l]));
  return layers.filter(l=>{const seen=new Set();for(let p=l;p;p=byId.get(p.bufferSourceId)){if(p.visible===false||seen.has(p.id))return false;seen.add(p.id);}return true;});
}
const boundsCache=new WeakMap();
const bounds=f=>{if(!boundsCache.has(f)){let b;try{b=turf.bbox(f);if(!b.every(Number.isFinite)||b[0]<-180||b[2]>180||b[1]<-90||b[3]>90)b=null;}catch{b=null;}boundsCache.set(f,b);}return boundsCache.get(f);};
const overlaps=(a,b)=>{const x=bounds(a),y=bounds(b);return !!(x&&y&&x[2]>=y[0]&&x[0]<=y[2]&&x[3]>=y[1]&&x[1]<=y[3]);};
const intersects=(a,b)=>{try{return overlaps(a,b)&&turf.booleanIntersects(a,b);}catch{return false;}};
const contained=(p,areas)=>areas.some(a=>{try{return overlaps(p,a)&&turf.booleanPointInPolygon(p,a);}catch{return false;}});
const identity=(f,index)=>String(f.properties?.BUILD_ID||f.properties?.buildingId||f.properties?.osmId||f.id||f.properties?.id||f.properties?.StationUID||JSON.stringify([f.geometry,f.properties])||index);
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
const buildingCache=new Map();
function* chunks(feature){
  if(turf.area(feature)<=1900000&&JSON.stringify(feature.geometry).length<48000){yield feature;return;}
  const [w,s,e,n]=turf.bbox(feature),dy=900/111320,dx=900/(111320*Math.cos((s+n)*Math.PI/360));
  for(let y=s;y<n;y+=dy)for(let x=w;x<e;x+=dx){const clipped=turf.intersect(turf.featureCollection([feature,turf.bboxPolygon([x,y,Math.min(e,x+dx),Math.min(n,y+dy)])]));if(clipped&&turf.area(clipped)>0)yield clipped;}
}
/** Only selected source geometries and official BUILD_ID metadata enter counts. */
export async function analyzeSelectedLayers(all,{signal,onProgress=()=>{},corridorMeters=30,buildingQuery}={}){
  const selected=visibleAnalysisLayers(all),layers=selected.map(l=>({...l,geojson:l.geojson?structuredClone(l.geojson):null}));
  if(!layers.length)throw Error('請先開啟要分析的圖資。');
  const polygonLayers=layers.filter(l=>l.geojson?.features.some(f=>/^(Multi)?Polygon$/.test(f.geometry?.type))),preferred=polygonLayers.filter(l=>/高改善潛力/.test(l.name));
  const targets=(preferred.length?preferred:polygonLayers).map(l=>({id:l.id,name:l.name,areas:l.geojson.features.filter(f=>/^(Multi)?Polygon$/.test(f.geometry?.type))}));
  const warnings=[],rows=[],buildingFeatures=new Map(),buildingSources=new Set(),buildingVersions=new Set();
  const metadata=layers.map(l=>({id:l.id,name:l.name,kind:l.kind,source:l.source||l.serviceUrl||'來源未註記',features:l.geojson?.features.length??null,partial:!!(l.dataMetadata?.partial||l.dataMetadata?.loading)}));
  onProgress(`已確認 ${layers.length} 個顯示圖層；排除隱藏圖資，正在計算範圍相交關係。`);
  if(!targets.length)warnings.push('沒有勾選面圖資；本次提供載入圖徵摘要，不能計算範圍內數量。');
  const lines=layers.flatMap(l=>/自行車|cycling|cycleway/i.test(l.name)?(l.geojson?.features||[]).flatMap(f=>f.geometry?.type==='LineString'?[f]:f.geometry?.type==='MultiLineString'?f.geometry.coordinates.map(c=>turf.lineString(c)):[]):[]);
  const buildingLayers=layers.filter(l=>l.kind==='3d-tiles'&&/建物|building/i.test(l.name)),tileSources=[...new Set(buildingLayers.map(l=>l.serviceUrl).filter(Boolean))];
  const missingBuildingSources=buildingLayers.filter(l=>!l.serviceUrl),sourcesComplete=tileSources.length<=4&&!missingBuildingSources.length;
  let buildingComplete=sourcesComplete,buildingKnown=false;
  for(const layer of missingBuildingSources)warnings.push(`${layer.name} 缺少官方模型來源網址，無法查核分棟數量。`);
  const query=buildingQuery|| (async geometry=>{const r=await fetch('/api/taiwan/nlsc-buildings/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry,serviceUrls:tileSources.slice(0,4)}),signal});const data=await r.json();if(!r.ok)throw Error(data.error||'官方建物統計失敗');return data;});
  if(tileSources.length>4){buildingComplete=false;warnings.push('建物來源超過單次支援的四項；僅統計前四項，不能視為完整建物數。');}
  for(const target of targets){
    signal?.throwIfAborted();onProgress(`正在計算「${target.name}」內的點、線與建物（${targets.indexOf(target)+1}/${targets.length} 個範圍圖層）。`);
    for(const l of layers){
      if(l.id===target.id||!l.geojson?.features.length)continue;
      const unique=new Set();let invalid=0;
      for(const [index,f] of l.geojson.features.entries()){
        signal?.throwIfAborted();if(index%500===0)await yieldFrame();
        if(!f.geometry||!bounds(f)){invalid++;continue;}
        if(target.areas.some(a=>intersects(f,a)))unique.add(identity(f,index));
      }
      rows.push({target:target.name,layer:l.name,count:unique.size,unit:/建物|building/i.test(l.name)?'建物圖徵':l.geojson.features.every(f=>f.geometry?.type==='Point')?'點圖徵':'相交圖徵',partial:!!(invalid||l.dataMetadata?.partial||l.dataMetadata?.loading)});
      if(invalid)warnings.push(`${l.name} 有 ${invalid} 筆缺少幾何，未納入相交計算。`);
    }
    if(buildingLayers.length){
      let chunkIndex=0,targetComplete=sourcesComplete,targetKnown=false;const targetBuildings=new Map();
      for(const area of tileSources.length?target.areas:[])for(const piece of chunks(area)){
        signal?.throwIfAborted();onProgress(`向量計算已完成；正在查核「${target.name}」官方分棟建物，第 ${++chunkIndex} 個分區。`);await yieldFrame();
        const key=JSON.stringify([tileSources,piece.geometry]);
        try{let cached=buildingCache.get(key);if(!cached||Date.now()-cached.at>1800000){const value=await query(piece.geometry);cached={at:Date.now(),value};if(value.buildingCountComplete)buildingCache.set(key,cached);if(buildingCache.size>80)buildingCache.delete(buildingCache.keys().next().value);}const data=cached.value;
          targetComplete&&=data.buildingCountComplete===true;targetKnown||=Number.isFinite(data.buildingCount);
          for(const url of data.sourceUrls||[])buildingSources.add(url);
          for(const f of data.geojson?.features||[])if(f.properties?.modelDate)buildingVersions.add(f.properties.modelDate);
          for(const f of data.geojson?.features||[])if(f.geometry?.type==='Point'&&contained(f,target.areas)){const id=identity(f);targetBuildings.set(id,f);buildingFeatures.set(id,f);}
          if(data.buildingWarning)warnings.push(data.buildingWarning);
        }catch(error){signal?.throwIfAborted();targetComplete=false;warnings.push(`「${target.name}」建物查核：${error.message}`);}
      }
      buildingKnown||=targetKnown;buildingComplete&&=targetComplete;
      const corridorCount=targetKnown? [...targetBuildings.values()].filter(p=>lines.some(l=>turf.pointToLineDistance(p,l,{units:'meters'})<=corridorMeters)).length:null;
      rows.push({target:target.name,layer:'NLSC 分棟建物中心（BUILD_ID 去重）',count:targetKnown?targetBuildings.size:null,unit:'棟',partial:!targetComplete});
      if(lines.length)rows.push({target:target.name,layer:`自行車道兩側各 ${corridorMeters} 公尺內建物`,count:corridorCount,unit:'棟',partial:!targetComplete});
    }
  }
  const reference=metadata.filter(m=>m.features===null||m.features===0);
  for(const m of reference)if(m.kind!=='3d-tiles')warnings.push(`${m.name} 為服務參照，沒有可分析向量；不能從畫面推算數量。`);
  const result={calculatedAt:new Date().toISOString(),corridorMeters,metadata,rows,warnings:[...new Set(warnings)],targetNames:targets.map(t=>t.name),buildingKnown,buildingComplete,buildingCenters:buildingFeatures.size,buildingSources:[...buildingSources],buildingVersions:[...buildingVersions].sort()};
  result.markdown=spatialAnalysisMarkdown(result);return result;
}
export function spatialAnalysisMarkdown(r){return `## 勾選圖資整合分析\n\n摘要：本次納入 ${r.metadata.length} 個顯示圖層；範圍採${r.targetNames.join('、')||'未勾選面圖資'}。\n\n${markdownTable(['分析範圍','圖資／條件','數量','單位','涵蓋'],r.rows.map(x=>[x.target,x.layer,x.count??'未知',x.unit,x.partial?'部分資料／待查核':'已載入來源範圍']))}\n\n### 計算依據\n\n- 點、線、面圖徵以範圍相交計算，依來源識別碼／幾何去重；線圖徵數不等於營運路線數，站點群不等於站牌數。\n- NLSC 建物以官方 BUILD_ID 去重及建物中心落在範圍內計數，非屋頂或建物足跡相交；只代表該模型版本。\n- 自行車道兩側各 ${r.corridorMeters} 公尺，以範圍內建物中心至所選線圖徵的地表距離判定，非道路工程安全結論。\n- 計算時間：${r.calculatedAt}。\n\n### 圖資來源\n\n${r.buildingSources?.length?'官方分棟統計實際來源：'+r.buildingSources.map((u,i)=>`[NLSC 分棟來源 ${i+1}](${u})`).join('、')+'。模型屬性版本日期：'+(r.buildingVersions?.join('、')||'官方未提供')+'。\n\n':''}${markdownTable(['圖資','來源','已載入圖徵'],r.metadata.map(m=>[m.name,m.source,m.features??'服務參照']))}\n\n${r.warnings.length?'### 資料缺口\n\n'+r.warnings.map(w=>'- '+w).join('\n'):''}\n\n### 三點查核建議\n\n1. 比較各範圍的生活設施與公車站點涵蓋，優先查核服務不足區。\n2. 查核自行車道兩側建物與公共運輸銜接；以可調整的走廊距離比較改善對象。\n3. 查核來源版本、缺漏與統計單位，確認圖徵數、站點群及建物棟數的差別。`;
}
