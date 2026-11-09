import * as turf from '@turf/turf';

export const intersectsBox=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export function safeBox(feature){try{const b=turf.bbox(feature);return b.every(Number.isFinite)&&b[0]>=-180&&b[2]<=180&&b[1]>=-90&&b[3]<=90?b:null;}catch{return null;}}
/** Packed bounding-box tree: each internal node bounds its children; leaves hold at most 16 objects. */
export class SpatialIndex {
  constructor(features){this.items=features.map((feature,index)=>({feature,index,box:safeBox(feature)})).filter(x=>x.box);this.root=this.build(this.items,0);}
  build(items,depth){if(!items.length)return null;const box=[Infinity,Infinity,-Infinity,-Infinity];for(const x of items){box[0]=Math.min(box[0],x.box[0]);box[1]=Math.min(box[1],x.box[1]);box[2]=Math.max(box[2],x.box[2]);box[3]=Math.max(box[3],x.box[3]);}if(items.length<=16)return {box,items};const axis=depth%2,sorted=[...items].sort((a,b)=>a.box[axis]+a.box[axis+2]-b.box[axis]-b.box[axis+2]),mid=sorted.length>>1;return {box,left:this.build(sorted.slice(0,mid),depth+1),right:this.build(sorted.slice(mid),depth+1)};}
  search(box){const result=[],stack=[this.root];while(stack.length){const node=stack.pop();if(!node||!intersectsBox(node.box,box))continue;if(node.items){for(const item of node.items)if(intersectsBox(item.box,box))result.push(item);}else stack.push(node.left,node.right);}return result;}
}
const identity=(f)=>String(f.properties?.BUILD_ID||f.properties?.buildingId||f.properties?.osmId||f.id||f.properties?.id||f.properties?.StationUID||JSON.stringify([f.geometry,f.properties]));
const indexCache=new Map();
const indexFor=(key,features)=>{if(indexCache.has(key))return indexCache.get(key);const index=new SpatialIndex(features);indexCache.set(key,index);while(indexCache.size>12||[...indexCache.values()].reduce((n,x)=>n+x.items.length,0)>200000){indexCache.delete(indexCache.keys().next().value);if(!indexCache.size)break;}return index;};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
/** Geometry is computed locally. Only aggregate counts leave this engine. */
export async function computeSpatialBatch({layers,targets,buildings=[],corridorMeters=30,sourceHash=''},progress=()=>{},signal){
  const rows=[],warnings=[],stats={features:0,candidates:0,exactChecks:0,invalid:0,zoneAssignments:0};
  const lines=layers.flatMap(l=>/自行車|cycling|cycleway/i.test(l.name)?(l.geojson?.features||[]).flatMap(f=>f.geometry?.type==='LineString'?[f]:f.geometry?.type==='MultiLineString'?f.geometry.coordinates.map(c=>turf.lineString(c)):[]):[]);
  const lineIndex=indexFor(sourceHash+':lines',lines),buildingIndex=new SpatialIndex(buildings);
  const corridorIds=new Set();
  if(lines.length)for(const [i,point] of buildings.entries()){
    if(i%512===0){signal?.throwIfAborted();await tick();}const box=safeBox(point);if(!box)continue;const dy=corridorMeters/110574,dx=corridorMeters/(111320*Math.max(.01,Math.cos(point.geometry.coordinates[1]*Math.PI/180))),near=lineIndex.search([box[0]-dx,box[1]-dy,box[2]+dx,box[3]+dy]);
    if(near.some(x=>turf.pointToLineDistance(point,x.feature,{units:'meters'})<=corridorMeters))corridorIds.add(identity(point));
  }
  for(const [ti,target] of targets.entries()){
    signal?.throwIfAborted();const zones=indexFor(sourceHash+':zones:'+target.id,target.areas);const invalidZones=target.areas.length-zones.items.length;if(invalidZones)warnings.push(`${target.name} 有 ${invalidZones} 個分區幾何無效，結果為部分資料。`);
    for(const l of layers){
      if(l.id===target.id||!l.geojson?.features.length)continue;
      const unique=new Set();let invalid=0;const features=l.geojson.features;
      for(let i=0;i<features.length;i++){
        if(i%512===0){signal?.throwIfAborted();progress({stage:'套疊與分組',completed:ti,total:targets.length,message:`批次套疊 ${ti+1}/${targets.length} 個範圍圖層；已核對 ${i}/${features.length} 筆來源圖徵。`});await tick();}
        const f=features[i],box=safeBox(f);stats.features++;if(!box){invalid++;stats.invalid++;continue;}
        const candidates=zones.search(box);stats.candidates+=candidates.length;
        for(const zone of candidates){stats.exactChecks++;try{if(turf.booleanIntersects(f,zone.feature)){unique.add(identity(f));break;}}catch{invalid++;break;}}
      }
      if(invalid)warnings.push(`${l.name} 有 ${invalid} 筆幾何無法可靠套疊，未列為確認數量。`);
      rows.push({target:target.name,layer:l.name,count:unique.size,unit:/建物|building/i.test(l.name)?'建物圖徵':features.every(f=>f.geometry?.type==='Point')?'點圖徵':'相交圖徵',partial:!!(invalid||invalidZones||l.dataMetadata?.partial||l.dataMetadata?.loading)});
    }
    const ids=new Set(),corridor=new Set();
    // Index buildings once, then query candidate centers per zone. Overlapping zones share BUILD_ID deduplication.
    for(const [zi,zone] of zones.items.entries()){
      if(zi%32===0){signal?.throwIfAborted();await tick();}for(const item of buildingIndex.search(zone.box)){
        stats.exactChecks++;try{if(turf.booleanPointInPolygon(item.feature,zone.feature)){const id=identity(item.feature);ids.add(id);stats.zoneAssignments++;if(corridorIds.has(id))corridor.add(id);}}catch{stats.invalid++;}
      }
    }
    rows.push({target:target.name,layer:'NLSC 分棟建物中心（BUILD_ID 去重）',count:ids.size,unit:'棟',officialBuildings:true});
    if(lines.length)rows.push({target:target.name,layer:`自行車道兩側各 ${corridorMeters} 公尺內建物`,count:corridor.size,unit:'棟',officialBuildings:true});
  }
  return {rows,warnings,stats};
}
