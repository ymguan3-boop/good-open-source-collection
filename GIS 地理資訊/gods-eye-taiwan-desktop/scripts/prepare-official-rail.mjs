import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import shp from '../.work/upstream/node_modules/shpjs/lib/index.js';

const root = resolve(import.meta.dirname, '..');
const sources = [
  { file:'taiwan-rail.zip', category:'臺灣鐵路', dataset:'73220', url:'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/299841E1-714A-40BA-AF4B-D6527EEA2A41/resource/801DECA5-E75E-40A4-816C-1BD6A1F322C9/download' },
  { file:'hsrail.zip', category:'高速鐵路', dataset:'73221', url:'https://www.tgos.tw/tgos/VirtualDir/Product/db6bff0a-58a5-40c1-81fb-ac8312213784/HSRAIL_1130417.zip' },
  { file:'mrt.zip', category:'捷運', dataset:'73222', url:'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/159E4D93-A053-4382-A6BD-9DE6B5C4E19F/resource/9D9CF5D4-EEA3-4E1C-ACB0-ECDBBA27C713/download' },
  { file:'lrt.zip', category:'輕軌捷運', dataset:'73229', url:'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/E58E306B-37FA-4EF5-82EE-C700F854ED10/resource/5C569FD6-6024-4FF5-86B0-FDAE2B243FF2/download' },
];
const features = [];
for (const source of sources) {
  const archive = await readFile(resolve(root,'data/official/rail',source.file));
  const parsed = await shp(archive);
  const collections = Array.isArray(parsed) ? parsed : [parsed];
  source.sha256 = createHash('sha256').update(archive).digest('hex');
  source.sourceFiles = collections.map(item => item.fileName);
  source.count = 0;
  for (const collection of collections) for (const [index,feature] of collection.features.entries()) {
    if (!['LineString','MultiLineString'].includes(feature.geometry?.type)) throw new Error('非線型鐵路資料');
    const round = coordinates => typeof coordinates[0] === 'number' ? coordinates.slice(0,2).map(n=>Number(n.toFixed(7))) : coordinates.map(round);
    feature.geometry.coordinates = round(feature.geometry.coordinates);
    feature.id = `nlsc-${source.dataset}-${feature.properties.RAILID || feature.properties.HSRAILID || feature.properties.MRTID || feature.properties.LRTID || index}`;
    feature.properties = { ...feature.properties, railCategory:source.category, sourceDataset:`https://data.gov.tw/dataset/${source.dataset}` };
    features.push(feature);
    source.count++;
  }
}
const unique = [...new Map(features.map(feature=>[`${feature.id}:${JSON.stringify(feature.geometry)}`,feature])).values()];
const metadata = { provider:'內政部國土測繪中心', downloadedAt:'2026-09-30', license:'政府資料開放授權條款第1版',
  sourceCrs:'來源各 ZIP 的 .prj；TWD97 TM2 121', crs:'EPSG:4326', sources, featureCount:unique.length,
  limitations:['固定版本軌道線型；非即時營運或班表資料','各類資料版本不同，以來源檔名與圖徵更新欄位為準'] };
const dest=resolve(root,'overlay/src/taiwan/data');
await mkdir(dest,{recursive:true});
await writeFile(resolve(dest,'taiwan-rail.geojson'),JSON.stringify({type:'FeatureCollection',metadata,features:unique}));
await writeFile(resolve(root,'data/official/rail/catalog.json'),JSON.stringify(metadata,null,2));
process.stdout.write(JSON.stringify({featureCount:unique.length,sources:sources.map(({category,count,sourceFiles})=>({category,count,sourceFiles}))}));
