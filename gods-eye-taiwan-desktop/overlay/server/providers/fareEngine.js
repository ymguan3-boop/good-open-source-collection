import {parseTraRateRules,estimateTraFare,estimateFromAdult} from './fareEstimates.js';
import {parseHsrTable,parseBikeRate} from './fareWebAdapters.js';
import {join} from 'node:path';
import {createFareCache,fareHash} from './fareCache.js';
import {createOfficialFareLookup,traClass,TRA_FARE_URL} from './tdxFareWeb.js';
import {officialFareSource,createOfficialFareFetcher} from './officialFareSources.js';
import {normalizeFarePreference,PASSENGER_NAMES,SEAT_NAMES,vehicleAllowed} from '../../src/taiwan/farePreference.js';
const BASE='https://tdx.transportdata.tw/api/basic';
const fareClass={adult:1,student:2,child:3,senior:4,disabled:5,companion:7};
const cabin={standard:1,business:2,unreserved:3};
const media={single:1,electronic:3};
const names=['TRA','HSR','BUS','METRO','LRT','BIKE'];
const id=x=>{if(!/^[\w-]{1,100}$/.test(String(x)))throw Error('官方站點代碼無效');return encodeURIComponent(x);};
const normalized=x=>String(x||'').replaceAll('臺','台').replace(/站$|\s/g,'');
const iso=(value)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const unique=rows=>{const valid=rows.filter(r=>r.Price!==null&&typeof r.Price!=='undefined'&&Number.isFinite(Number(r.Price))&&Number(r.Price)>=0);return valid.length&&new Set(valid.map(r=>Number(r.Price))).size===1?valid[0]:null;};
const unknown='目前無法取得可靠的最新票價資料。';
export function selectOfficialFare(rows,segment,profile,seat,fareMedia='single'){
  if(segment.mode==='TRA'){
    if(!traClass(segment.transportType))return null;
    const label={adult:/全票|成人/,child:/孩童|兒童/,senior:/敬老/,disabled:/愛心(?!陪)/,companion:/愛陪|愛心陪/}[profile.type];
    return label?unique(rows.filter(r=>traClass(r.TicketType)===traClass(segment.transportType)&&label.test(r.TicketType)&&!/(?:折|優惠|團體|早鳥)/.test(r.TicketType)&&((seat==='premium')===/商務|騰雲/.test(r.TicketType))&&(profile.type!=='adult'||!/孩童|兒童|敬老|愛心|愛陪/.test(r.TicketType)))):null;
  }
  return unique(rows.filter(r=>(segment.mode!=='HSR'||Number(r.Price)>0)&&Number(r.TicketType)===media[fareMedia]&&Number(r.FareClass)===fareClass[profile.type]&&(segment.mode!=='HSR'||Number(r.CabinClass)===cabin[seat])&&!r.CitizenCode&&!(r.DiscountPeriods||[]).length));
}
export function fareComparison(plans){
  const known=plans.filter(p=>p.fareComplete&&Number.isFinite(p.totalFare)&&Number.isFinite(p.durationSeconds));
  const comparisons=[];for(let i=0;i<known.length;i++)for(let j=i+1;j<known.length;j++){const a=known[i],b=known[j];comparisons.push({a:a.id,b:b.id,extraAmount:b.totalFare-a.totalFare,savedMinutes:Math.round((a.durationSeconds-b.durationSeconds)/60),currency:'TWD'});}return comparisons;
}
export function rankTransitPlans(plans,preference='recommended',requestedDeparture=null){
  const max=(field,floor)=>Math.max(floor,...plans.map(p=>Number(p[field])||0));
  const time=max('durationSeconds',1),cost=max('totalFare',1),walk=max('walkDistanceMeters',1),transfers=max('transfers',1);
  for(const p of plans){const transport=p.segments.filter(s=>!['WALK','BIKE'].includes(s.mode)),delayKnown=transport.every(s=>Number.isFinite(s.delayMinutes)),delay=delayKnown?transport.reduce((n,s)=>n+s.delayMinutes,0):null;
    const begin=Date.parse(requestedDeparture),departure=Date.parse(p.departureTime),wait=Number.isFinite(begin)&&Number.isFinite(departure)?Math.max(0,(departure-begin)/1000):transport.every(s=>Number.isFinite(s.waitSeconds))?transport.reduce((n,s)=>n+s.waitSeconds,0):null;
    p.recommendationMetrics={durationSeconds:p.durationSeconds,totalFare:p.totalFare,fareComplete:p.fareComplete,transfers:p.transfers,walkDistanceMeters:p.walkDistanceMeters,waitSeconds:wait,waitStatus:Number.isFinite(wait)?'calculated-from-schedule':'unknown',delayMinutes:delay,delayStatus:delayKnown?'verified':'unknown'};
    p.recommendationScore=.35*p.durationSeconds/time+.25*(p.fareComplete?p.totalFare/cost:1)+.15*p.transfers/transfers+.1*p.walkDistanceMeters/walk+.1*(Number.isFinite(wait)?Math.min(1,wait/3600):1)+.05*(delayKnown?Math.min(1,delay/30):1);
  }
  const recommended=[...plans].sort((a,b)=>a.recommendationScore-b.recommendationScore)[0],fastest=[...plans].sort((a,b)=>a.durationSeconds-b.durationSeconds)[0],cheapest=plans.filter(p=>p.fareComplete&&Number.isFinite(p.totalFare)).sort((a,b)=>a.totalFare-b.totalFare)[0];for(const p of plans)p.badges=[...(p===recommended?['綜合推薦']:[]),...(p===fastest?['最快']:[]),...(p===cheapest?['最便宜（已核實候選）']:[])];
  const score=p=>preference==='cheapest'?(p.fareComplete?p.totalFare:Infinity):preference==='fastest'?p.durationSeconds:preference==='fewest-transfers'?p.transfers:preference==='least-walking'?p.walkDistanceMeters:preference==='lowest-delay'?(p.recommendationMetrics.delayMinutes??Infinity):p.recommendationScore;
  return plans.sort((a,b)=>!Number.isFinite(score(a))&&!Number.isFinite(score(b))?0:score(a)-score(b)||a.durationSeconds-b.durationSeconds);
}
export function createFareService({basic,stations,fetcher=fetch,now=Date.now,cacheFile=null,fareCache,checkPolicy=true}={}){
  const cache=fareCache||createFareCache({file:cacheFile,now}),web=createOfficialFareLookup({fetcher,now,checkPolicy,ttlMs:()=>cache.ttlMs}),publicFetch=checkPolicy?createOfficialFareFetcher({fetcher,now}):fetcher;
  const contextByKey=new Map(),pages=new Map();let metadata=null,metadataDate=null,metadataAt=0,updateTask=null;
  const keyFor=(s,p,seat,fm)=>fareHash([s.mode,s.railSystem,s.operatorId||s.agency,s.routeId,s.subRouteId,s.direction,s.from?.id,s.to?.id,s.transportType,seat,p.type,fm,s.mode==='TRA'?String(s.departureTime).slice(0,10):null,s.mode==='BIKE'?[s.durationSeconds,s.bikeSystem,s.bikeRegion,s.to.bikeRegion]:null]);
  async function metadataOptions({signal,refresh=false,date=null}={}){
    date=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:new Date(now()+8*3600000).toISOString().slice(0,10);
    if(metadata&&metadataDate===date&&!refresh&&now()-metadataAt<Math.min(cache.ttlMs,3600000))return structuredClone(metadata);
    const result={vehicleTypes:[],hsrSeatClasses:[],traSeatClasses:[],passengerTypes:[{id:'adult',name:PASSENGER_NAMES.adult}],fareMedia:[{id:'single',name:'一般單程票'}],notices:[],fetchedAt:new Date(now()).toISOString(),sourceUrl:BASE+'/v2/Rail/TRA/TrainType'};
    const tasks=await Promise.allSettled([
      basic('/v2/Rail/TRA/TrainType',cache.ttlMs,signal,{'$top':100},refresh),
      basic('/v2/Rail/THSR/ODFare/1000/to/1070',cache.ttlMs,signal,{},refresh),
      basic('/v2/Bus/RouteFare/City/Taipei/307',cache.ttlMs,signal,{'$top':10},refresh),
    ]);
    if(tasks[0].status==='fulfilled'){result.vehicleTypes=tasks[0].value.filter(r=>r.TrainTypeID&&r.TrainTypeName?.Zh_tw).map(r=>({id:String(r.TrainTypeID),name:r.TrainTypeName.Zh_tw,code:r.TrainTypeCode,sourceUpdatedAt:r.UpdateTime,seatClasses:Array.isArray(r.SeatClasses)?r.SeatClasses.filter(s=>['normal','premium'].includes(s)):[]}));result.traSeatClasses=result.vehicleTypes.some(r=>r.seatClasses.length)?['normal','premium']:[];}
    else result.notices.push('臺鐵官方車種清單暫不可用；預設全部可搭，指定車種仍依實際班表核對。');
    // The selected date's actual train data takes precedence over catalogue-only names.
    try{const daily=await basic('/v2/Rail/TRA/DailyTimetable/TrainDate/'+date,3600000,signal,{'$top':3000,'$select':'TrainDate,DailyTrainInfo'},refresh),available=new Map();
      for(const row of daily){const info=row.DailyTrainInfo,name=typeof info?.TrainTypeName==='string'?info.TrainTypeName:info?.TrainTypeName?.Zh_tw;if(row.TrainDate!==date||Number(info?.SuspendedFlag)===1||!info?.TrainTypeID||!name)continue;const original=result.vehicleTypes.find(v=>v.id===String(info.TrainTypeID));available.set(String(info.TrainTypeID),{...original,id:String(info.TrainTypeID),name,code:info.TrainTypeCode||original?.code,seatClasses:original?.seatClasses||[],sourceUpdatedAt:row.UpdateTime||info.UpdateTime,availableDate:date});}
      if(available.size){result.vehicleTypes=[...available.values()];result.scheduleDate=date;result.vehicleSourceUrl=BASE+'/v2/Rail/TRA/DailyTimetable/TrainDate/'+date;result.notices.push('臺鐵選項依 '+date+' 官方實際班次產生；起訖、座位及可搭時間仍於規劃時逐班核對。');}
      else result.notices.push('指定日期未取得可辨識班次車種；目前顯示官方車種目錄，不能保證該日期或路線有班次。');
    }catch{signal?.throwIfAborted();result.notices.push('指定日期班次清單暫不可用；顯示官方車種目錄並於規劃時核對實際班次，不把資料不足當作車種不符。');}

    if(tasks[1].status==='fulfilled'){const fares=tasks[1].value.flatMap(r=>r.Fares||[]).filter(f=>Number(f.TicketType)===1&&Number(f.Price)>=0);result.hsrSeatClasses=Object.keys(cabin).filter(k=>fares.some(f=>Number(f.CabinClass)===cabin[k]));for(const [type,code]of Object.entries(fareClass))if(fares.some(f=>Number(f.FareClass)===code)&&!result.passengerTypes.some(p=>p.id===type))result.passengerTypes.push({id:type,name:PASSENGER_NAMES[type]});}
    else result.notices.push('高鐵官方車廂票價清單暫不可用，不顯示未核實選项。');
    if(tasks[2].status==='fulfilled'){const fares=tasks[2].value.flatMap(r=>[...(r.SectionFares||[]),...(r.ODFares||[]),...(r.StageFares||[])]).flatMap(r=>r.Fares||[]).filter(f=>Number(f.Price)>=0);if(fares.some(f=>Number(f.TicketType)===3))result.fareMedia.push({id:'electronic',name:'電子票證（公車／捷運／輕軌；僅計已核實費率）'});for(const [type,code]of Object.entries(fareClass))if(fares.some(f=>Number(f.FareClass)===code)&&!result.passengerTypes.some(p=>p.id===type))result.passengerTypes.push({id:type,name:PASSENGER_NAMES[type]});}
    // Public TRA quote form confirms supported passenger types; the page is data only.
    try{const response=await publicFetch(TRA_FARE_URL,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)].filter(Boolean))});if(response.ok){const html=await response.text();if(html.length<500000){const select=html.match(/<select\b(?=[^>]*\bname=["']tip114QueryVOs\[0\]\.ticketPriceType["'])[^>]*>([\s\S]*?)<\/select>/i)?.[1]||'';for(const [type,code]of Object.entries({adult:1,child:2,senior:3,disabled:4,companion:5}))if(new RegExp(`<option[^>]*value=["']${code}["']`).test(select)&&!result.passengerTypes.some(p=>p.id===type))result.passengerTypes.push({id:type,name:PASSENGER_NAMES[type]});}}else await response.body?.cancel();}catch{result.notices.push('臺鐵網頁票種清單未取得；既有官方已確認票種保留。');}
    if(result.vehicleTypes.length||result.hsrSeatClasses.length){metadata=result;metadataDate=date;metadataAt=now();}return result;
  }
  async function railRows(s,signal,refresh){
    if(['TRA','HSR'].includes(s.mode)&&(!s.from.id||!s.to.id)){
      const list=await stations(s.mode,signal),find=p=>list.filter(r=>normalized(r.StationName?.Zh_tw)===normalized(p.name)&&Math.abs(Number(r.StationPosition?.PositionLat)-p.lat)<.01&&Math.abs(Number(r.StationPosition?.PositionLon)-p.lon)<.01),a=find(s.from),b=find(s.to);if(a.length!==1||b.length!==1)return null;s.from.id=a[0].StationID;s.to.id=b[0].StationID;
    }
    if(!s.from.id||!s.to.id)return null;
    const system=s.mode==='HSR'?'THSR':s.mode==='TRA'?'TRA':s.railSystem;if(!system)return null;
    const path=['METRO','LRT'].includes(s.mode)?`/v2/Rail/Metro/ODFare/${id(system)}`:`/v2/Rail/${system}/ODFare/${id(s.from.id)}/to/${id(s.to.id)}`;
    const literal=x=>String(x).replaceAll("'","''"),query=['METRO','LRT'].includes(s.mode)?{'$top':10,'$filter':`OriginStationID eq '${literal(s.from.id)}' and DestinationStationID eq '${literal(s.to.id)}'`}:{};
    const rows=await basic(path,cache.ttlMs,signal,query,refresh),matches=rows.filter(r=>r.OriginStationID===s.from.id&&r.DestinationStationID===s.to.id);
    if(matches.length!==1)return null;return {row:matches[0],rows:matches[0].Fares||[],sourceUrl:BASE+path,method:'official-od-table'};
  }
  async function busRows(s,signal,refresh){
    if(!s.routeId||!s.operatorId||!s.from.stopId||!s.to.stopId)return null;
    const suffix=s.busCity?`City/${id(s.busCity)}/${encodeURIComponent(s.routeName.replace(/[去返]$/,''))}`:`InterCity/${encodeURIComponent(s.routeName.replace(/[去返]$/,''))}`,path=`/v2/Bus/RouteFare/${suffix}`;
    const records=await basic(path,cache.ttlMs,signal,{'$top':100},refresh),matches=records.filter(r=>r.RouteID===s.routeId&&r.OperatorID===s.operatorId&&(Number(r.IsForAllSubRoutes)===1||r.SubRouteID===s.subRouteId));
    if(matches.length!==1)return null;const row=matches[0];if(Number(row.IsFreeBus)===1)return {row,rows:[{TicketType:1,FareClass:1,Price:0}],sourceUrl:BASE+path,method:'official-free-route',free:true};
    let priceRows=[];const same=x=>x.Direction===s.direction;
    if(Number(row.FarePricingType)===1)priceRows=(row.ODFares||[]).filter(r=>same(r)&&r.OriginStop?.StopID===s.from.stopId&&r.DestinationStop?.StopID===s.to.stopId);
    if(Number(row.FarePricingType)===2)priceRows=(row.StageFares||[]).filter(r=>same(r)&&r.OriginStage?.StopID===s.from.stopId&&r.DestinationStage?.StopID===s.to.stopId);
    // A route-wide single section with no buffer is fully specified. Multi-zone
    // fares need a verified stop/zone relation; do not guess a crossing count.
    let sections=1;
    if(Number(row.FarePricingType)===0&&row.SectionFares?.length===1){
      const rule=row.SectionFares[0],buffers=(rule.BufferZones||[]).filter(b=>b.Direction===s.direction);
      if(!buffers.length){if(!(rule.BufferZones||[]).length)priceRows=[rule];}
      else if(s.busStops?.length&&Number.isFinite(s.from.stopSequence)&&Number.isFinite(s.to.stopSequence)){
        const stops=new Map(s.busStops.map(p=>[p.id,p.sequence]));let verified=true;
        for(const b of buffers){const a=stops.get(b.FareBufferZoneOrigin?.StopID),z=stops.get(b.FareBufferZoneDestination?.StopID);if(!Number.isFinite(a)||!Number.isFinite(z)){verified=false;break;}const low=Math.min(a,z),high=Math.max(a,z);if(s.from.stopSequence<low&&s.to.stopSequence>high)sections++;}
        if(verified)priceRows=[rule];
      }
    }
    if(priceRows.length!==1)return null;return {row,rows:priceRows[0].Fares||[],sourceUrl:BASE+path,sections,method:['official-section-rule','official-stop-pair','official-stage-pair'][Number(row.FarePricingType)]};
  }
  async function webPage(url,{signal,refresh=false}={}){
    const old=pages.get(url);if(old&&!refresh&&now()-old.at<cache.ttlMs)return old.html;
    const response=await publicFetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)].filter(Boolean))});if(!response.ok){await response.body?.cancel();throw Error(`官方票價頁 HTTP ${response.status}`);}if(Number(response.headers?.get('content-length'))>500000){await response.body?.cancel();throw Error('官方票價頁超過處理上限');}const html=await response.text();if(html.length>500000)throw Error('官方票價頁超過處理上限');if(pages.size>=40)pages.delete(pages.keys().next().value);pages.set(url,{at:now(),html});return html;
  }
  async function extraWeb(s,p,seat,options){
    if(s.mode==='HSR'){
      const url=seat==='unreserved'?'https://en.thsrc.com.tw/ArticleContent/4db23462-3589-4f0e-8158-29f5ccfe3117':'https://en.thsrc.com.tw/ArticleContent/4c3efc1d-e6df-4bfd-97b4-52e89f79ee5c',html=await webPage(url,options),amount=parseHsrTable(html,s,p.type,seat);return amount===null?null:{amount,sourceUrl:url,source:'台灣高鐵官方票價表',contentHashInput:html};
    }
    if(s.mode==='BIKE'&&s.bikeSystem&&s.bikeRegion&&s.bikeRegion===s.to.bikeRegion){
      const url=`https://www.youbike.com.tw/region/${s.bikeRegion}/rate/`;if(!officialFareSource(url))return null;const html=await webPage(url,options),amount=parseBikeRate(html,s.bikeSystem,s.durationSeconds);return amount===null?null:{amount,sourceUrl:url,source:'YouBike 官方基本費率',contentHashInput:html,notice:'按規劃租借時間計算基礎費率；未套用會員、地方補助或轉乘優惠，實際費用依還車時間。'};
    }
    return null;
  }
  async function unitQuote(s,p,seat,fm,{signal,refresh=false}={}){
    const key=keyFor(s,p,seat,fm),old=await cache.get(key,{referenceDate:s.departureTime||now()});contextByKey.set(key,{segment:structuredClone(s),profile:p,seat,fm});if(old&&!old.stale&&!refresh)return {...old.quotes[0],trainNumber:s.trainNumber||null,cacheStatus:'verified-cache'};
    let raw=null,amount=null,info=null,failure=null;
    try{
      info=s.mode==='BUS'?await busRows(s,signal,refresh):s.mode==='BIKE'?null:await railRows(s,signal,refresh);
      if(info){raw=info.free?info.rows[0]:selectOfficialFare(info.rows,s,p,seat,fm);if(raw){amount=Number(raw.Price)*(info.sections||1);info.source=`TDX ${s.mode==='HSR'?'高鐵':s.mode==='TRA'?'臺鐵':s.railSystem||'公車'}官方票價`;}}
    }catch(e){if(signal?.aborted)throw e;failure=e.message;}
    if(amount===null&&['TRA','METRO'].includes(s.mode)&&fm==='single'){
      try{const quoted=await web.lookup(s,{signal,date:String(s.departureTime).slice(0,10),passengerType:p.type,seatClass:seat,fareMedia:fm,refresh});if(quoted){amount=quoted.amount;raw=quoted;info={row:{},rows:[],sourceUrl:quoted.sourceUrl,source:quoted.source,method:'official-web',effectiveFrom:quoted.effectiveFrom||null};}}catch(e){if(signal?.aborted)throw e;failure=e.message;}
    }
    if(amount===null&&['HSR','BIKE'].includes(s.mode)&&fm==='single'){try{const quoted=await extraWeb(s,p,seat,{signal,refresh});if(quoted){amount=quoted.amount;raw=quoted;info={row:{},sourceUrl:quoted.sourceUrl,source:quoted.source,method:'official-web'};}}catch(e){if(signal?.aborted)throw e;failure=e.message;}}
    if(amount!==null){
      const quote={operator:s.agency||s.operatorId||s.railSystem||s.mode,mode:s.mode,route:s.routeName||s.mode,trainNumber:s.trainNumber||null,vehicleType:s.transportType||null,seatClass:seat,passengerType:p.type,quantity:1,amount,currency:'TWD',fareType:fm,originStation:s.from.id||s.from.name,destinationStation:s.to.id||s.to.name,sourceType:info.method==='official-web'?'official-web':'official-api',source:info.source,sourceUrl:info.sourceUrl,sourceUpdatedAt:iso(info.row.SrcUpdateTime||info.row.UpdateTime),sourceTime:iso(info.row.SrcUpdateTime||info.row.UpdateTime),effectiveFrom:info.effectiveFrom||null,fetchedAt:new Date(now()).toISOString(),calculationMethod:info.method,confidence:'verified',ticketType:`${PASSENGER_NAMES[p.type]}${seat&&SEAT_NAMES[seat]?`／${SEAT_NAMES[seat]}`:''}`,notice:raw?.notice||null};
      const lookup=Object.fromEntries(['mode','railSystem','agency','operatorId','routeName','routeId','subRouteId','direction','busCity','busStops','transportType','trainClassStatus','bikeSystem','bikeSystems','bikeRegion','durationSeconds','departureTime'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));lookup.from=Object.fromEntries(['id','name','stopId','stopSequence'].filter(k=>s.from[k]!==undefined).map(k=>[k,s.from[k]]));lookup.to=Object.fromEntries(['id','name','stopId','stopSequence','bikeRegion'].filter(k=>s.to[k]!==undefined).map(k=>[k,s.to[k]]));
      const record={version:1,quotes:[quote],lookup,fetchedAt:quote.fetchedAt,effectiveFrom:quote.effectiveFrom,sourceUpdatedAt:quote.sourceUpdatedAt,contentHash:fareHash(raw?.contentHashInput||info.row),parserVersion:'fare-engine-1'};
      if(!officialFareSource(quote.sourceUrl))throw Error('非允許的官方票價來源');
      try{await cache.put(key,record);return quote;}catch(e){failure=e.message;}
    }
    if(old)return {...old.quotes[0],trainNumber:s.trainNumber||null,cacheStatus:'stale-verified',notice:`目前使用最近一次成功驗證的官方票價資料。最後驗證：${old.fetchedAt}。${failure||'官方來源目前未能通過驗證，未覆蓋快取。'}`};
    return {amount:null,currency:'TWD',passengerType:p.type,quantity:1,seatClass:seat,confidence:'unavailable',notice:unknown+(failure?` ${failure}`:'')};
  }
  async function quoteSegment(segment,preference={},options={}){
    const pref=normalizeFarePreference(preference),p=pref.modePreferences[segment.mode]||{};
    if(segment.mode==='WALK')return {amount:0,currency:'TWD',ticketType:'步行免票',source:'步行',quotes:pref.passengerProfiles.map(x=>({...x,passengerType:x.type,ticketType:`${PASSENGER_NAMES[x.type]}／步行免票`,amount:0,currency:'TWD'})),complete:true};
    if(segment.mode==='TRA'&&p.seatClasses.length===1&&p.seatClasses[0]==='premium'&&!/^自強\s*[(（]?3000/.test(segment.transportType))return {amount:null,complete:false,notice:'此班次沒有核實提供騰雲座艙'};
    if(segment.mode==='TRA'&&!vehicleAllowed(segment.transportType,segment.trainTypeId,p))return {amount:null,complete:false,notice:'班次車種不符合乘車偏好'};
    const seats=segment.mode==='HSR'?(p.seatClasses.length?p.seatClasses:['standard']):segment.mode==='TRA'?(p.seatClasses.length?p.seatClasses:['normal']):[null];
    if(segment.mode==='BIKE'){segment.bikeSystem=p.vehicleTypes[0]||'YouBike 2.0';if(!segment.bikeSystems?.includes(segment.bikeSystem))return {amount:null,complete:false,notice:'未核實租借系統與自行車類型，不推定公共自行車費率。'};}
    const fm=['BUS','METRO','LRT'].includes(segment.mode)?pref.fareMedia[0]||'single':'single';
    const choices=[];for(const seat of seats){if(segment.mode==='TRA'&&seat==='premium'&&!/3000/.test(segment.transportType))continue;const quotes=[];for(const profile of pref.passengerProfiles){options.signal?.throwIfAborted();let unit=await unitQuote(segment,profile,seat,fm,options);
      if(options.allowEstimates&&unit.amount===null){
        if(segment.mode==='TRA'&&seat!=='premium')try{const html=await webPage(TRA_FARE_URL,options),rules=parseTraRateRules(html);unit=estimateTraFare(segment,profile,seat,rules,{now:now()})||unit;
          if(unit.amount===null&&!['adult','child'].includes(profile.type)){const reference=estimateTraFare(segment,{type:'adult'},seat,rules,{now:now()});if(reference)unit={...reference,passengerType:profile.type,calculationMethod:'official-rate-adult-budget',estimateBasis:reference.estimateBasis+' 此乘客票種優惠未核實，暫按同段成人估算全票編列保守預算，不假設優惠資格。',notice:'估算預算，非此票種正式報價；實際票價及優惠資格以業者驗證為準。'};}
        }catch(error){options.signal?.throwIfAborted();}
        if(unit.amount===null&&profile.type!=='adult'){const adult=await unitQuote(segment,{type:'adult',quantity:1},seat,fm,options);unit=estimateFromAdult(adult,profile)||unit;}
      }
      quotes.push({...unit,ticketType:unit.estimated?`${PASSENGER_NAMES[profile.type]}${seat&&SEAT_NAMES[seat]?`／${SEAT_NAMES[seat]}`:''}`:unit.ticketType,quantity:profile.quantity,unitAmount:unit.amount,amount:unit.amount===null?null:Math.round(unit.amount*profile.quantity*100)/100});}const budgetComplete=quotes.every(q=>Number.isFinite(q.amount)),estimated=quotes.some(q=>q.estimated),complete=budgetComplete&&!estimated;choices.push({seatClass:seat,quotes,estimated,budgetComplete,complete,amount:budgetComplete?quotes.reduce((a,q)=>a+q.amount,0):null});}
    if(!choices.length)return {amount:null,complete:false,notice:'此班次未核實提供所選車廂，不套用不存在的票價'};
    const selected=options.preferCheapest?choices.filter(c=>c.complete).sort((a,b)=>a.amount-b.amount)[0]||choices[0]:choices[0],q=selected.quotes.find(q=>q.confidence==='verified')||{},notices=[...new Set(selected.quotes.map(q=>q.notice).filter(Boolean))];
    if(pref.passengerProfiles.some(p=>p.type!=='adult'))notices.push('實際優惠資格仍以運輸業者規定及現場驗證為準。');
    if(pref.allowDiscountFare)notices.push('優惠票價需視實際班次與購票條件確認；未核實適用條件時使用一般票價。');
    return {...q,...selected,currency:'TWD',amount:selected.amount,ticketType:selected.quotes.map(x=>`${PASSENGER_NAMES[x.passengerType]} × ${x.quantity}`).join('、'),alternatives:choices,notice:notices.join(' '),complete:selected.complete};
  }
  async function update({signal}={}){
    if(updateTask)return updateTask;updateTask=(async()=>{const entries=await cache.entries(),report=[];await metadataOptions({signal,refresh:true});const deadline=now()+60000;for(const entry of entries){signal?.throwIfAborted();if(now()>deadline){report.push({status:'deferred',notice:'其餘來源保留於下次背景更新'});break;}const context=contextByKey.get(entry.key);if(context){const q=await unitQuote(context.segment,context.profile,context.seat,context.fm,{signal,refresh:true});report.push({mode:context.segment.mode,status:q.cacheStatus==='stale-verified'?'kept-last-verified':q.confidence,notice:q.notice});}else{const q=entry.quotes[0],s=entry.lookup;if(s){const refreshed=await unitQuote(s,{type:q.passengerType,quantity:1},q.seatClass,q.fareType,{signal,refresh:true});report.push({mode:q.mode,status:refreshed.cacheStatus==='stale-verified'?'kept-last-verified':refreshed.confidence,notice:refreshed.notice});}else report.push({mode:q.mode,status:'kept-last-verified',notice:'舊快取缺少完整來源定位資料，保留最近成功資料'});}}return {...await cache.status(),report};})().finally(()=>updateTask=null);return updateTask;
  }
  async function sources({signal,modes=['TRA','HSR']}={}){
    const sources=[],targets=[];
    if(modes.includes('TRA'))targets.push({mode:'TRA',name:'臺鐵官方公開票價查詢／計算規則',url:TRA_FARE_URL});
    if(modes.includes('HSR'))targets.push({mode:'HSR',name:'台灣高鐵官方公開票價表',url:'https://en.thsrc.com.tw/ArticleContent/4c3efc1d-e6df-4bfd-97b4-52e89f79ee5c'});
    for(const target of targets){signal?.throwIfAborted();try{const html=await webPage(target.url,{signal}),at=pages.get(target.url)?.at;
      sources.push({name:target.name,mode:target.mode,sourceUrl:target.url,status:'已擷取官方公開頁面；特定起訖票價仍需驗證',fetchedAt:new Date(at||now()).toISOString(),contentHash:fareHash(html),notice:target.mode==='TRA'&&!parseTraRateRules(html)?'票價規則解析未通過，未以此頁產生金額。':'擷取遵守官方來源清單、robots 與快取頻率。'});
    }catch(error){signal?.throwIfAborted();sources.push({name:target.name,mode:target.mode,sourceUrl:target.url,status:'擷取未完成',notice:error.message});}}
    if(!targets.length)sources.push({name:'已登錄官方票價來源',sourceUrl:'https://tdx.transportdata.tw/',status:'目前允許運具需依營運系統、業者及起訖站查核，未任意抓取全網站',notice:'公車／捷運／輕軌及自行車會在已確認旅程的 Fare Engine 逐段查詢。'});
    return {sources};
  }
  // Startup only revalidates expired known sources, never crawls every operator.
  void cache.load().then(async()=>{const status=await cache.status();if(Object.values(status.modes).some(m=>m.stale))await update({signal:AbortSignal.timeout(65000)});}).catch(()=>{});
  return {quoteSegment,sources,metadata:metadataOptions,status:()=>cache.status(),update,configure:value=>cache.configure(value),cache};
}
export const defaultFareCacheFile=process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'GodsEyeTaiwan','fare-cache.json'):null;
