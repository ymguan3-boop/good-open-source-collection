import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../overlay/src/taiwan/'+name,import.meta.url),'utf8');
const dataUrl=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
// The browser install owns the GIS dependency; test canonical source without hooks.
const turfUrl=new URL('../.work/upstream/node_modules/@turf/turf/dist/esm/index.js',import.meta.url).href;
const spatialUrl=dataUrl(source('selectedLayerAnalysis.js').replace("'@turf/turf'",JSON.stringify(turfUrl)));
const {analyzeSelectedLayers,visibleAnalysisLayers,markdownTable}=await import(spatialUrl);
const {combineRecordText,analyzeRecords}=await import(dataUrl(source('recordAnalysis.js').replace("'./selectedLayerAnalysis.js'",JSON.stringify(spatialUrl))));
const turf=await import(turfUrl);
const fc=features=>({type:'FeatureCollection',features});
const area=()=>({id:'area',name:'高改善潛力最小統計區',visible:true,geojson:fc([turf.bboxPolygon([121.7,24.7,121.701,24.701])])});
test('hidden layers and children of hidden parents are excluded',()=>{
  const selected=visibleAnalysisLayers([{id:'hidden',visible:false},{id:'child',visible:true,bufferSourceId:'hidden'},area()]);
  assert.deepEqual(selected.map(l=>l.id),['area']);
});
test('project and other workspace vectors share the selected polygon',async()=>{
  const r=await analyzeSelectedLayers([area(),{id:'facility',name:'生活設施',visible:true,geojson:fc([turf.point([121.7005,24.7005],{id:1}),turf.point([121.71,24.71],{id:2})])},{id:'workspace-stop',name:'其他工作區公車站點',visible:true,geojson:fc([turf.point([121.7004,24.7004])])},{id:'hidden',name:'隱藏設施',visible:false,geojson:fc([turf.point([121.7004,24.7004])])}]);
  assert.equal(r.metadata.length,3);assert.deepEqual(r.rows.map(x=>x.count),[1,1]);assert.ok(!r.markdown.includes('隱藏設施'));
});
test('BUILD_ID dedup and the cycling corridor use actual centers',async()=>{
  const line=turf.lineString([[121.7001,24.7001],[121.7009,24.7001]]),p1=turf.point([121.7005,24.70015],{buildingId:'A'}),p2=turf.point([121.7005,24.7008],{buildingId:'B'});
  const r=await analyzeSelectedLayers([area(),{id:'cycle',name:'自行車道',visible:true,geojson:fc([line])},{id:'model',name:'宜蘭建物模型',visible:true,kind:'3d-tiles',serviceUrl:'https://test.invalid/complete'}],{buildingQuery:async()=>({buildingCount:2,buildingCountComplete:true,geojson:fc([p1,p1,p2])})});
  assert.equal(r.rows.find(x=>x.layer.startsWith('NLSC')).count,2);assert.equal(r.rows.find(x=>x.layer.startsWith('自行車道兩側')).count,1);
});
test('unavailable building metadata remains unknown, not zero',async()=>{
  const r=await analyzeSelectedLayers([area(),{id:'model',name:'建物',visible:true,kind:'3d-tiles',serviceUrl:'https://test.invalid/unknown'}],{buildingQuery:async()=>({buildingCount:null,buildingCountComplete:false,buildingWarning:'未提供可用分棟編號',geojson:fc([])})});
  assert.equal(r.rows.find(x=>x.layer.startsWith('NLSC')).count,null);assert.match(r.markdown,/未知/);assert.match(r.markdown,/未提供可用分棟編號/);
});
test('large polygons are split below the official 2 km2 limit',async()=>{
  let calls=0;const big=area();big.geojson=fc([turf.bboxPolygon([121.7,24.7,121.72,24.72])]);
  await analyzeSelectedLayers([big,{id:'model',name:'建物',kind:'3d-tiles',serviceUrl:'https://test.invalid/split'}],{buildingQuery:async geometry=>{calls++;assert.ok(turf.area(turf.feature(geometry))<2000000);return {buildingCount:0,buildingCountComplete:true,geojson:fc([])};}});assert.ok(calls>1);
});
test('record analysis reads every original text chunk and preserves the tail',async()=>{
  const records=[{id:1,filename:'one.md',createdAt:'2026-10-07T01:00:00Z',markdown:'甲'.repeat(6500)+'尾端證據',messageCount:1}],read=[];
  const r=await analyzeRecords(records,{ask:async(_prompt,context)=>{if(context.recordText)read.push(context.recordText);return '摘要與三點查核建議';}});
  assert.equal(read.join(''),combineRecordText(records));assert.ok(read.at(-1).includes('尾端證據'));assert.equal(r.failures.length,0);assert.ok(r.chunks>=3);
});
test('record model failure returns an explicit result and audit recommendations',async()=>{
  const r=await analyzeRecords([{id:2,filename:'two.md',createdAt:'2026-10-07',markdown:'查核證據'}],{ask:async()=>{throw Error('服務暫停');}});
  assert.equal(r.failures.length,2);assert.match(r.markdown,/三點查核建議/);assert.match(r.markdown,/未完成的語意查核/);
});
test('Markdown table cells cannot create a new column or line',()=>{assert.equal(markdownTable(['項目'],[['甲|乙\n丙']]),'| 項目 |\n| --- |\n| 甲／乙 丙 |');});


test('colocated points with different source identities remain separate',async()=>{
  const r=await analyzeSelectedLayers([area(),{id:'points',name:'設施',geojson:fc([turf.point([121.7005,24.7005],{name:'學校'}),turf.point([121.7005,24.7005],{name:'市場'})])}]);
  assert.equal(r.rows[0].count,2);
});
test('a selected building model without its source is explicitly unknown',async()=>{
  const r=await analyzeSelectedLayers([area(),{id:'model',name:'建物模型',kind:'3d-tiles'}]);
  assert.equal(r.rows.find(x=>x.layer.startsWith('NLSC')).count,null);assert.equal(r.buildingComplete,false);assert.match(r.markdown,/缺少官方模型來源網址/);
});


test('inline binary image encoding is an index while all readable evidence survives',async()=>{
  const records=[{id:3,filename:'image.md',createdAt:'2026-10-07T00:00:00Z',markdown:'前段事實\n![畫面](data:image/png;base64,'+'A'.repeat(30000)+')\n尾端查核證據'}];
  const input=combineRecordText(records);assert.match(input,/前段事實/);assert.match(input,/尾端查核證據/);assert.match(input,/臺灣 UTC\+08/);assert.match(input,/僅列索引/);assert.ok(input.length<1000);assert.ok(!input.includes('A'.repeat(100)));
  const r=await analyzeRecords(records,{ask:async()=> '摘要及三點建議'});assert.equal(r.chunks,1);assert.match(r.markdown,/base64/);
});
