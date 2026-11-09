import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { analyzeDtm } from '../.work/upstream/server/providers/taiwanDtm.js';
import { importProject, exportProject } from '../.work/upstream/src/taiwan/projectManager.js';
import { describeLayer, buildSpatialContext } from '../.work/upstream/src/taiwan/spatialContext.js';
import { registerLayer, listLayers, removeLayer } from '../.work/upstream/src/taiwan/layerRegistry.js';

const line = {type:'LineString',coordinates:[[121.75,24.75],[121.76,24.77]]};
const profile = analyzeDtm(line);
assert(profile.dtmSamples > 100);
assert.equal(profile.coverageRatio,1);
assert(profile.terrainLengthMeters > 2000);
assert(profile.meanHeightMeters >= profile.minHeightMeters);
const polygon = analyzeDtm({type:'Polygon',coordinates:[[[121.75,24.75],[121.76,24.75],[121.76,24.76],[121.75,24.76],[121.75,24.75]]]});
assert(polygon.dtmSamples > 1000);
assert.equal(polygon.sampledSpacingMeters,20);
assert.throws(()=>analyzeDtm({type:'LineString',coordinates:[[0,0],[1,1]]}),/臺灣/);
console.log('DTM: direct raw-grid line and polygon analysis passed',JSON.stringify({lineSamples:profile.dtmSamples,polygonSamples:polygon.dtmSamples,min:profile.minHeightMeters,max:profile.maxHeightMeters}));

const rail = JSON.parse(await readFile(new URL('../overlay/src/taiwan/data/taiwan-rail.geojson',import.meta.url),'utf8'));
assert.equal(rail.features.length,3175);
assert.equal(new Set(rail.features.map(feature=>feature.id)).size,3175);
for (const feature of rail.features) {
  assert(['LineString','MultiLineString'].includes(feature.geometry.type));
  const lines = feature.geometry.type==='LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const coords of lines) for (const [lon,lat] of coords) assert(lon>118 && lon<123 && lat>21 && lat<27);
}
console.log('Rail: 3175 unique official features, WGS84 bounds passed');

const projectPath = process.argv[2] || 'C:/Users/ymguan/Downloads/map.geolibre.json';
const text = await readFile(projectPath,'utf8');
const file = {size:Buffer.byteLength(text),name:'map.geolibre.json',text:async()=>text};
const project = await importProject(file);
assert.equal(project.layers.length,7);
assert.equal(project.layers.reduce((sum,l)=>sum+l.geojson.features.length,0),4082);
assert(project.layers[0].metadata.analysisName);
globalThis.window={dispatchEvent(){}};
globalThis.CustomEvent=class { constructor(name,data){this.name=name;this.data=data;} };
for (let n=0;n<2;n++) for (const layer of project.layers) registerLayer({name:layer.path,geojson:layer.geojson,visible:layer.visible,sourceKey:layer.sourceKey,dataMetadata:layer.metadata});
assert.equal(listLayers().length,7);
assert.equal(listLayers().filter(l=>l.visible).length,4);
const summary = describeLayer(listLayers()[0]);
assert(summary.fields.includes('改善潛力分數'));
assert(summary.numeric['改善潛力分數']);
const context=buildSpatialContext(listLayers(),{project:{name:file.name,metadata:project.manifest.metadata}});
assert.equal(context.layers.length,7);
assert(JSON.stringify(context).length<24000);
const exported=JSON.parse(await (await exportProject({layers:listLayers(),metadata:project.manifest.metadata})).text());
assert(exported.layers[0].metadata.analysisName);
assert(exported.metadata.populationNote);
for (const layer of listLayers()) removeLayer(layer.id);
console.log('Project: exact attachment import, 7-layer repeat dedup, visibility, metadata export and AI summaries passed');

const verificationFolder = await mkdtemp(join(tmpdir(),'gev-ai-verification-'));
const priorLocalAppData = process.env.LOCALAPPDATA;
process.env.LOCALAPPDATA = verificationFolder;
try {
const { taiwanAiProxy } = await import('../.work/upstream/server/providers/taiwanAi.js');
let middleware;
taiwanAiProxy().configureServer({middlewares:{use(route,handler){middleware=handler;}}});
async function request(route,data) {
  const req=Readable.from(data===undefined?[]:[Buffer.from(JSON.stringify(data))]);
  Object.assign(req,{method:data===undefined?'GET':'POST',url:route,headers:{host:'127.0.0.1:4175',origin:'http://127.0.0.1:4175'},socket:{remoteAddress:'127.0.0.1'}});
  let payload;
  const res={statusCode:200,setHeader(){},end(value){payload=JSON.parse(value);}};
  await middleware(req,res);
  return {status:res.statusCode,payload};
}
assert.equal((await request('/chat',{model:'openrouter/free',messages:[]})).status,400);
assert.match((await request('/keys',{name:'openrouter',value:'中文錯誤說明文字不應作為金鑰'})).payload.error,/半形/);
assert.equal((await request('/keys',{name:'openrouter',value:'sk-or-test-dummy-no-real-key'})).status,200);
const priorFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
  // Headers constructor reproduces the browser ByteString check.
  const headers=new Headers(options.headers);
  assert.equal(headers.get('X-OpenRouter-Title'),'Gods Eye Taiwan');
  const body=JSON.parse(options.body);
  assert(!body.models);
  assert(body.messages[0].content.includes('改善潛力分數'));
  return Response.json({model:'openrouter/free',choices:[{message:{content:'測試回覆：已收到專案圖層統計'}}]});
};
try {
  const answer=await request('/chat',{model:'openrouter/free',messages:[{role:'user',content:'目前載入哪些圖資？'}],context});
  assert.equal(answer.status,200);
  assert.match(answer.payload.content,/已收到/);
} finally {globalThis.fetch=priorFetch;}
console.log('AI: ASCII headers, UTF8 Chinese body, project context and no fallback models-array passed (mock provider; no real API key used)');

} finally {
  process.env.LOCALAPPDATA = priorLocalAppData;
  const checked = resolve(verificationFolder);
  if (!checked.startsWith(resolve(tmpdir())+sep+'gev-ai-verification-')) throw new Error('Refusing cleanup outside verification folder');
  await rm(checked,{recursive:true,force:true});
}
