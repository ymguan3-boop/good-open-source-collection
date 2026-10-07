import {robotsAllows} from './officialFareSources.js';
import {createOfficialRailGeometry} from './officialRailGeometry.js';
import {finalizePlan,taipeiTime,tdxError} from './tdxTrip.js';
import {traClass} from './tdxFareWeb.js';
import {vehicleAllowed} from '../../src/taiwan/farePreference.js';
export const TRA_ODS_LIST='https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/railway_schedule/JSON/list';
export const TRA_ODS_STATIONS='https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee';
export const TRA_ODS_MANUAL='https://ods.railway.gov.tw/tra-ods-web/ods/download/devDoc/8ae4cac27f4c0348017f4dbdd21d0181';
// ODS official developer manual V1.5. Unknown/new codes are excluded, never guessed.
const classes={'1100':'自強','1101':'自強(太,障)','1102':'自強(腳,障)','1103':'自強(障)','1107':'自強(普,障)','1108':'自強(PP障)','1109':'自強(PP親)','110A':'自強(PP障12)','110B':'自強(E12)','110C':'自強(E3)','110D':'自強(D28)','110E':'自強(D29)','110F':'自強(D31)','110G':'自強(3000障)','110H':'自強(3000親障)','1110':'莒光','1111':'莒光(障)','1114':'莒光(腳)','1115':'莒光(腳,障)','1131':'區間車','1132':'區間快','1135':'區間車(腳,障)'};
const normal=v=>String(v||'').replaceAll('臺','台').replace(/^(?:台鐵|高鐵)/,'').replace(/(?:火車站|車站|站)$/,'').trim();
const distance=(a,b)=>Math.hypot((a.lon-b.lon)*100900,(a.lat-b.lat)*111200);
const iso=(date,time)=>taipeiTime(`${date}T${time}`);
export function createOfficialTransit({fetcher=fetch,credential,now=Date.now,ttlMs=3600000,checkPolicy=true,railGeometry=createOfficialRailGeometry()}={}){
 const cache=new Map(),pending=new Map();let policy=null,lastFetch=0,queue=Promise.resolve();
 async function read(url,signal){
  const u=new URL(url);if(u.origin!=='https://ods.railway.gov.tw'||u.search||u.hash||u.username||u.password||!/^\/tra-ods-web\/ods\/download\/dataResource\/(?:railway_schedule\/JSON\/list|0518b833e8964d53bfea3f7691aea0ee|exceptionDataResource\/[a-f0-9]{32})$/.test(u.pathname))throw Error('班次來源不在官方允許清單');
  if(checkPolicy&&!policy){const r=await fetcher(`${u.origin}/robots.txt`,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(6000)].filter(Boolean))});if(r.status!==404&&!r.ok)throw Error('無法確認臺鐵公開資料 robots 政策');policy=r.status===404?'':await r.text();}
  const rule=robotsAllows(policy||'',u.pathname,'GodsEyeTaiwanTransit');if(!rule.allowed)throw Error('官方網站不允許擷取此資料');
  const task=queue.catch(()=>{}).then(async()=>{signal?.throwIfAborted();const delay=Math.max(0,lastFetch+rule.delayMs-now());if(delay)await new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal.reason);},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},delay);signal?.addEventListener('abort',stop,{once:true});});lastFetch=now();const r=await fetcher(url,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean)),headers:{'User-Agent':'GodsEyeTaiwanTransit/1.0'}});if(!r.ok)throw Error(`臺鐵公開資料 HTTP ${r.status}`);if(Number(r.headers.get('content-length'))>12000000){await r.body?.cancel();throw Error('官方班表超過處理大小');}const text=await r.text();if(text.length>12000000)throw Error('官方班表超過處理大小');return text;});queue=task.then(()=>{},()=>{});return task;
 }
 async function cached(key,loader,signal){const old=cache.get(key);if(old&&now()-old.at<ttlMs)return old.value;if(!pending.has(key)){const task=loader().then(value=>{cache.set(key,{at:now(),value});if(cache.size>12)cache.delete(cache.keys().next().value);return value;});pending.set(key,task);task.finally(()=>pending.delete(key)).catch(()=>{});}const value=await pending.get(key);signal?.throwIfAborted();return value;}
 async function stations(signal){return cached('stations',async()=>{const data=JSON.parse(await read(TRA_ODS_STATIONS,signal));if(!Array.isArray(data))throw Error('官方車站格式已變更');const rows=data.map(r=>{const [lat,lon]=String(r.gps).split(/\s+/).map(Number);return {id:String(r.stationCode),name:r.stationName,lat,lon,address:r.stationAddrTw,source:'臺鐵官方 ODS 車站資料',sourceUrl:TRA_ODS_STATIONS};}).filter(s=>/^\d{4}$/.test(s.id)&&s.name&&s.lat>=20&&s.lat<=27&&s.lon>=117&&s.lon<=124);if(rows.length<100)throw Error('官方車站資料驗證未通過');return rows;},signal);}
 async function timetable(date,signal){return cached(date,async()=>{const html=await cached('listing',()=>read(TRA_ODS_LIST,signal),signal),file=date.replaceAll('-','')+'.json',links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(\d{8}\.json)<\/a>/g)].filter(m=>m[2]===file);if(links.length!==1)throw tdxError('OFFICIAL_DATE_UNAVAILABLE','臺鐵官方尚未公開指定日期班表；不能以其他日期冒充',422);const sourceUrl=new URL(links[0][1],TRA_ODS_LIST).href,data=JSON.parse(await read(sourceUrl,signal));if(!Array.isArray(data.TrainInfos)||!data.UpdateTime||data.TrainInfos.length<100)throw Error('臺鐵公開班表格式驗證未通過');return {rows:data.TrainInfos,sourceUrl,sourceUpdatedAt:data.UpdateTime,fetchedAt:new Date(now()).toISOString()};},signal);}
 async function walking(from,to,signal){
  if(distance(from,to)<80)return null;
  const key=credential('TOMTOM_API_KEY');if(!key)throw tdxError('WALK_ROUTE_UNAVAILABLE','缺少可核實的車站接駁步行路線服務；未用直線冒充道路',422);
  const url=new URL(`https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json`);url.search=new URLSearchParams({key,travelMode:'pedestrian',routeType:'shortest',traffic:'false'});
  const keyId=`walk:${from.lat},${from.lon}:${to.lat},${to.lon}`;
  return cached(keyId,async()=>{const r=await fetcher(url.href,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)].filter(Boolean))});if(!r.ok)throw tdxError('WALK_ROUTE_UNAVAILABLE',`接駁步行路線 HTTP ${r.status}`,422);const data=await r.json(),route=data.routes?.[0],coordinates=route?.legs?.flatMap(l=>l.points).map(p=>[p.longitude,p.latitude]);if(!coordinates||coordinates.length<2||coordinates.length>50000||!coordinates.every(p=>p.every(Number.isFinite))||!Number.isFinite(route.summary?.travelTimeInSeconds)||route.summary.travelTimeInSeconds<=0||distance({lon:coordinates[0][0],lat:coordinates[0][1]},from)>100||distance({lon:coordinates.at(-1)[0],lat:coordinates.at(-1)[1]},to)>100)throw Error('步行路線資料驗證未通過');return {from,to,durationSeconds:route.summary.travelTimeInSeconds,distanceMeters:route.summary.lengthInMeters,geometry:{type:'LineString',coordinates},geometryStatus:'ready',geometrySource:'TomTom 實際步行路線',geometryUpdatedAt:new Date(now()).toISOString()};},signal);
 }
 function connections(data,from,to,request,earliest,latest){
  const date=taipeiTime(new Date(earliest).toISOString()).slice(0,10),out=[];
  for(const train of data.rows){const kind=classes[train.CarClass];if(!kind||train.Type!=='1'||!vehicleAllowed(kind,train.CarClass,request.farePreference.modePreferences.TRA)||request.traTrainType!=='any'&&traClass(kind)!==request.traTrainType||request.farePreference.modePreferences.TRA.seatClasses.length===1&&request.farePreference.modePreferences.TRA.seatClasses[0]==='premium')continue;
   const stops=[...(train.TimeInfos||[])].sort((a,b)=>Number(a.Order)-Number(b.Order)),a=stops.findIndex(s=>s.Station===from.id),b=stops.findIndex(s=>s.Station===to.id);if(a<0||b<=a)continue;
   let day=0,previous=-Infinity;const timed=[];let valid=true;
   for(const stop of stops){if(!/^\d\d:\d\d:\d\d$/.test(stop.ARRTime)||!/^\d\d:\d\d:\d\d$/.test(stop.DEPTime)){valid=false;break;}let arrival=Date.parse(iso(date,stop.ARRTime))+day*86400000;if(arrival<previous){day++;arrival+=86400000;}let departure=Date.parse(iso(date,stop.DEPTime))+day*86400000;if(departure<arrival)departure+=86400000;timed.push({arrival,departure});previous=departure;}if(!valid)continue;
   const dep=timed[a].departure,arr=timed[b].arrival;if(dep<earliest||dep<now()||arr<=dep||latest&&arr>latest)continue;
   out.push({trainNumber:train.Train,transportType:kind,trainTypeId:train.CarClass,from,to,departureTime:taipeiTime(new Date(dep).toISOString()),arrivalTime:taipeiTime(new Date(arr).toISOString()),stopIds:stops.slice(a+1,b).map(s=>s.Station),sourceUrl:data.sourceUrl,sourceTime:data.fetchedAt,sourceUpdatedAt:data.sourceUpdatedAt});
  }
  return out.sort((a,b)=>Date.parse(a.arrivalTime)-Date.parse(b.arrivalTime));
 }
 async function plan(request,{signal,onProgress=()=>{}}={}){
  if(!request.allowedModes.includes('TRA'))return {plans:[],request,notices:['官方公開班表備援目前支援臺鐵與步行接駁；所選運具不含臺鐵。']};
  onProgress('工作中... 已完成條件檢查；正在擷取臺鐵官方公開班表與車站資料。');
  const reverse=request.timeMode==='arrival',deadline=request.arrivalDeadline?Date.parse(request.arrivalDeadline):null,date=taipeiTime(reverse?request.arrivalDeadline:request.departureTime).slice(0,10),dayStart=Date.parse(`${date}T00:00:00+08:00`),start=request.departureTime?Date.parse(request.departureTime):Math.max(now(),dayStart),list=await stations(signal),data=await timetable(date,signal),points=[request.origin,...request.waypoints.map(w=>w.location),request.destination],stationMap=new Map(list.map(s=>[s.id,s]));
  const candidates=p=>{const exact=list.filter(s=>normal(s.name)===normal(p.name)&&distance(s,p)<250);if(exact.length===1)return exact;return list.map(s=>({s,d:distance(s,p)})).filter(x=>x.d<=3500).sort((a,b)=>a.d-b.d).slice(0,3).map(x=>x.s);};
  let states=[{time:reverse?deadline:start,segments:[],legs:0}];const routeCache=new Map(),order=Array.from({length:points.length-1},(_,i)=>i);if(reverse)order.reverse();
  for(const index of order){
   signal?.throwIfAborted();onProgress(`工作中... 已取得官方班表；正在串接第 ${index+1}/${points.length-1} 段與車站接駁路線。`);
   const next=[],from=points[index],to=points[index+1],origins=candidates(from),destinations=candidates(to);
   for(const a of origins)for(const b of destinations){if(a.id===b.id)continue;
    let before,after;try{before=await walking(from,a,signal);after=await walking(b,to,signal);}catch(error){signal?.throwIfAborted();continue;}
    if((before||after)&&request.excludedModes.includes('WALK'))continue;
    for(const state of states){const waypoint=reverse?request.waypoints[index]:null,limit=reverse?Math.min(state.time-(waypoint?.stayDurationMinutes||0)*60000,waypoint?.arrivalTime?Date.parse(waypoint.arrivalTime):Infinity):deadline;
     const earliest=reverse?Math.max(start,dayStart):state.time+(before?.durationSeconds||0)*1000+300000,latest=limit?limit-(after?.durationSeconds||0)*1000:null;
     let options=connections(data,a,b,request,earliest,latest);if(reverse)options.sort((a,b)=>Date.parse(b.departureTime)-Date.parse(a.departureTime));
     if(request.preference==='cheapest')options=options.filter((r,i)=>options.findIndex(x=>x.transportType===r.transportType)===i).slice(0,8);else options=options.slice(0,3);
     for(const rail of options){
      if(rail.stopIds.some(id=>!stationMap.has(id)))continue;
      let fields;const shapeKey=JSON.stringify([a.id,b.id,rail.stopIds]);try{if(!routeCache.has(shapeKey))routeCache.set(shapeKey,await railGeometry.route(a,b,rail.stopIds.map(id=>stationMap.get(id)),signal));fields=routeCache.get(shapeKey);}catch(error){signal?.throwIfAborted();}if(!fields)continue;
      const segments=[];const addWalk=(walk,time)=>{if(!walk)return;segments.push({...walk,mode:'WALK',routeName:'步行接駁',departureTime:taipeiTime(new Date(time).toISOString()),arrivalTime:taipeiTime(new Date(time+walk.durationSeconds*1000).toISOString()),fare:{amount:0,currency:'TWD',complete:true},realtimeStatus:'scheduled',source:'TomTom 實際道路',sourceTime:new Date(now()).toISOString()});};
      const leave=reverse?Date.parse(rail.departureTime)-(before?.durationSeconds||0)*1000-300000:state.time;if(leave<now()||leave<start||reverse&&request.waypoints[index-1]?.departureTime&&leave<Date.parse(request.waypoints[index-1].departureTime))continue;
      addWalk(before,leave);segments.push({...rail,...fields,mode:'TRA',routeName:`${rail.transportType} ${rail.trainNumber}`,agency:'國營臺灣鐵路股份有限公司',durationSeconds:(Date.parse(rail.arrivalTime)-Date.parse(rail.departureTime))/1000,trainClass:traClass(rail.transportType),trainClassStatus:'matched',intermediateStops:rail.stopIds.map(id=>stationMap.get(id)),source:'臺鐵官方 ODS 每日班表',trainTypeSource:TRA_ODS_MANUAL,realtimeStatus:'scheduled',fare:{amount:null,complete:false}});addWalk(after,Date.parse(rail.arrivalTime));
      const arrival=Date.parse(rail.arrivalTime)+(after?.durationSeconds||0)*1000,w=request.waypoints[index];if(w?.arrivalTime&&arrival>Date.parse(w.arrivalTime))continue;
      const time=reverse?leave:Math.max(arrival+(w?.stayDurationMinutes||0)*60000,w?.departureTime?Date.parse(w.departureTime):0);if(!reverse&&deadline&&time>deadline)continue;next.push({time,segments:reverse?[...segments,...state.segments]:[...state.segments,...segments],arrival,legs:state.legs+1});
     }
    }
   }
   const signature=s=>JSON.stringify(s.segments.map(x=>[x.mode,x.trainNumber,x.from.id,x.to.id,x.departureTime]));states=[...new Map(next.sort((a,b)=>reverse?b.time-a.time:a.time-b.time).map(s=>[signature(s),s])).values()].slice(0,request.preference==='cheapest'?8:3);if(!states.length)break;
  }
  const plans=states.filter(s=>s.segments.length&&s.legs===points.length-1).map((s,index)=>finalizePlan({id:`official-${index}`,label:index?'官方班表備援 '+(index+1):'官方班表推薦方案',segments:s.segments,departureTime:s.segments[0].departureTime,arrivalTime:s.segments.at(-1).arrivalTime,durationSeconds:(Date.parse(s.segments.at(-1).arrivalTime)-Date.parse(s.segments[0].departureTime))/1000,transfers:s.segments.filter(x=>x.mode==='TRA').length-1,walkDistanceMeters:s.segments.filter(x=>x.mode==='WALK').reduce((n,x)=>n+x.distanceMeters,0),geometryStatus:'ready',sources:['臺鐵官方 ODS 每日班表',TRA_ODS_LIST,TRA_ODS_STATIONS,'https://data.gov.tw/dataset/73220','TomTom 實際步行路線'],notices:['以指定日期官方公開班表及核實道路串接；保留中繼點、停留時間與乘客設定。','備援比較臺鐵直達班次及步行接駁，未窮舉其他運具或鐵路轉乘；班表不是即時餘票、延誤或營運股道。']}));
  if(reverse)for(const [i,p]of plans.entries()){p.departureTime=taipeiTime(new Date(states[i].time).toISOString());p.latestLeaveTime=p.departureTime;p.durationSeconds=(Date.parse(p.arrivalTime)-Date.parse(p.departureTime))/1000;p.notices.push('以指定日期官方班表反向核實抵達期限；步行接駁預留 5 分鐘進站時間，非即時延誤保證。');}
  onProgress(plans.length?'工作中... 已完成班次、停留與完整路線查核；正在核實乘客票價。':'官方班表查核已結束，目前條件沒有取得可核實完整路徑。');
  return {plans,request,sourceStatus:{tdx:'fallback',officialTimetable:'ready',geometry:plans.length?'ready':'missing',realtime:'scheduled'},notices:plans.length?['已改用臺鐵官方公開班表備援。']:['公開班表備援未取得符合期限及完整線型的方案；未自行放寬您的限制。']};
 }
 return {plan,stations,timetable};
}
