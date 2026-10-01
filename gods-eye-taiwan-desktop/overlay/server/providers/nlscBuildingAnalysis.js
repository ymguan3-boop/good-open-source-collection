import { readFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
const registry = JSON.parse(readFileSync(new URL('./nlsc-service-snapshot.json',import.meta.url),'utf8')).LAYERS.BUILDING;
const allowed = new Map(registry.map(item=>[item.Url,item]));
const roots = new Map();
const TWD97 = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
async function bytes(url,limit,signal) {
  const response = await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(25000)]),redirect:'error'});
  if (!response.ok) throw new Error(`NLSC HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('圖磚超過分析記憶體上限');
  const chunks = []; let length = 0;
  for await (const part of response.body) {length += part.length; if (length > limit) {await response.body.cancel().catch(()=>{});throw new Error('圖磚超過分析記憶體上限');} chunks.push(part);}
  return Buffer.concat(chunks);
}
function lonLat([x,y,z]) {
  const lon = Math.atan2(y,x); const p = Math.hypot(x,y); let lat = Math.atan2(z,p*(1-0.00669437999014));
  for (let i=0;i<6;i++) {const n=6378137/Math.sqrt(1-0.00669437999014*Math.sin(lat)**2);lat=Math.atan2(z+0.00669437999014*n*Math.sin(lat),p);}
  return [lon*180/Math.PI,lat*180/Math.PI];
}
function overlaps(volume,box) {
  if (volume?.region) {const [w,s,e,n]=volume.region;return e*180/Math.PI >= box[0] && w*180/Math.PI <= box[2] && n*180/Math.PI >= box[1] && s*180/Math.PI <= box[3];}
  const sphere = volume?.sphere;
  if (!sphere) return true;
  if (sphere[3] <= 0) return false;
  const [lon,lat]=lonLat(sphere);const dlat=sphere[3]/110000;const dlon=dlat/Math.max(0.1,Math.cos(lat*Math.PI/180));
  return lon+dlon >= box[0] && lon-dlon <= box[2] && lat+dlat >= box[1] && lat-dlat <= box[3];
}
export function readBuildingMetadata(buffer) {
  if (buffer.toString('ascii',0,4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) throw new Error('此建物圖磚不是可解析的 GLB 2.0');
  const jsonLength=buffer.readUInt32LE(12);const json=JSON.parse(buffer.toString('utf8',20,20+jsonLength).trim());
  const binStart=20+jsonLength+8;const binary=buffer.subarray(binStart);
  const tables=json.extensions?.EXT_structural_metadata?.propertyTables || [];
  function readStrings(property,count) {
    if (!property || !Number.isInteger(property.values) || !Number.isInteger(property.stringOffsets)) return [];
    const valueView=json.bufferViews[property.values],offsetView=json.bufferViews[property.stringOffsets];
    const values=binary.subarray(valueView.byteOffset || 0,(valueView.byteOffset || 0)+valueView.byteLength);
    const offsets=binary.subarray(offsetView.byteOffset || 0,(offsetView.byteOffset || 0)+offsetView.byteLength);
    const type=property.stringOffsetType || 'UINT32';const width={UINT8:1,UINT16:2,UINT32:4,UINT64:8}[type];
    if (!width || count > 100000 || offsets.length < (count+1)*width) return [];
    const offset=i=>width === 8 ? Number(offsets.readBigUInt64LE(i*width)) : offsets.readUIntLE(i*width,width);
    return Array.from({length:count},(_,i)=>values.toString('utf8',offset(i),offset(i+1)));
  }
  const output=[];
  for (const table of tables) {
    const count=table.count;const p=table.properties || {};
    const es=readStrings(p.CENT_E_97,count),ns=readStrings(p.CENT_N_97,count);
    const ids=readStrings(p.BUILD_ID,count),numbers=readStrings(p.BUILD_NO,count),names=readStrings(p.BUILDNAME,count),dates=readStrings(p.MDATE,count);
    for (let i=0;i<count;i++) {
      const e=Number(es[i]),n=Number(ns[i]);const id=ids[i]?.trim() || numbers[i]?.trim();
      if (!id || !es[i] || !ns[i] || !Number.isFinite(e) || !Number.isFinite(n)) continue;
      const coordinates=proj4(TWD97,'EPSG:4326',[e,n]);
      if (coordinates[0] < 117 || coordinates[0] > 123.5 || coordinates[1] < 20 || coordinates[1] > 27) continue;
      output.push({type:'Feature',geometry:{type:'Point',coordinates},properties:{buildingId:id,name:names[i] || '',modelDate:dates[i] || null,sourceCrs:'EPSG:3826',countRule:'建物中心位於範圍內'}});
    }
  }
  return output;
}
export async function analyzeNlscBuildings({geometry,serviceUrls},signal) {
  const polygon=turf.feature(geometry);
  if (!['Polygon','MultiPolygon'].includes(geometry?.type) || JSON.stringify(geometry).length > 50000) throw new Error('建物統計需要面積範圍');
  if (!(turf.area(polygon)>0))throw new Error('範圍沒有有效面積');
  if (turf.area(polygon) > 2_000_000) throw new Error('精細分棟統計限 2 平方公里以下，請拆分範圍');
  const box=turf.bbox(polygon);if(!box.every(Number.isFinite))throw new Error('範圍座標無效');if(box[0]<117 || box[2]>123.5 || box[1]<20 || box[3]>27) throw new Error('範圍需位於臺灣');
  if (!Array.isArray(serviceUrls) || !serviceUrls.length || serviceUrls.length > 4) throw new Error('請先載入涵蓋範圍的 NLSC 3D 建物');
  const sources=[...new Set(serviceUrls.map(url=>{
    const item=allowed.get(url);if(!item)throw new Error('此建物服務不在官方公布清單');
    const county=item.Name.split(/[（(]/)[0].replace(/分棟版建物模型|建物模型/g,'').trim();
    return registry.find(other=>other.Name.startsWith(county) && /分棟|Individual/.test(other.Name))?.Url || url;
  }))];
  const candidates=new Set();const unique=new Map();let scanned=0,failed=0,identified=0;const warnings=[];
  for (const url of sources) {
    signal.throwIfAborted();let root=roots.get(url);
    if (!root) {root=JSON.parse((await bytes(url,64_000_000,signal)).toString('utf8'));roots.set(url,root);if(roots.size>2)roots.delete(roots.keys().next().value);}
    const stack=[root.root];let nodes=0;
    while(stack.length) {
      if(++nodes>500000)throw new Error('建物索引過大');const tile=stack.pop();if(tile.transform)throw new Error("此索引含額外座標轉換，尚無法完整統計");if(!overlaps(tile.boundingVolume,box))continue;
      if(tile.children?.length) {stack.push(...tile.children);continue;}
      for(const content of tile.contents || [tile.content].filter(Boolean)) {
        const target=new URL(content.uri || content.url,url);
        if(target.origin !== new URL(url).origin || !target.pathname.startsWith(new URL('.',url).pathname) || target.search || target.hash)continue;
        if(/\.glb$/i.test(target.pathname))candidates.add(target.href);else warnings.push('部分葉節點不是 GLB，未納入');
      }
    }
  }
  let totalBytes=0;
  for(const url of [...candidates].slice(0,80)) {
    signal.throwIfAborted();
    try {const b=await bytes(url,15_000_000,signal);totalBytes+=b.length;if(totalBytes>180_000_000)throw new Error('已達單次分析下載上限');
      const features=readBuildingMetadata(b);if(!features.length)warnings.push('圖磚沒有可用分棟編號或中心座標，不能推定為 0 棟');identified+=features.length;scanned++;
      for(const feature of features)if(turf.booleanPointInPolygon(feature,polygon))unique.set(feature.properties.buildingId,feature);
    }catch(error){signal.throwIfAborted();failed++;warnings.push(error.message);}
    if(totalBytes>180_000_000)break;
  }
  const complete=scanned === candidates.size && failed === 0 && warnings.length === 0;
  const count=(identified || candidates.size === 0) && complete ? unique.size : identified ? unique.size : null;
  return {buildingCount:count,buildingCountComplete:complete,buildingSource:'NLSC 官方分棟版 3D Tiles 屬性',buildingCountRule:'BUILD_ID 去重，建物中心座標位於量測範圍內（非建物足跡相交）',
    buildingCoverage:'只代表官方服務索引的模型版本與涵蓋，不代表現況或法定建物清冊',buildingCandidateTiles:candidates.size,buildingScannedTiles:scanned,buildingFailedTiles:failed,
    buildingWarning:complete ? null : `建物索引處理不完整：已讀 ${scanned}/${candidates.size} 個圖磚。${[...new Set(warnings)].slice(0,3).join('；')}`,
    sourceUrls:sources,geojson:{type:'FeatureCollection',features:[...unique.values()]}};
}
