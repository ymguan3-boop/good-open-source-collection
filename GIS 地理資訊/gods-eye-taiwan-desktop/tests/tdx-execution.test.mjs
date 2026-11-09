import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.endsWith('/taiwanCredentialStore.js')||specifier==='./taiwanCredentialStore.js')return {url:'data:text/javascript,export function getCredential(){return ""}',shortCircuit:true};return next(specifier,context);}});
const {createTdxService}=await import('../overlay/server/providers/tdxService.js');
const {taipeiTime}=await import('../overlay/server/providers/tdxTrip.js');
const A={name:'A站',lat:24.9,lon:121.1},B={name:'B站',lat:24.91,lon:121.11},C={name:'C站',lat:24.92,lon:121.12};
const time='2026-10-05T10:00:00+08:00',add=(t,m)=>taipeiTime(new Date(Date.parse(t)+m*60000).toISOString());
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function route(from=A,to=B,depart=time,duration=10,mode='Bus'){
  return {start_time:depart,end_time:add(depart,duration),travel_time:duration*60,transfers:0,sections:[{type:'transit',travelSummary:{duration:duration*60,length:1500},departure:{time:depart,place:{name:from.name,location:{lat:from.lat,lng:from.lon}}},arrival:{time:add(depart,duration),place:{name:to.name,location:{lat:to.lat,lng:to.lon}}},transport:{mode,name:'測試路線',shortName:'101',city:'臺北市',type:mode}}]};
}
const request=(extra={})=>({origin:A,destination:B,timeMode:'departure',departureTime:time,allowedModes:['WALK','BUS','TRA','HSR','METRO','LRT','BIKE'],...extra});
function fixture(options={}){
  const calls=[],keys={TDX_CLIENT_ID:'synthetic-id',TDX_CLIENT_SECRET:'synthetic-secret',...options.keys};let tick=Date.parse(time),auth=0;
  const fetcher=async(url,init={})=>{
    init.signal?.throwIfAborted();url=String(url);calls.push({url,method:init.method||'GET',body:init.body?String(init.body):null});
    if(url.includes('/openid-connect/token')){auth++;return options.auth?options.auth(url,init,auth):response({access_token:`synthetic-token-${auth}`,expires_in:3600});}
    if(options.fetch){const result=await options.fetch(url,init,calls);if(result)return result;}
    if(url.includes('/maas/routing')){
      const q=new URL(url).searchParams,points=[A,B,C],from=points.find(p=>`${p.lat},${p.lon}`===q.get('origin')),to=points.find(p=>`${p.lat},${p.lon}`===q.get('destination'));
      const depart=q.get('depart')?taipeiTime(q.get('depart')):add(taipeiTime(q.get('arrival')),-10);return response({result:'success',data:{routes:[route(from,to,depart)]}});
    }
    if(url.includes('/api/basic/'))return response([]);
    if(url.includes('photon.komoot.io'))return response({features:[]});
    throw new Error('Unexpected fixed service URL');
  };
  const service=createTdxService({fetcher,credential:name=>keys[name]||'',now:()=>tick});
  return {service,calls,keys,setTime:value=>tick=value,authCount:()=>auth,fetcher};
}
test('only server-issued plan offer can execute; conclusion never accepts caller fare data',async()=>{const f=fixture();const result=await f.service.handle({action:'plan',request:request()});assert(result.offerId);assert.equal(result.plans.length,1);const executed=await f.service.handle({action:'execute-plan',offerId:result.offerId,index:0,plans:[{totalFare:1}]});assert.equal(executed.conclusion,true);assert.notEqual(executed.plans[0].totalFare,1);await assert.rejects(f.service.handle({action:'execute-plan',offerId:'invented',index:0}),/逾時/);await assert.rejects(f.service.handle({action:'execute-plan',offerId:result.offerId,index:99}),/有效/);});
test('expired or credential-changed offers cannot execute',async()=>{const f=fixture(),r=await f.service.handle({action:'plan',request:request()});f.setTime(Date.parse(time)+1800001);await assert.rejects(f.service.handle({action:'execute-plan',offerId:r.offerId}),/逾時/);const other=fixture(),o=await other.service.handle({action:'plan',request:request()});other.keys.TDX_CLIENT_SECRET='rotated-test-secret';await assert.rejects(other.service.handle({action:'execute-plan',offerId:o.offerId}),/設定已變更/);});
test('unmatched MaaS rail schedule falls back to the same confirmed stations official timetable',async()=>{
 const station=(p,id)=>({StationID:id,StationName:{Zh_tw:p.name},StationPosition:{PositionLat:p.lat,PositionLon:p.lon}});
 const f=fixture({fetch:async url=>{
  if(url.includes('/maas/routing'))return response({result:'success',data:{routes:[route(A,B,add(time,10),10,'TRA')]}});
  if(url.includes('/Rail/TRA/StationOfLine'))return response([{LineID:'fixture-line',Stations:[{StationID:'a',StationName:{Zh_tw:A.name},Sequence:1},{StationID:'b',StationName:{Zh_tw:B.name},Sequence:2}]}]);
  if(url.includes('/Rail/TRA/Station'))return response([station(A,'a'),station(B,'b')]);
  if(url.includes('/Rail/TRA/Shape'))return response([{LineID:'fixture-line',Geometry:`LINESTRING(${A.lon} ${A.lat}, ${B.lon} ${B.lat})`}]);
  if(url.includes('/Rail/TRA/DailyTimetable'))return response([{TrainDate:'2026-10-05',DailyTrainInfo:{TrainNo:'test-101',TrainTypeName:{Zh_tw:'區間'},TrainTypeID:'1131',SuspendedFlag:0},OriginStopTime:{StationID:'a',DepartureTime:'10:20'},DestinationStopTime:{StationID:'b',ArrivalTime:'10:30'}}]);
 }});
 const result=await f.service.plan(request());assert.equal(result.plans.length,1);const train=result.plans[0].segments[0];assert.equal(train.trainNumber,'test-101');assert.equal(train.transportType,'區間');assert.equal(train.trainClassStatus,'matched');assert.equal(train.geometryStatus,'ready');assert.equal(train.departureTime,'2026-10-05T10:20:00+08:00');assert(result.notices.some(n=>n.includes('當日官方班表')));
});

test('two unsuccessful identical TDX queries use official fallback without repeating MaaS forever',async()=>{
 const f=fixture({fetch:async url=>url.includes('/maas/routing')?response({result:'success',data:{routes:[]}}):null});
 const r=request({allowedModes:['BUS']});
 const stages=[];for(let i=0;i<3;i++){const outcome=await f.service.plan(r,{refresh:true,onProgress:m=>stages.push(m)});assert.equal(outcome.plans.length,0);assert.equal(outcome.request.allowedModes[0],'BUS');assert.equal(outcome.diagnostic.classification,'no-matching-plan');}
 assert.equal(f.calls.filter(c=>c.url.includes('/maas/routing')).length,2);assert.ok(stages.some(s=>s.includes('連續兩次')));
});
test('quota diagnosis survives the fallback threshold and no fictional reset time is added',async()=>{
 const f=fixture({fetch:async url=>url.includes('/maas/routing')?new Response('monthly quota exceeded',{status:429}):null});
 const r=request({allowedModes:['BUS']});let outcome;for(let i=0;i<3;i++)outcome=await f.service.plan(r);
 assert.equal(outcome.diagnostic.classification,'quota');assert.equal(outcome.diagnostic.upstreamStatus,429);assert.equal(outcome.diagnostic.rateLimit.resetAt,null);assert.equal(outcome.plans.length,0);const forced=await f.service.plan(r,{forceOfficial:true});assert.equal(forced.diagnostic.classification,'quota');assert.match(forced.diagnostic.message,/用量/);
});
